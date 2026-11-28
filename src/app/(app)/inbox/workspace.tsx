"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import type { listInbox, getInboxConversation } from "@/modules/inbox/service";
import { InboxAssistant } from "./assistant";
import { formatFinanceMoney } from "@/lib/finance-money";

type Inbox = Awaited<ReturnType<typeof listInbox>>;
type Thread = Awaited<ReturnType<typeof getInboxConversation>>;
const selectClass = "w-full rounded-md border border-input bg-background px-2 py-2 text-sm";
async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load inbox data.");
  return response.json();
}

export function InboxWorkspace({ initial, scope, canManage, canConfigure, members }: {
  initial?: string; scope: string; canManage: boolean; canConfigure: boolean; members: { id: string; user: { name: string | null } }[];
}) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState(initial ?? "");
  const [before, setBefore] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [tag, setTag] = useState("");
  const [mine, setMine] = useState(false);
  const [unread, setUnread] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const draftKey = useRef<{ fingerprint: string; requestKey: string } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const params = new URLSearchParams({ page: String(page), ...(search && { search }), ...(status && { status }),
    ...(priority && { priority }), ...(tag && { tag }), ...(mine && { mine: "true" }), ...(unread && { unread: "true" }), ...(snoozed && { showSnoozed: "true" }) });
  const list = useQuery({ queryKey: ["inbox", scope, params.toString()], queryFn: () => request<Inbox>(`/api/v1/inbox?${params}`), refetchInterval: 8000 });
  const thread = useQuery({
    queryKey: ["inbox-thread", scope, selected, before],
    queryFn: () => request<Thread>(`/api/v1/inbox/${selected}${before ? `?before=${before}` : ""}`),
    enabled: Boolean(selected), refetchInterval: before ? false : 5000,
  });
  const data = thread.data;
  const conversation = data?.conversation;
  function open(id: string) { setSelected(id); setBefore(""); setError(""); }
  async function mutate(method: "PATCH" | "POST", payload: object) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/v1/inbox/${selected}`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const response = await res.json().catch(() => null);
        throw new Error(response?.issues?.[0] ?? response?.error ?? "Could not save the change.");
      }
      await Promise.all([cache.invalidateQueries({ queryKey: ["inbox", scope] }), cache.invalidateQueries({ queryKey: ["inbox-thread", scope, selected] })]);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the change.");
      await cache.invalidateQueries({ queryKey: ["inbox-thread", scope, selected] });
      return false;
    } finally { setBusy(false); }
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversation || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = fields.get("body");
    const kind = fields.get("kind");
    const fingerprint = JSON.stringify([selected, body, kind]);
    if (draftKey.current?.fingerprint !== fingerprint) draftKey.current = { fingerprint, requestKey: crypto.randomUUID() };
    if (await mutate("POST", { body, kind, version: conversation.version, requestKey: draftKey.current.requestKey })) {
      draftKey.current = null;
      form.reset();
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <PageHeader title="Universal Inbox" description="Manage customer chats, email and internal notes in one workspace." />
      <div className="flex flex-wrap gap-2">
        {canConfigure && <Button asChild variant="outline"><Link href="/communications">Communication settings</Link></Button>}
        <Button asChild variant="outline"><Link href="/inbox/analytics">Communication analytics</Link></Button>
      </div>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader><CardTitle>Conversations</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input aria-label="Search conversations" value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email or subject" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <select aria-label="Filter by status" className={selectClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">All statuses</option>{["OPEN", "PENDING", "RESOLVED", "ARCHIVED"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select aria-label="Filter by priority" className={selectClass} value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
                <option value="">All priorities</option>{["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <Input aria-label="Filter by tag" value={tag} maxLength={40} onChange={(event) => { setTag(event.target.value); setPage(1); }} placeholder="Exact tag" />
            <div className="flex flex-wrap gap-3 text-sm">
              <Label><input type="checkbox" checked={mine} onChange={(event) => { setMine(event.target.checked); setPage(1); }} /> Assigned to me</Label>
              <Label><input type="checkbox" checked={unread} onChange={(event) => { setUnread(event.target.checked); setPage(1); }} /> Unread</Label>
              <Label><input type="checkbox" checked={snoozed} onChange={(event) => { setSnoozed(event.target.checked); setPage(1); }} /> Include snoozed</Label>
            </div>
            {list.isError && <p role="alert">The inbox could not be loaded.</p>}
            {list.isPending && <p role="status">Loading conversationsâ€¦</p>}
            {list.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No conversations match.</p>}
            <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
              {list.data?.items.map((item) => <li key={item.id}>
                <button type="button" aria-pressed={selected === item.id} onClick={() => open(item.id)}
                  className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted aria-pressed:bg-muted">
                  <span className="block break-words font-medium">{item.customerName || item.customerEmail || item.customerPhone || item.subject}</span>
                  <span className="text-xs text-muted-foreground">{item.channel} Â· {item.status.toLowerCase()}{item.unread ? ` Â· ${item.unread} unread` : ""}</span>
                </button>
              </li>)}
            </ul>
            <div className="flex gap-2">
              {page > 1 && <Button variant="outline" size="sm" onClick={() => setPage(page - 1)}>Previous</Button>}
              {list.data?.hasNext && <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>Next</Button>}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader><CardTitle>{conversation?.subject ?? "Conversation history"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!selected && <p className="text-sm text-muted-foreground">Select a conversation to read or reply.</p>}
            {thread.isError && <p role="alert">The conversation could not be loaded.</p>}
            {selected && thread.isPending && <p role="status">Loading conversationâ€¦</p>}
            {data && conversation && <>
              <div className="flex flex-wrap gap-2">
                {data.hasOlder && <Button variant="outline" size="sm" onClick={() => setBefore(data.messages[0].id)}>Older messages</Button>}
                {before && <Button variant="outline" size="sm" onClick={() => setBefore("")}>Latest messages</Button>}
                {canManage && conversation.unread > 0 && <Button disabled={busy} variant="outline" size="sm" onClick={() => void mutate("PATCH", { markRead: true })}>Mark read</Button>}
              </div>
              <ol className="max-h-[55vh] space-y-2 overflow-y-auto">
                {data.messages.map((message) => <li key={message.id} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{message.kind === "NOTE" ? "Internal note" : message.kind === "INBOUND" ? "Customer" : "Staff reply"} Â· {new Date(message.createdAt).toLocaleString()}{message.delivery ? ` Â· ${message.delivery.toLowerCase()}` : ""}</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                </li>)}
              </ol>
              {canManage && <form key={selected} onSubmit={reply} className="space-y-2">
                <Label className="grid gap-1">Message type<select name="kind" className={selectClass}>
                  {["OPEN", "PENDING"].includes(conversation.status) && ["CHAT", "EMAIL", "SMS"].includes(conversation.channel) && <option value="OUTBOUND">Customer reply</option>}
                  <option value="NOTE">Internal note</option>
                </select></Label>
                <Label className="grid gap-1">Message<textarea ref={composer} required rows={4} maxLength={6000} name="body" className="w-full rounded-md border bg-background p-2 text-sm" /></Label>
                <Button type="submit" disabled={busy}>Send message</Button>
              </form>}
              {canManage && <InboxAssistant key={selected} conversation={selected} onDraft={(text) => {
                if (composer.current && (!composer.current.value || window.confirm("Replace the current draft?"))) {
                  composer.current.value = text;
                  composer.current.focus();
                }
              }} />}
            </>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
        <Card className="min-w-0 lg:col-span-2 xl:col-span-1">
          <CardHeader><CardTitle>Customer context</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!conversation && <p className="text-muted-foreground">Customer information appears here when a conversation is selected.</p>}
            {conversation && <>
              <p className="break-words">{conversation.customerName || "Anonymous visitor"}</p>
              {conversation.customerPhone && <p>{conversation.customerPhone}</p>}
              {conversation.customerEmail && <p className="break-all text-muted-foreground">{conversation.customerEmail} Â· unverified sender address</p>}
              {data.contact && <p>CRM contact Â· {data.contact.firstName} {data.contact.lastName}</p>}
              {data.company && <p className="break-words">{data.company.name}</p>}
              {Boolean(data.opportunities.length) && <div><p className="font-medium">Open opportunities</p>{data.opportunities.map((item) => <p key={item.id}>{item.name}</p>)}</div>}
              {Boolean(data.projects.length) && <div><p className="font-medium">Active projects</p>{data.projects.map((item) => <p key={item.id}>{item.name}</p>)}</div>}
              {Boolean(data.tickets.length) && <div><p className="font-medium">Support tickets</p>{data.tickets.map((item) => <p key={item.id}>{item.reference} Â· {item.subject}</p>)}</div>}
              {Boolean(data.invoices.length) && <div><p className="font-medium">Outstanding invoices</p>{data.invoices.map((item) => <p key={item.id}>
                <Link href={`/invoices/${item.id}`} className="underline">Invoice {item.invoiceNumber}</Link> Â· {formatFinanceMoney(item.balanceDueMinor, item.currency)}
              </p>)}</div>}
              {Boolean(data.previous.length) && <div><p className="font-medium">Previous conversations</p>{data.previous.map((item) =>
                <Button key={item.id} variant="link" onClick={() => open(item.id)}>{item.subject} Â· {new Date(item.updatedAt).toLocaleDateString()}</Button>)}</div>}
              {canManage && <>
                <Button asChild variant="outline" size="sm"><Link href={`/calendar?conversation=${conversation.id}`}>Create appointment</Link></Button>
                <Label className="grid gap-1">Status<select disabled={busy} className={selectClass} value={conversation.status} onChange={(event) => void mutate("PATCH", { status: event.target.value })}>
                  {["OPEN", "PENDING", "RESOLVED", "ARCHIVED"].map((item) => <option key={item}>{item}</option>)}
                </select></Label>
                <Label className="grid gap-1">Priority<select disabled={busy} className={selectClass} value={conversation.priority} onChange={(event) => void mutate("PATCH", { priority: event.target.value })}>
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{item}</option>)}
                </select></Label>
                <Label className="grid gap-1">Assignee<select disabled={busy} className={selectClass} value={conversation.assigneeId ?? ""} onChange={(event) => void mutate("PATCH", { assigneeId: event.target.value || null })}>
                  <option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.name || "Staff member"}</option>)}
                </select></Label>
                <form key={`${selected}:${conversation.tags.join(",")}`} className="space-y-2" onSubmit={(event) => {
                  event.preventDefault();
                  const value = String(new FormData(event.currentTarget).get("tags") ?? "");
                  void mutate("PATCH", { tags: value.split(",").map((item) => item.trim()).filter(Boolean) });
                }}><Label className="grid gap-1">Tags (comma separated)<Input name="tags" defaultValue={conversation.tags.join(", ")} /></Label>
                  <Button type="submit" disabled={busy} variant="outline" size="sm">Save tags</Button></form>
                <Button disabled={busy} variant="outline" size="sm" onClick={() => void mutate("PATCH", { snoozedUntil: conversation.snoozedUntil && new Date(conversation.snoozedUntil) > new Date() ? null : new Date(Date.now() + 3600_000).toISOString() })}>
                  {conversation.snoozedUntil && new Date(conversation.snoozedUntil) > new Date() ? "End snooze" : "Snooze for one hour"}
                </Button>
              </>}
            </>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
