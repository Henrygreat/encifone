"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ClientDocument {
  id: string;
  originalFilename: string;
  category: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  sizeBytes: number;
  createdAt: string;
}

const STATUS_VARIANT: Record<ClientDocument["status"], "default" | "secondary" | "destructive"> = {
  PENDING_REVIEW: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PortalDocumentsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-documents"],
    queryFn: async (): Promise<{ documents: ClientDocument[] }> => {
      const res = await fetch("/api/portal/documents");
      if (!res.ok) throw new Error("Could not load your documents.");
      return res.json();
    },
  });

  async function onFileSelected(file: File) {
    setUploading(true);
    try {
      const requestRes = await fetch("/api/portal/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalFilename: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size }),
      });
      const requestResult = await requestRes.json();
      if (!requestRes.ok) {
        toast.error(requestResult.error ?? "Could not start the upload.");
        return;
      }

      const uploadRes = await fetch(requestResult.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) {
        toast.error("The upload did not complete. Please try again.");
        return;
      }

      const confirmRes = await fetch(`/api/portal/documents/${requestResult.document.id}/confirm`, { method: "POST" });
      const confirmResult = await confirmRes.json();
      if (!confirmRes.ok) {
        toast.error(confirmResult.error ?? "Could not confirm the upload.");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["portal-documents"] });
      toast.success(`${file.name} uploaded.`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onDownload(doc: ClientDocument) {
    const res = await fetch(`/api/portal/documents/${doc.id}/download`);
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not open this document.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
          }}
        />
        <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-4" /> {uploading ? "Uploading…" : "Upload document"}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data?.documents.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No documents uploaded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {data.documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader className="flex-row items-center justify-between gap-4 py-4">
                <button
                  type="button"
                  onClick={() => onDownload(doc)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <CardTitle className="truncate text-sm">{doc.originalFilename}</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                </button>
                <Badge variant={STATUS_VARIANT[doc.status]}>{doc.status.replace("_", " ")}</Badge>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
