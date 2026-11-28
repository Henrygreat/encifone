"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const actions = {
  reply: "Draft a reply", summary: "Summarise conversation", sentiment: "Assess sentiment",
  next: "Suggest next actions", rewrite: "Rewrite a draft", translation: "Translate a draft",
  classification: "Classify conversation", qualification: "Suggest lead qualification",
  urgency: "Assess urgency", knowledge: "Suggest knowledge articles",
} as const;

export function InboxAssistant({ conversation, onDraft }: { conversation: string; onDraft: (text: string) => void }) {
  const [task, setTask] = useState<keyof typeof actions>("reply");
  const [usedTask, setUsedTask] = useState<keyof typeof actions>("reply");
  const [pending, setPending] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const draft = task === "rewrite" || task === "translation";
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true); setText(""); setError(""); setUsedTask(task);
    try {
      const response = await fetch(`/api/v1/inbox/${conversation}/assistant`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, tone: fields.get("tone"), draft: fields.get("draft") ?? undefined, language: fields.get("language") ?? undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.issues?.[0] ?? result.error ?? "Could not generate a suggestion.");
      if (result.state !== "available") { setError("AI is unavailable. Check the organisation’s AI provider settings or try again later."); return; }
      setText(result.text);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate a suggestion."); }
    finally { setPending(false); }
  }
  const select = "rounded-md border bg-background p-2";
  return <details className="space-y-3 rounded-md border p-3">
    <summary className="cursor-pointer">AI communication assistant</summary>
    <p className="text-sm text-muted-foreground">The configured AI provider processes the conversation or draft you submit. Review all suggestions before sending.</p>
    <form onSubmit={request} className="grid gap-2 sm:grid-cols-2">
      <Label className="grid gap-1">Task<select className={select} value={task} onChange={(event) => setTask(event.target.value as keyof typeof actions)}>
        {Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Label>
      <Label className="grid gap-1">Tone<select className={select} name="tone">
        {["Professional", "Friendly", "Formal", "Concise", "Empathetic"].map((tone) => <option key={tone}>{tone}</option>)}
      </select></Label>
      {draft && <Label className="grid gap-1 sm:col-span-2">Draft<textarea name="draft" required maxLength={6000} rows={4} className="rounded-md border bg-background p-2" /></Label>}
      {task === "translation" && <Label className="grid gap-1">Target language<Input name="language" required maxLength={50} /></Label>}
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">{pending ? "Generating…" : "Generate suggestion"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {text && <div aria-live="polite" className="space-y-2">
      <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
      {["reply", "rewrite", "translation"].includes(usedTask) &&
        <Button variant="outline" size="sm" onClick={() => onDraft(text)}>Use as draft</Button>}
    </div>}
  </details>;
}
