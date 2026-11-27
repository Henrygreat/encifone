"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BentoEmptyState } from "@/components/bento/bento-grid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OnboardingTemplateSummary {
  id: string;
  name: string;
}

interface OnboardingStep {
  id: string;
  order: number;
  label: string;
  stepType: string;
  assignedTo: "CLIENT" | "INTERNAL";
  isMandatory: boolean;
  status: string;
  reviewNote: string | null;
}

interface Onboarding {
  id: string;
  status: string;
  steps: OnboardingStep[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  AWAITING_APPROVAL: "Awaiting your review",
  COMPLETED: "Complete",
  SKIPPED: "Skipped",
  BLOCKED: "Blocked",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED") return <CheckCircle2 className="size-4 text-[var(--success)]" />;
  if (status === "AWAITING_APPROVAL") return <Clock className="size-4 text-[var(--warning)]" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

const DERIVED_TYPES = new Set(["PROPOSAL_ACCEPTANCE", "CONTRACT_SIGNATURE", "PAYMENT"]);

export function ClientOnboardingSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const { data: onboardingData, isLoading } = useQuery({
    queryKey: ["client-onboarding", clientId],
    queryFn: async (): Promise<{ onboarding: Onboarding | null }> => {
      const res = await fetch(`/api/v1/clients/${clientId}/onboarding`);
      if (!res.ok) throw new Error("Could not load onboarding.");
      return res.json();
    },
  });

  const { data: templatesData } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: async (): Promise<{ templates: OnboardingTemplateSummary[] }> => {
      const res = await fetch("/api/v1/onboarding-templates");
      if (!res.ok) throw new Error("Could not load onboarding templates.");
      return res.json();
    },
    enabled: !onboardingData?.onboarding,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["client-onboarding", clientId] });
  }

  async function onStart() {
    if (!selectedTemplate) return;
    const res = await fetch(`/api/v1/clients/${clientId}/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: selectedTemplate }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not start onboarding.");
      return;
    }
    await refresh();
    toast.success("Onboarding started.");
  }

  async function onStepAction(stepId: string, action: "skip" | "review-approve" | "review-reject" | "override") {
    const path =
      action === "skip"
        ? `/api/v1/onboarding-steps/${stepId}/skip`
        : action === "override"
          ? `/api/v1/onboarding-steps/${stepId}/override`
          : `/api/v1/onboarding-steps/${stepId}/review`;
    const body =
      action === "override"
        ? { note: "Marked complete by an internal override." }
        : action === "review-approve"
          ? { decision: "APPROVE" }
          : action === "review-reject"
            ? { decision: "REJECT", note: "Please review and resubmit." }
            : undefined;

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not update this step.");
      return;
    }
    await refresh();
    toast.success("Step updated.");
  }

  if (isLoading) return null;

  const onboarding = onboardingData?.onboarding;

  if (!onboarding) {
    return (
      <>
        <h2 className="text-sm font-semibold text-foreground">Onboarding</h2>
        <BentoEmptyState title="Not started" description="Start this client's onboarding from a template." />
        {templatesData?.templates.length ? (
          <div className="flex items-center gap-2">
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Choose a template…" />
              </SelectTrigger>
              <SelectContent>
                {templatesData.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!selectedTemplate} onClick={onStart}>
              Start onboarding
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No onboarding templates exist yet — create one on the Onboarding Templates page.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Onboarding</h2>
        <Badge variant={onboarding.status === "COMPLETED" ? "default" : "outline"}>
          {STATUS_LABEL[onboarding.status] ?? onboarding.status}
        </Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {onboarding.steps
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <li key={step.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <StatusIcon status={step.status} />
                <div>
                  <p className="text-sm text-foreground">{step.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {step.assignedTo === "CLIENT" ? "Client" : "Internal"} · {STATUS_LABEL[step.status] ?? step.status}
                    {step.reviewNote && step.status === "PENDING" ? ` · ${step.reviewNote}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {step.status === "AWAITING_APPROVAL" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onStepAction(step.id, "review-reject")}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => onStepAction(step.id, "review-approve")}>
                      Approve
                    </Button>
                  </>
                )}
                {!step.isMandatory && (step.status === "PENDING" || step.status === "IN_PROGRESS") && (
                  <Button size="sm" variant="outline" onClick={() => onStepAction(step.id, "skip")}>
                    Skip
                  </Button>
                )}
                {step.status !== "COMPLETED" &&
                  step.status !== "AWAITING_APPROVAL" &&
                  (step.assignedTo === "CLIENT" || DERIVED_TYPES.has(step.stepType)) && (
                    <Button size="sm" variant="ghost" onClick={() => onStepAction(step.id, "override")}>
                      Override
                    </Button>
                  )}
              </div>
            </li>
          ))}
      </ul>
    </>
  );
}
