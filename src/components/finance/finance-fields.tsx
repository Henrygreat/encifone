"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFinanceMutation } from "./document-actions";

interface Field {
  name: string;
  label: string;
  type?: "number" | "date";
  options?: string[];
  optional?: boolean;
  min?: number;
  initial?: number;
}

export function FinanceFields({ label, endpoint, queryKey, fields, method }: {
  label: string;
  endpoint: string;
  queryKey: string;
  fields: Field[];
  method?: "PATCH";
}) {
  const { submit, pending, error } = useFinanceMutation(endpoint, queryKey);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = Object.fromEntries(fields.flatMap((field) => {
      const value = String(data.get(field.name) ?? "").trim();
      return value ? [[field.name, field.type === "number" ? Number(value) : value]] : [];
    }));
    if (await submit(payload, method)) form.reset();
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">{label}</summary>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={save}>
        {fields.map((field) => (
          <Label key={field.name} className="grid gap-2">
            {field.label}{field.optional ? " (optional)" : ""}
            {field.options ? (
              <select name={field.name} className="rounded-md border bg-background px-2 py-2">
                {field.options.map((option) => <option key={option} value={option}>{option.toLowerCase().replaceAll("_", " ")}</option>)}
              </select>
            ) : (
              <Input name={field.name} type={field.type} min={field.type === "number" ? field.min ?? 0 : undefined} defaultValue={field.initial} required={!field.optional} />
            )}
          </Label>
        ))}
        <Button className="justify-self-start" type="submit" disabled={pending}>Save</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </details>
  );
}
