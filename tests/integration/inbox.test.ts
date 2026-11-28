import { randomUUID } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import { registerOwner } from "@/modules/identity/service";
import type { ActiveMembership } from "@/core/tenancy";
import { findPublicWidget, runChatAction, saveWidget } from "@/modules/inbox/chat";
import { getInboxConversation, listInbox, replyToConversation, updateInboxConversation } from "@/modules/inbox/service";
import { membershipIdFor } from "../helpers/membership";
import { configureMailbox, InvalidMailWebhook, listMailboxes, manageMailbox, receiveMailboxEvent } from "@/modules/inbox/email";
import { cancelAppointment, listAppointments, saveAppointment, sendDueAppointmentReminders } from "@/modules/inbox/appointments";

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

it("serialises conflicting staff bookings and delivers reminders only for active bookings", async () => {
  const [staff, other] = await Promise.all([owner(), owner()]);
  const start = new Date(Date.now() + 30 * 60_000);
  const common = { staffId: staff.membershipId, title: "Appointment test", category: "Consultation",
    startsAt: start.toISOString(), minutes: 30, bufferMinutes: 10, remindMinutes: 45 };
  await expect(saveAppointment(other, common)).rejects.toThrow(/not found/);
  const concurrent = await Promise.allSettled([saveAppointment(staff, common), saveAppointment(staff, common)]);
  expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const range = { from: new Date().toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() };
  const [appointment] = (await listAppointments(staff, range)).items;
  expect((await listAppointments(other, range)).items).toEqual([]);
  await expect(cancelAppointment(other, appointment.id)).rejects.toThrow(/not found/);
  const duringBuffer = new Date(+start + 35 * 60_000).toISOString();
  await expect(saveAppointment(staff, { ...common, startsAt: duringBuffer })).rejects.toHaveProperty("issues");
  await cancelAppointment(staff, appointment.id);
  const replacement = await saveAppointment(staff, common);
  await Promise.all([sendDueAppointmentReminders(), sendDueAppointmentReminders()]);
  expect(await prisma.notification.count({
    where: { organisationId: staff.organisationId, recipientMembershipId: staff.membershipId, title: "Upcoming appointment" },
  })).toBe(1);
  expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).remindedAt).toBeNull();
  expect((await prisma.appointment.findUniqueOrThrow({ where: { id: replacement.id } })).remindedAt).toBeInstanceOf(Date);
});

it("authenticates mail events, deduplicates messages and records confirmed sends using a mocked provider", async () => {
  const [staff, other] = await Promise.all([owner(), owner()]);
  const address = "support@example.test";
  const apiKey = "re_local_mock_only";
  const webhook = `whsec_${Buffer.from("inbox-local-signature-secret").toString("base64")}`;
  await configureMailbox(staff, { address, apiKey, webhook });
  const [mailbox] = await listMailboxes(staff);
  expect(mailbox).not.toHaveProperty("encryptedApiKey");
  expect((await prisma.inboxMailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).encryptedApiKey).not.toContain(apiKey);
  expect(await listMailboxes(other)).toEqual([]);
  await expect(manageMailbox(other, mailbox.id, "disconnect")).rejects.toThrow(/not found/);
  const inboundId = randomUUID();
  const outboundId = randomUUID();
  const provider = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).endsWith(inboundId)) return Response.json({
      id: inboundId, from: "Customer <visitor@example.test>", to: [address], subject: "Support request",
      text: "A real message from the local fixture", message_id: "<test@example.test>",
    });
    expect(options?.method).toBe("POST");
    expect(options?.body).toContain("In-Reply-To");
    return Response.json({ id: outboundId });
  });
  vi.stubGlobal("fetch", provider);
  const signed = (type: string, id: string) => {
    const body = JSON.stringify({ type, data: { email_id: id } });
    const timestamp = new Date();
    const eventId = randomUUID();
    return { body, headers: new Headers({ "svix-id": eventId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": new Webhook(webhook).sign(eventId, timestamp, body),
    }) };
  };
  try {
    const inbound = signed("email.received", inboundId);
    await expect(receiveMailboxEvent(mailbox.publicKey, inbound.body + " ", inbound.headers)).rejects.toBeInstanceOf(InvalidMailWebhook);
    expect(provider).not.toHaveBeenCalled();
    await Promise.all([receiveMailboxEvent(mailbox.publicKey, inbound.body, inbound.headers), receiveMailboxEvent(mailbox.publicKey, inbound.body, inbound.headers)]);
    const inbox = await listInbox(staff, { page: 1 });
    expect(inbox.items).toHaveLength(1);
    const [conversation] = inbox.items;
    expect(conversation).toMatchObject({ unread: 1, channel: "EMAIL", customerEmail: "visitor@example.test" });
    const reply = { kind: "OUTBOUND" as const, body: "Here is the answer.", requestKey: randomUUID(), version: conversation.version };
    expect(await replyToConversation(staff, conversation.id, reply)).toMatchObject({ delivery: "ACCEPTED" });
    await replyToConversation(staff, conversation.id, reply);
    expect(provider.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    const delivered = signed("email.delivered", outboundId);
    await receiveMailboxEvent(mailbox.publicKey, delivered.body, delivered.headers);
    expect((await getInboxConversation(staff, conversation.id)).messages.at(-1)).toMatchObject({ delivery: "DELIVERED" });
    await manageMailbox(staff, mailbox.id, "disconnect");
    await expect(receiveMailboxEvent(mailbox.publicKey, inbound.body, inbound.headers)).rejects.toThrow(/not found/);
  } finally { vi.unstubAllGlobals(); }
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
