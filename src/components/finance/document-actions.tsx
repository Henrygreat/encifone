"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FinanceAction({
  endpoint,
  method = "POST",
  label,
  queryKey,
  payload,
}: {
  endpoint: string;
  method?: string;
  label: string;
  queryKey: string;
  payload?: object;
}) {
  const { submit, pending, error } = useFinanceMutation(endpoint, queryKey);
  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => void submit(payload, method)}
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function useFinanceMutation(endpoint: string, queryKey: string) {
  const client = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(payload?: object, method = "POST") {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method,
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.issues?.join(" ") ||
            result?.error ||
            "The finance action failed.",
        );
      }
      await client.invalidateQueries({ queryKey: [queryKey] });
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "The finance action failed.",
      );
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { submit, pending, error };
}

export function FinanceDocumentForm({
  kind,
}: {
  kind: "estimates" | "invoices";
}) {
  const { submit, pending, error } = useFinanceMutation(
    `/api/v1/${kind}`,
    kind,
  );
  const creationKey = useRef<string | undefined>(undefined);
  const [lineCount, setLineCount] = useState(1);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const text = (name: string) => String(fields.get(name) ?? "").trim();
    const lines = Array.from({ length: lineCount }, (_, i) => ({
      description: text(`description-${i}`),
      quantity: Number(text(`quantity-${i}`)),
      unitPriceMinor: Number(text(`amount-${i}`)),
      taxRateBps: Number(text(`tax-${i}`)),
    }));
    creationKey.current ??= crypto.randomUUID();
    const created = await submit({
      ...(kind === "estimates"
        ? { title: text("title") }
        : {
            creationKey: creationKey.current,
            timeEntryId: text("timeEntryId") || undefined,
            serviceRequestId: text("serviceRequestId") || undefined,
          }),
      clientId: text("clientId") || undefined,
      currency: text("currency") || undefined,
      lines,
    });
    if (created) {
      creationKey.current = undefined;
      form.reset();
      setLineCount(1);
    }
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        New {kind === "estimates" ? "estimate" : "invoice"}
      </summary>
      <form className="mt-4 space-y-4" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === "estimates" && (
            <Label className="grid gap-2">
              Title
              <Input name="title" required maxLength={200} />
            </Label>
          )}
          <Label className="grid gap-2">
            Client ID (optional)
            <Input name="clientId" />
          </Label>
          <Label className="grid gap-2">
            Currency code
            <Input
              name="currency"
              maxLength={3}
              placeholder="Organisation default"
            />
          </Label>
          {kind === "invoices" && (
            <>
              <Label className="grid gap-2">
                Approved time entry ID (optional)
                <Input name="timeEntryId" />
              </Label>
              <Label className="grid gap-2">
                Resolved service request ID (optional)
                <Input name="serviceRequestId" />
              </Label>
            </>
          )}
        </div>
        {Array.from({ length: lineCount }, (_, i) => (
          <fieldset
            key={i}
            className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <legend className="px-1 text-sm">Line {i + 1}</legend>
            <Label className="grid gap-2">
              Description
              <Input name={`description-${i}`} maxLength={500} required />
            </Label>
            <Label className="grid gap-2">
              Quantity
              <Input
                name={`quantity-${i}`}
                type="number"
                min={1}
                defaultValue={1}
                required
              />
            </Label>
            <Label className="grid gap-2">
              Unit price (minor units)
              <Input
                name={`amount-${i}`}
                type="number"
                min={0}
                step={1}
                required
              />
            </Label>
            <Label className="grid gap-2">
              Tax (basis points)
              <Input
                name={`tax-${i}`}
                type="number"
                min={0}
                max={10000}
                defaultValue={0}
              />
            </Label>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLineCount((value) => value + 1)}
            disabled={lineCount >= 200}
          >
            Add line
          </Button>
          {lineCount > 1 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLineCount((value) => value - 1)}
            >
              Remove last line
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            Save draft
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}

export function InvoicePaymentForm({
  id,
  currency,
  balance,
}: {
  id: string;
  currency: string;
  balance: number;
}) {
  const { submit, pending, error } = useFinanceMutation(
    `/api/v1/invoices/${id}/payments`,
    "invoices",
  );
  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (
      await submit({
        currency,
        amountMinor: Number(fields.get("amount")),
        externalReference: fields.get("reference"),
        method: fields.get("method"),
      })
    )
      form.reset();
  }
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-medium">Record payment</summary>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={record}>
        <Label className="grid gap-2">
          Amount ({currency} minor units)
          <Input type="number" name="amount" min={1} max={balance} required />
        </Label>
        <Label className="grid gap-2">
          External reference
          <Input name="reference" maxLength={200} required />
        </Label>
        <Label className="grid gap-2">
          Payment method
          <select
            name="method"
            className="rounded-md border bg-background px-2 py-2"
          >
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CARD">Card</option>
            <option value="CASH">Cash</option>
            <option value="OTHER">Other</option>
          </select>
        </Label>
        <Button
          className="self-end justify-self-start"
          disabled={pending}
          type="submit"
        >
          Record payment
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
