import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerOwner } from "@/modules/identity/service";
import type { ActiveMembership } from "@/core/tenancy";
import { findPublicWidget, runChatAction, saveWidget } from "@/modules/inbox/chat";
import { getInboxConversation, listInbox, replyToConversation, updateInboxConversation } from "@/modules/inbox/service";
import { membershipIdFor } from "../helpers/membership";

const owners: ActiveMembership[] = [];
async function owner(): Promise<ActiveMembership> {
  const id = randomUUID();
  const result = await registerOwner({ name: "Inbox test owner", email: `inbox-${id}@test.clientos.invalid`,
    password: "password123", organisationName: `Inbox ${id}` });
  const acting = { userId: result.userId, organisationId: result.organisationId,
    membershipId: await membershipIdFor(result.userId, result.organisationId), role: "ORGANISATION_OWNER" as const };
  owners.push(acting);
  return acting;
}
afterAll(async () => {
  for (const item of owners) {
    await prisma.auditLog.deleteMany({ where: { organisationId: item.organisationId } });
    await prisma.organisation.delete({ where: { id: item.organisationId } });
    await prisma.user.delete({ where: { id: item.userId } });
  }
});

it("keeps widget sessions, conversation records and internal notes isolated", async () => {
  const [staff, other] = await Promise.all([owner(), owner()]);
  const config = { name: "Test chat", welcome: "Ask our team", colour: "#155e75",
    origins: ["https://customer.example"], privacyNotice: "Use the chat for enquiries.", enabled: true, position: "right" as const };
  const widget = await saveWidget(staff, config);
  const foreignWidget = await saveWidget(other, config);
  await expect(findPublicWidget(widget.publicKey, "https://other.example")).rejects.toThrow(/unavailable/);
  const session = await runChatAction(widget, { action: "start", body: "<img src=x> greeting", email: "client@example.test" });
  if (!("token" in session) || !session.token) throw new Error("Missing visitor session.");
  const token = session.token;
  await expect(runChatAction(foreignWidget, { action: "poll", token })).rejects.toThrow(/unavailable/);
  const before = await listInbox(staff, { page: 1 });
  const [thread] = before.items;
  expect(thread.unread).toBe(1);
  expect((await listInbox(other, { page: 1 })).items).toEqual([]);
  await expect(getInboxConversation(other, thread.id)).rejects.toThrow(/not found/);
  await expect(getInboxConversation({ ...staff, role: "CLIENT_USER" }, thread.id)).rejects.toThrow(/permission/);
  await expect(updateInboxConversation(staff, thread.id, { assigneeId: other.membershipId })).rejects.toThrow(/not found/);
  await updateInboxConversation(staff, thread.id, { assigneeId: staff.membershipId, priority: "URGENT", tags: ["enquiry"], markRead: true });
  expect((await listInbox(staff, { page: 1, tag: "enquiry", mine: true })).items[0].unread).toBe(0);

  await replyToConversation(staff, thread.id, { requestKey: randomUUID(), version: thread.version, kind: "NOTE", body: "staff only" });
  const requestKey = randomUUID();
  const posted = await replyToConversation(staff, thread.id, { requestKey, version: thread.version + 1, kind: "OUTBOUND", body: "Hello visitor" });
  const replay = await replyToConversation(staff, thread.id, { requestKey, version: thread.version + 1, kind: "OUTBOUND", body: "Hello visitor" });
  expect(replay.id).toBe(posted.id);
  await expect(replyToConversation(staff, thread.id, { requestKey: randomUUID(), version: thread.version + 1, kind: "OUTBOUND", body: "stale" })).rejects.toHaveProperty("issues");
  expect(await runChatAction(widget, { action: "poll", token })).toMatchObject({
    messages: [{ body: "<img src=x> greeting" }, { body: "Hello visitor" }],
  });
  const inbound = { action: "message" as const, token, body: "Thank you", requestKey: randomUUID() };
  await Promise.all([runChatAction(widget, inbound), runChatAction(widget, inbound)]);
  const saved = await getInboxConversation(staff, thread.id);
  expect(saved.messages).toHaveLength(4);
  expect(saved.conversation.unread).toBe(1);
  await updateInboxConversation(staff, thread.id, { status: "RESOLVED" });
  expect(await runChatAction(widget, { action: "poll", token })).toMatchObject({ closed: true });
  await expect(runChatAction(widget, { ...inbound, requestKey: randomUUID() })).rejects.toHaveProperty("issues");
  await prisma.chatVisitor.updateMany({ where: { conversationId: thread.id }, data: { expiresAt: new Date(0) } });
  await expect(runChatAction(widget, { action: "poll", token })).rejects.toThrow(/unavailable/);
});
