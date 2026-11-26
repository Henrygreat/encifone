"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, Users, Mail, StickyNote, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BentoEmptyState } from "@/components/bento/bento-grid";
import { formatEnumLabel } from "@/lib/utils";

type EntityType = "COMPANY" | "CONTACT" | "LEAD" | "OPPORTUNITY";
type ActivityType = "CALL" | "MEETING" | "EMAIL" | "NOTE" | "TASK";

interface ActivityRow {
  id: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  owner: { user: { name: string | null; email: string } } | null;
}

const TYPE_ICON: Record<ActivityType, typeof Phone> = {
  CALL: Phone,
  MEETING: Users,
  EMAIL: Mail,
  NOTE: StickyNote,
  TASK: CheckSquare,
};

const logSchema = z.object({
  type: z.enum(["CALL", "MEETING", "EMAIL", "NOTE", "TASK"]),
  subject: z.string().min(1, "Add a short summary").max(200),
  dueAt: z.string().optional(),
});
type LogInput = z.infer<typeof logSchema>;

/**
 * Reusable across any Contact/Company/Lead/Opportunity record once its
 * detail page exists (Milestone B/C's documented scope deferral — see
 * docs/IMPLEMENTATION_STATUS.md). Not mounted anywhere yet; verified via
 * direct API calls against the live dev server instead of through this
 * component's own rendering, since no host page exists yet to click
 * through in a browser in this environment.
 */
export function ActivityTimeline({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["activities", entityType, entityId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<{ items: ActivityRow[] }> => {
      const res = await fetch(`/api/v1/activities?entityType=${entityType}&entityId=${entityId}`);
      if (!res.ok) throw new Error("Could not load activity.");
      return res.json();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LogInput>({ resolver: zodResolver(logSchema), defaultValues: { type: "NOTE" } });
  const selectedType = watch("type");

  async function onLog(input: LogInput) {
    const res = await fetch("/api/v1/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId,
        type: input.type,
        subject: input.subject,
        dueAt: input.dueAt || undefined,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not log this activity.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
    reset({ type: "NOTE", subject: "", dueAt: "" });
  }

  async function onComplete(activityId: string) {
    const res = await fetch(`/api/v1/activities/${activityId}/complete`, { method: "POST" });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      toast.error(result.error ?? "Could not mark this complete.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit(onLog)} className="flex flex-wrap items-start gap-2">
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["CALL", "MEETING", "EMAIL", "NOTE", "TASK"] as const).map((t) => (
                  <SelectItem key={t} value={t}>
                    {formatEnumLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Input placeholder="What happened, or what's next?" className="min-w-48 flex-1" {...register("subject")} />
        {selectedType === "TASK" && <Input type="datetime-local" className="w-48" {...register("dueAt")} />}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Logging…" : "Log"}
        </Button>
      </form>
      {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <BentoEmptyState title="No activity yet" description="Log a call, meeting, note, or task to start the timeline." />
      ) : (
        <ol className="flex flex-col gap-3 border-l border-border pl-4">
          {data.items.map((activity) => {
            const Icon = TYPE_ICON[activity.type];
            const isOpenTask = activity.type === "TASK" && activity.status === "OPEN";
            return (
              <li key={activity.id} className="relative flex flex-col gap-1">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-1 flex size-4 items-center justify-center rounded-full bg-muted"
                >
                  <Icon className="size-2.5 text-muted-foreground" />
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{activity.subject}</span>
                  <div className="flex items-center gap-2">
                    {isOpenTask && (
                      <Badge variant="outline">
                        Due {activity.dueAt ? new Date(activity.dueAt).toLocaleDateString() : "—"}
                      </Badge>
                    )}
                    <Badge variant={activity.status === "COMPLETED" ? "secondary" : "outline"}>
                      {formatEnumLabel(activity.status)}
                    </Badge>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {activity.owner?.user.name ?? activity.owner?.user.email ?? "Unassigned"} ·{" "}
                  {new Date(activity.createdAt).toLocaleString()}
                </span>
                {isOpenTask && (
                  <Button size="sm" variant="outline" className="w-fit" onClick={() => onComplete(activity.id)}>
                    Mark complete
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
