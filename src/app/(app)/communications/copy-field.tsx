"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const id = useId();
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied.");
    } catch {
      setStatus("Select and copy the value manually.");
    }
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? <textarea id={id} readOnly className="min-h-20 rounded-md border bg-background p-2 font-mono text-sm" value={value} />
        : <Input id={id} readOnly value={value} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>Copy {label.toLowerCase()}</Button>
        <span className="text-sm text-muted-foreground" role="status">{status}</span>
      </div>
    </div>
  );
}
