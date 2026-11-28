"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { listAppointments } from "@/modules/inbox/appointments";

type Appointments = Awaited<ReturnType<typeof listAppointments>>;
type Entry = Appointments["items"][number];
const localDate = (value: Date) => new Date(+value - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const modes = ["Day", "Week", "Month", "Agenda"] as const;
type Mode = (typeof modes)[number];

export function AppointmentCalendar({ conversationId, scope, canManage }: { conversationId?: string; scope: string; canManage: boolean }) {
  const [mode, setMode] = useState<Mode>("Agenda");
  const [anchor, setAnchor] = useState(() => localDate(new Date()).slice(0, 10));
  const [edit, setEdit] = useState<Entry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const from = new Date(`${anchor}T00:00:00`);
  if (mode === "Week") from.setDate(from.getDate() - (from.getDay() + 6) % 7);
  if (mode === "Month") from.setDate(1);
  const to = new Date(from);
  if (mode === "Month") to.setMonth(to.getMonth() + 1);
  else to.setDate(to.getDate() + (mode === "Day" ? 1 : mode === "Week" ? 7 : 60));
  const query = useQuery({
    queryKey: ["appointments", scope, from.toISOString(), to.toISOString()],
    queryFn: async (): Promise<Appointments> => {
      const response = await fetch(`/api/v1/appointments?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`);
      if (!response.ok) throw new Error("Could not load appointments.");
      return response.json();
    },
  });
  async function change(method: "POST" | "PATCH" | "DELETE", id?: string, data?: object) {
    setSaving(true); setError("");
    try {
      const result = await fetch(`/api/v1/appointments${id ? `/${id}` : ""}`, {
        method, headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined,
      });
      if (!result.ok) {
        const details = await result.json().catch(() => null);
        throw new Error(details?.issues?.[0] ?? details?.error ?? "Could not update the appointment.");
      }
      await query.refetch();
      setEdit(null);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Appointment could not be changed."); return false; }
    finally { setSaving(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const startsAt = new Date(String(values.get("startsAt")));
    if (Number.isNaN(+startsAt)) { setError("Choose a start date and time."); return; }
    const saved = await change(edit ? "PATCH" : "POST", edit?.id, {
      title: values.get("title"), category: values.get("category"), staffId: values.get("staffId"), startsAt: startsAt.toISOString(),
      minutes: Number(values.get("minutes")), bufferMinutes: Number(values.get("bufferMinutes")),
      remindMinutes: Number(values.get("remindMinutes")), conversationId: edit?.conversationId ?? conversationId,
    });
    if (saved) { form.reset(); setAnchor(localDate(startsAt).slice(0, 10)); }
  }
  const groups = new Map<string, Entry[]>();
  for (const item of query.data?.items ?? []) {
    const day = new Date(item.startsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  const control = "w-full rounded-md border bg-background p-2";
  return <Card>
    <CardHeader><CardTitle>Appointments</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {modes.map((item) => <Button key={item} aria-pressed={mode === item} variant={mode === item ? "default" : "outline"} onClick={() => setMode(item)}>{item}</Button>)}
        <Label className="grid gap-1">Calendar date<Input type="date" value={anchor} onChange={(event) => { if (event.target.value) setAnchor(event.target.value); }} /></Label>
      </div>
      <p className="text-sm text-muted-foreground">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      {query.isError && <p role="alert">Could not load appointments.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {canManage && <details key={edit?.id ?? "new"} open={Boolean(edit || conversationId) || undefined} className="rounded-md border p-3">
        <summary className="cursor-pointer">{edit ? "Reschedule appointment" : "New appointment"}</summary>
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
          {conversationId && !edit && <p className="text-sm sm:col-span-2">This appointment will be linked to the inbox conversation.</p>}
          <Label className="grid gap-1">Appointment title<Input name="title" defaultValue={edit?.title} required maxLength={160} /></Label>
          <Label className="grid gap-1">Appointment type<Input name="category" defaultValue={edit?.category} required maxLength={60} /></Label>
          <Label className="grid gap-1">Staff member<select name="staffId" className={control} defaultValue={edit?.staffId ?? ""} required>
            <option value="">Choose staff</option>{query.data?.staff.map((member) => <option key={member.id} value={member.id}>{member.user.name || "Staff member"}</option>)}
          </select></Label>
          <Label className="grid gap-1">Start time<Input name="startsAt" type="datetime-local" defaultValue={edit ? localDate(new Date(edit.startsAt)) : undefined} required /></Label>
          <Label className="grid gap-1">Duration (minutes)<Input name="minutes" type="number" min={5} max={480} defaultValue={edit ? (+new Date(edit.endsAt) - +new Date(edit.startsAt)) / 60_000 : 30} required /></Label>
          <Label className="grid gap-1">Buffer after (minutes)<Input name="bufferMinutes" type="number" min={0} max={120} defaultValue={edit?.bufferMinutes ?? 0} required /></Label>
          <Label className="grid gap-1">Staff reminder (minutes before, 0 to disable)<Input name="remindMinutes" type="number" min={0} max={1440} defaultValue={edit ? edit.reminderAt ? (+new Date(edit.startsAt) - +new Date(edit.reminderAt)) / 60_000 : 0 : 15} required /></Label>
          <div className="flex items-end gap-2"><Button type="submit" disabled={saving}>Save appointment</Button>
            {edit && <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Stop editing</Button>}</div>
        </form>
      </details>}
      {query.isPending && <p role="status">Loading appointments…</p>}
      {query.data && !groups.size && <p className="text-sm text-muted-foreground">No appointments in this date range.</p>}
      {query.data?.capped && <p className="text-sm">Showing the first 500 appointments. Narrow the date range to see other appointments.</p>}
      <div className={mode === "Month" || mode === "Week" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
        {[...groups].map(([day, items]) => <section key={day} className="min-w-0 space-y-2 rounded-md border p-3">
          <h3 className="font-medium">{day}</h3>
          {items.map((item) => <div key={item.id} className="space-y-1 border-t pt-2 text-sm">
            <p className="break-words font-medium">{item.title}</p>
            <p className="text-muted-foreground">{new Date(item.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {item.category}</p>
            {canManage && <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => setEdit(item)}>Reschedule</Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => {
                if (window.confirm("Cancel this appointment?")) void change("DELETE", item.id);
              }}>Cancel appointment</Button>
            </div>}
          </div>)}
        </section>)}
      </div>
    </CardContent>
  </Card>;
}
