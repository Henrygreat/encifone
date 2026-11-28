import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function CommunicationAnalytics({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.INBOX_VIEW)) notFound();
  const params = await searchParams;
  const date = (value: unknown, fallback: Date) =>
    typeof value === "string" && z.iso.date().safeParse(value).success ? new Date(value) : fallback;
  const today = new Date();
  const from = date(params.from, new Date(today.getTime() - 30 * 86_400_000));
  const to = new Date(date(params.to, new Date(today.toISOString().slice(0, 10))).getTime() + 86_400_000);
  const channel = z.enum(["CHAT", "EMAIL", "SMS", "WHATSAPP"]).safeParse(params.channel).data;
  const members = await prisma.membership.findMany({
    where: { organisationId: acting.organisationId, status: "ACTIVE" }, select: { id: true, user: { select: { name: true } } },
  });
  const staff = members.find((member) => member.id === params.staff)?.id;
  const conditions = Prisma.sql`"organisationId" = ${acting.organisationId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
    ${channel ? Prisma.sql`AND "channel"::text = ${channel}` : Prisma.empty}
    ${staff ? Prisma.sql`AND "assigneeId" = ${staff}` : Prisma.empty}`;
  const [rows, channels, workload] = await Promise.all([
    prisma.$queryRaw<{ total: number; unread: number; open: number; resolved: number; reply: number | null; resolution: number | null }[]>`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE unread > 0)::int AS unread,
        COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open,
        COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
        AVG(EXTRACT(EPOCH FROM ("firstReplyAt" - "createdAt")))::float8 AS reply,
        AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))::float8 AS resolution
      FROM "InboxConversation" WHERE ${conditions}`,
    prisma.$queryRaw<{ channel: string; count: number }[]>`SELECT "channel"::text, COUNT(*)::int AS count FROM "InboxConversation" WHERE ${conditions} GROUP BY "channel"`,
    prisma.$queryRaw<{ assigneeId: string | null; count: number }[]>`
      SELECT "assigneeId", COUNT(*)::int AS count FROM "InboxConversation" WHERE ${conditions}
        AND status IN ('OPEN','PENDING') GROUP BY "assigneeId" ORDER BY count DESC`,
  ]);
  const [data] = rows;
  const time = (seconds: number | null) => seconds === null ? "No recorded events" : `${(seconds / 60).toFixed(1)} minutes`;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Communication analytics" description="Conversation activity by creation date (UTC)." />
      <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Label className="grid gap-1">From<Input name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} /></Label>
        <Label className="grid gap-1">Through<Input name="to" type="date" defaultValue={new Date(to.getTime() - 86_400_000).toISOString().slice(0, 10)} /></Label>
        <Label className="grid gap-1">Channel<select className="rounded-md border bg-background p-2" name="channel" defaultValue={channel ?? ""}><option value="">All</option><option value="CHAT">Website chat</option></select></Label>
        <Label className="grid gap-1">Assigned staff<select className="rounded-md border bg-background p-2" name="staff" defaultValue={staff ?? ""}><option value="">All</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.name || "Staff member"}</option>)}</select></Label>
        <Button type="submit">Apply filters</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries({ "Total conversations": data.total, Unread: data.unread, Open: data.open, Resolved: data.resolved, "Average first reply": time(data.reply), "Average resolution": time(data.resolution) }).map(([label, value]) =>
          <Card key={label}><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent>{value}</CardContent></Card>)}
        <Card><CardHeader><CardTitle>Conversations by channel</CardTitle></CardHeader><CardContent>
          {!channels.length && <p>No conversations in this period.</p>}
          {channels.map((item) => <p key={item.channel}>{item.channel === "CHAT" ? "Website chat" : item.channel} · {item.count}</p>)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Staff workload</CardTitle></CardHeader><CardContent>
          {!workload.length && <p>No open or pending conversations.</p>}
          {workload.map((item) => <p key={item.assigneeId ?? "unassigned"}>{item.assigneeId ? members.find((member) => member.id === item.assigneeId)?.user.name ?? "Staff member" : "Unassigned"} · {item.count}</p>)}
        </CardContent></Card>
      </div>
    </div>
  );
}
