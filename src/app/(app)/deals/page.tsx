"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";

interface Stage {
  id: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}

interface OpportunityRow {
  id: string;
  name: string;
  stageId: string;
  valueMinor: number | null;
  currency: string;
  probability: number | null;
  position: number;
  company: { id: string; name: string } | null;
  owner: { user: { name: string | null; email: string } } | null;
}

type Board = Record<string, OpportunityRow[]>;

function initialsFor(name: string | null, email: string) {
  const source = name ?? email;
  return source
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const quickCreateSchema = z.object({
  name: z.string().min(1, "Deal name is required").max(200),
  // Whole currency units as typed (e.g. "1500" or "1500.50") — validated
  // and converted to a minor-unit integer at submit time, see onCreate
  // below. Plain string (not z.coerce.number()) to keep react-hook-form's
  // resolver input/output types aligned for an optional numeric field.
  valueMajor: z
    .union([z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount, e.g. 1500 or 1500.50"), z.literal("")])
    .optional(),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

function buildBoard(stages: Stage[], opportunities: OpportunityRow[]): Board {
  const board: Board = {};
  for (const stage of stages) {
    board[stage.id] = opportunities
      .filter((o) => o.stageId === stage.id)
      .sort((a, b) => a.position - b.position);
  }
  return board;
}

function DealCard({ opportunity }: { opportunity: OpportunityRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm shadow-sm",
        isDragging && "opacity-50"
      )}
    >
      <span className="font-medium text-foreground">{opportunity.name}</span>
      {opportunity.company && <span className="text-xs text-muted-foreground">{opportunity.company.name}</span>}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">
          {formatMoneyMinor(opportunity.valueMinor, opportunity.currency)}
        </span>
        {opportunity.owner && (
          <Avatar size="sm">
            <AvatarFallback>
              {initialsFor(opportunity.owner.user.name, opportunity.owner.user.email)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      {opportunity.probability !== null && (
        <Badge variant="outline" className="w-fit">
          {opportunity.probability}% likely
        </Badge>
      )}
    </div>
  );
}

function StageColumn({ stage, opportunities }: { stage: Stage; opportunities: OpportunityRow[] }) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  const totalValue = opportunities.reduce((sum, o) => sum + (o.valueMinor ?? 0), 0);

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{
              background: stage.isWon
                ? "var(--success)"
                : stage.isLost
                  ? "var(--destructive)"
                  : "var(--module-sales)",
            }}
          />
          <h3 className="text-sm font-semibold text-foreground">{stage.name}</h3>
          <span className="text-xs text-muted-foreground">{opportunities.length}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatMoneyMinor(totalValue, "GBP")}</span>
      </div>
      <SortableContext items={opportunities.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex min-h-24 flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-2"
        >
          {opportunities.map((o) => (
            <DealCard key={o.id} opportunity={o} />
          ))}
          {opportunities.length === 0 && (
            <p className="p-2 text-center text-xs text-muted-foreground">Drop a deal here</p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function DealsPage() {
  const queryClient = useQueryClient();
  const [board, setBoard] = useState<Board>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ["pipeline"],
    queryFn: async (): Promise<{ items: Pipeline[] }> => {
      const res = await fetch("/api/v1/pipelines?ensureDefault=true");
      if (!res.ok) throw new Error("Could not load the pipeline.");
      return res.json();
    },
  });
  const pipeline = pipelineData?.items[0];

  const { data: opportunitiesData, isLoading: opportunitiesLoading } = useQuery({
    queryKey: ["opportunities", pipeline?.id],
    enabled: Boolean(pipeline?.id),
    queryFn: async (): Promise<{ items: OpportunityRow[] }> => {
      const res = await fetch(`/api/v1/opportunities?pipelineId=${pipeline!.id}&pageSize=200`);
      if (!res.ok) throw new Error("Could not load deals.");
      return res.json();
    },
  });

  // `board` is independently mutated during drag-and-drop (optimistic
  // reordering/cross-column moves), so it can't be a pure useMemo of the
  // query data — it must resync only when the SERVER data actually
  // changes (a new successful fetch), not on every render. This is React's
  // documented pattern for that ("adjusting state when a prop changes"):
  // compare against the last-seen reference during render and update
  // synchronously, rather than in a useEffect (which would cost an extra
  // commit and trip react-hooks/set-state-in-effect).
  const [syncedOpportunitiesData, setSyncedOpportunitiesData] = useState(opportunitiesData);
  if (opportunitiesData !== syncedOpportunitiesData) {
    setSyncedOpportunitiesData(opportunitiesData);
    if (pipeline && opportunitiesData) {
      setBoard(buildBoard(pipeline.stages, opportunitiesData.items));
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function findContainer(id: string): string | undefined {
    if (board[id]) return id; // dropped directly on a column (empty area)
    return Object.keys(board).find((stageId) => board[stageId].some((o) => o.id === id));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setBoard((prev) => {
      const activeItems = prev[activeContainer];
      const movingItem = activeItems.find((o) => o.id === active.id);
      if (!movingItem) return prev;
      const overItems = prev[overContainer];
      const overIndex = overItems.findIndex((o) => o.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((o) => o.id !== active.id),
        [overContainer]: [
          ...overItems.slice(0, insertAt),
          { ...movingItem, stageId: overContainer },
          ...overItems.slice(insertAt),
        ],
      };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const container = findContainer(String(active.id));
    if (!container) return;

    const items = board[container];
    const activeIndex = items.findIndex((o) => o.id === active.id);
    const overIndex = items.findIndex((o) => o.id === over.id);

    let finalOrder = items;
    if (activeIndex !== overIndex && overIndex >= 0) {
      finalOrder = [...items];
      const [moved] = finalOrder.splice(activeIndex, 1);
      finalOrder.splice(overIndex, 0, moved);
      setBoard((prev) => ({ ...prev, [container]: finalOrder }));
    }

    const previousBoard = board;
    try {
      const res = await fetch(`/api/v1/opportunities/${active.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId: container,
          orderedIds: finalOrder.map((o) => o.id),
        }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error ?? "Could not save this move.");
      }
      await queryClient.invalidateQueries({ queryKey: ["opportunities", pipeline?.id] });
    } catch (error) {
      setBoard(previousBoard);
      toast.error(error instanceof Error ? error.message : "Could not save this move.");
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuickCreateInput>({ resolver: zodResolver(quickCreateSchema) });

  async function onCreate(input: QuickCreateInput) {
    if (!pipeline) return;
    const firstStage = pipeline.stages[0];
    // The form collects whole currency units (what a person naturally
    // types); the API stores/transmits minor-unit integers only (CLAUDE.md
    // rule 3) — convert once here, at the UI boundary, never store a float.
    const valueMinor = input.valueMajor ? Math.round(parseFloat(input.valueMajor) * 100) : undefined;
    const res = await fetch("/api/v1/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pipelineId: pipeline.id,
        stageId: firstStage.id,
        name: input.name,
        valueMinor,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create this deal.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["opportunities", pipeline.id] });
    reset();
    setDialogOpen(false);
    toast.success(`${input.name} added to ${firstStage.name}.`);
  }

  const isLoading = pipelineLoading || opportunitiesLoading;
  const activeOpportunity = activeId
    ? Object.values(board)
        .flat()
        .find((o) => o.id === activeId)
    : null;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <PageHeader
        title={pipeline?.name ?? "Pipeline"}
        description="Drag a deal to move it between stages."
        actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-sales)", color: "var(--module-on-accent)" }} disabled={!pipeline}>
              New deal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a deal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deal-name">Deal name</Label>
                <Input id="deal-name" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deal-value">Value, in whole currency units (optional)</Label>
                <Input id="deal-value" type="number" min={0} step="0.01" {...register("valueMajor")} />
                {errors.valueMajor && (
                  <p className="text-xs text-destructive">{errors.valueMajor.message}</p>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Adding…" : "Add deal"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
            {pipeline?.stages.map((stage) => (
              <StageColumn key={stage.id} stage={stage} opportunities={board[stage.id] ?? []} />
            ))}
          </div>
          <DragOverlay>{activeOpportunity && <DealCard opportunity={activeOpportunity} />}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
