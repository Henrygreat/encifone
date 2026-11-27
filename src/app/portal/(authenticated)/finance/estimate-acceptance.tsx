"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EstimateAcceptance({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function accept() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(`/api/portal/finance/estimates/${id}/accept`, { method: "POST" });
      if (!response.ok) throw new Error("Estimate acceptance failed.");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button disabled={pending} onClick={accept}>{pending ? "Accepting…" : "Accept estimate"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">Could not accept this estimate.</p>}
    </div>
  );
}
