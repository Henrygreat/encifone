"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { CheckCircle2, Circle, Clock, FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface QuestionnaireField {
  id: string;
  label: string;
  required?: boolean;
}

interface OnboardingStep {
  id: string;
  order: number;
  label: string;
  description: string | null;
  stepType: string;
  assignedTo: "CLIENT" | "INTERNAL";
  isMandatory: boolean;
  status: string;
  reviewNote: string | null;
  data: Record<string, unknown> | null;
}

interface Onboarding {
  id: string;
  status: string;
  steps: OnboardingStep[];
  template: { config?: unknown };
}

const DERIVED_TYPES = new Set(["PROPOSAL_ACCEPTANCE", "CONTRACT_SIGNATURE", "PAYMENT"]);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  AWAITING_APPROVAL: "Submitted — awaiting review",
  COMPLETED: "Complete",
  SKIPPED: "Skipped",
  BLOCKED: "Blocked",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED") return <CheckCircle2 className="size-5 text-[var(--success)]" />;
  if (status === "AWAITING_APPROVAL") return <Clock className="size-5 text-[var(--warning)]" />;
  return <Circle className="size-5 text-muted-foreground" />;
}

function StepCard({ step, onSubmit }: { step: OnboardingStep; onSubmit: (data?: Record<string, unknown>) => void }) {
  const [notes, setNotes] = useState("");
  const canAct = step.assignedTo === "CLIENT" && (step.status === "PENDING" || step.status === "IN_PROGRESS");

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <StatusIcon status={step.status} />
          <div>
            <CardTitle className="text-base">{step.label}</CardTitle>
            {step.description && <CardDescription>{step.description}</CardDescription>}
          </div>
        </div>
        <Badge variant={step.status === "COMPLETED" ? "default" : "outline"}>
          {STATUS_LABEL[step.status] ?? step.status}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {step.reviewNote && step.status === "PENDING" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {step.reviewNote}
          </div>
        )}

        {step.assignedTo === "INTERNAL" && step.status !== "COMPLETED" && (
          <p className="text-sm text-muted-foreground">Waiting on our team — nothing for you to do here yet.</p>
        )}

        {DERIVED_TYPES.has(step.stepType) && step.status !== "COMPLETED" && (
          <p className="text-sm text-muted-foreground">
            This step updates automatically once the related proposal, contract, or payment is finalised.
          </p>
        )}

        {step.stepType === "DOCUMENT_UPLOAD" && canAct && (
          <div className="flex flex-col gap-2">
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href="/portal/documents">
                <FolderOpen className="size-4" /> Go to documents
              </Link>
            </Button>
            <Button size="sm" className="w-fit" onClick={() => onSubmit()}>
              I&apos;ve uploaded what&apos;s needed — mark complete
            </Button>
          </div>
        )}

        {(step.stepType === "CLIENT_INFO" || step.stepType === "CUSTOM") && canAct && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`notes-${step.id}`}>Notes (optional)</Label>
            <Textarea id={`notes-${step.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" className="w-fit" onClick={() => onSubmit(notes ? { notes } : undefined)}>
              Mark complete
            </Button>
          </div>
        )}

        {(step.stepType === "WELCOME" || step.stepType === "SERVICE_ACTIVATION") && canAct && (
          <Button size="sm" className="w-fit" onClick={() => onSubmit()}>
            Mark complete
          </Button>
        )}

        {step.stepType === "QUESTIONNAIRE" && canAct && <QuestionnaireForm step={step} onSubmit={onSubmit} />}
      </CardContent>
    </Card>
  );
}

function QuestionnaireForm({ step, onSubmit }: { step: OnboardingStep; onSubmit: (data: Record<string, unknown>) => void }) {
  const fields: QuestionnaireField[] = Array.isArray((step as unknown as { config?: { questionnaire?: QuestionnaireField[] } }).config?.questionnaire)
    ? ((step as unknown as { config?: { questionnaire?: QuestionnaireField[] } }).config!.questionnaire as QuestionnaireField[])
    : [];
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (fields.length === 0) {
    return (
      <Button size="sm" className="w-fit" onClick={() => onSubmit({})}>
        Mark complete
      </Button>
    );
  }

  const missingRequired = fields.some((f) => f.required && !answers[f.id]?.trim());

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1.5">
          <Label htmlFor={`q-${step.id}-${field.id}`}>
            {field.label}
            {field.required && <span className="text-destructive"> *</span>}
          </Label>
          <Textarea
            id={`q-${step.id}-${field.id}`}
            value={answers[field.id] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
          />
        </div>
      ))}
      <Button size="sm" className="w-fit" disabled={missingRequired} onClick={() => onSubmit(answers)}>
        Submit
      </Button>
    </div>
  );
}

export default function PortalOnboardingPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["portal-onboarding"],
    queryFn: async (): Promise<{ onboarding: Onboarding | null }> => {
      const res = await fetch("/api/portal/onboarding");
      if (!res.ok) throw new Error("Could not load your onboarding.");
      return res.json();
    },
  });

  async function completeStep(stepId: string, stepData?: Record<string, unknown>) {
    const res = await fetch(`/api/portal/onboarding/steps/${stepId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: stepData }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not update this step.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["portal-onboarding"] });
    toast.success(
      result.status === "AWAITING_APPROVAL" ? "Submitted — we'll review it shortly." : "Marked complete."
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data?.onboarding) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>Your onboarding hasn&apos;t started yet — check back soon.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
      <div className="flex flex-col gap-4">
        {data.onboarding.steps
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <StepCard key={step.id} step={step} onSubmit={(stepData) => completeStep(step.id, stepData)} />
          ))}
      </div>
    </>
  );
}
