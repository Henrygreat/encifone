"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BentoEmptyState } from "@/components/bento/bento-grid";

interface ClientDocument {
  id: string;
  originalFilename: string;
  category: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  uploadedByType: "CLIENT" | "INTERNAL";
  createdAt: string;
}

const STATUS_VARIANT: Record<ClientDocument["status"], "default" | "secondary" | "destructive"> = {
  PENDING_REVIEW: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
};

export function ClientDocumentsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["client-documents", clientId],
    queryFn: async (): Promise<{ documents: ClientDocument[] }> => {
      const res = await fetch(`/api/v1/clients/${clientId}/documents`);
      if (!res.ok) throw new Error("Could not load documents.");
      return res.json();
    },
  });

  async function onReview(documentId: string, decision: "APPROVE" | "REJECT") {
    const res = await fetch(`/api/v1/documents/${documentId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not review this document.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["client-documents", clientId] });
    toast.success(decision === "APPROVE" ? "Document approved." : "Document rejected.");
  }

  async function onDownload(documentId: string) {
    const res = await fetch(`/api/v1/documents/${documentId}/download`);
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not open this document.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  if (isLoading) return null;

  return (
    <>
      <h2 className="text-sm font-semibold text-foreground">Documents</h2>
      {!data?.documents.length ? (
        <BentoEmptyState title="No documents yet" description="Documents the client or your team upload will appear here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                onClick={() => onDownload(doc.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-foreground">{doc.originalFilename}</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={STATUS_VARIANT[doc.status]}>{doc.status.replace("_", " ")}</Badge>
                {doc.status === "PENDING_REVIEW" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onReview(doc.id, "REJECT")}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => onReview(doc.id, "APPROVE")}>
                      Approve
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
