"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BentoEmptyState } from "@/components/bento/bento-grid";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEnumLabel } from "@/lib/utils";

const STEP_TYPES = [
  "WELCOME",
  "CLIENT_INFO",
  "PROPOSAL_ACCEPTANCE",
  "CONTRACT_SIGNATURE",
  "PAYMENT",
  "DOCUMENT_UPLOAD",
  "QUESTIONNAIRE",
  "INTERNAL_REVIEW",
  "SERVICE_ACTIVATION",
  "CUSTOM",
] as const;

const quickCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean(),
  steps: z
    .array(
      z.object({
        label: z.string().min(1, "Step label is required").max(200),
        stepType: z.enum(STEP_TYPES),
        assignedTo: z.enum(["CLIENT", "INTERNAL"]),
        isMandatory: z.boolean(),
        requiresApproval: z.boolean(),
      })
    )
    .min(1, "Add at least one step"),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

interface TemplateStep {
  id: string;
  order: number;
  label: string;
  stepType: string;
  assignedTo: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  steps: TemplateStep[];
  _count?: { onboardings: number };
}

export default function OnboardingTemplatesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: async (): Promise<{ templates: Template[] }> => {
      const res = await fetch("/api/v1/onboarding-templates");
      if (!res.ok) throw new Error("Could not load onboarding templates.");
      return res.json();
    },
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<QuickCreateInput>({
    resolver: zodResolver(quickCreateSchema),
    defaultValues: {
      isDefault: false,
      steps: [{ label: "", stepType: "WELCOME", assignedTo: "CLIENT", isMandatory: true, requiresApproval: false }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "steps" });

  async function onCreate(input: QuickCreateInput) {
    const res = await fetch("/api/v1/onboarding-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create this template.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
    reset();
    setDialogOpen(false);
    toast.success(`${input.name} created.`);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Onboarding templates"
        description="Configurable, reusable onboarding checklists — start one from a client's workspace."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button style={{ background: "var(--module-work)", color: "var(--module-on-accent)" }}>
                New template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Create an onboarding template</DialogTitle>
                <DialogDescription>
                  Each step is copied onto a client&apos;s onboarding when it starts, so editing this template later never
                  changes a step already presented to a client.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onCreate)} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" {...register("name")} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea id="description" {...register("description")} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isDefault"
                    checked={watch("isDefault")}
                    onCheckedChange={(checked) => setValue("isDefault", checked === true)}
                  />
                  <Label htmlFor="isDefault" className="text-sm font-normal">
                    Make this the default template (used by auto-start onboarding)
                  </Label>
                </div>

                <div className="flex flex-col gap-3">
                  <Label>Steps</Label>
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Input placeholder="Step label" {...register(`steps.${index}.label`)} />
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {errors.steps?.[index]?.label && (
                        <p className="text-xs text-destructive">{errors.steps[index]?.label?.message}</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={watch(`steps.${index}.stepType`)}
                          onValueChange={(v) => setValue(`steps.${index}.stepType`, v as (typeof STEP_TYPES)[number])}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STEP_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {formatEnumLabel(t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={watch(`steps.${index}.assignedTo`)}
                          onValueChange={(v) => setValue(`steps.${index}.assignedTo`, v as "CLIENT" | "INTERNAL")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CLIENT">Client</SelectItem>
                            <SelectItem value="INTERNAL">Internal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={watch(`steps.${index}.isMandatory`)}
                            onCheckedChange={(checked) => setValue(`steps.${index}.isMandatory`, checked === true)}
                          />
                          <Label className="text-xs font-normal">Mandatory</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={watch(`steps.${index}.requiresApproval`)}
                            onCheckedChange={(checked) => setValue(`steps.${index}.requiresApproval`, checked === true)}
                          />
                          <Label className="text-xs font-normal">Requires internal approval</Label>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      append({ label: "", stepType: "CUSTOM", assignedTo: "CLIENT", isMandatory: true, requiresApproval: false })
                    }
                  >
                    <Plus className="size-4" /> Add step
                  </Button>
                  {errors.steps?.message && <p className="text-xs text-destructive">{errors.steps.message}</p>}
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating…" : "Create template"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? null : !data?.templates.length ? (
        <BentoEmptyState
          title="No onboarding templates yet"
          description="Create one to start automating how new clients are onboarded."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  {template.isDefault && <Badge>Default</Badge>}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {template.steps.length} step{template.steps.length === 1 ? "" : "s"}
                  {template._count ? ` · used ${template._count.onboardings} time${template._count.onboardings === 1 ? "" : "s"}` : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
