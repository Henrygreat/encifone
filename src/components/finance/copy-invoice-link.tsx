"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyInvoiceLink({ url }: { url: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Select the link to copy it manually.");
    }
  }
  return (
    <div className="space-y-1">
      <Button variant="outline" onClick={copy}>
        Copy secure link
      </Button>
      {status && (
        <p className="text-sm text-muted-foreground" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
