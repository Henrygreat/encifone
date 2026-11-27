"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { formatEnumLabel } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { SERVICE_BILLING_TYPES } from "@/modules/catalogue/constants";

interface ServiceItemRow {
  id: string;
  name: string;
  sku: string | null;
  unitPriceMinor: number;
  currency: string;
  billingType: string;
  status: string;
}

interface ServiceItemListResponse {
  items: ServiceItemRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface PriceHistoryEntry {
  id: string;
  unitPriceMinor: number;
  currency: string;
  effectiveFrom: string;
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "outline"> = {
  ACTIVE: "default",
  ARCHIVED: "outline",
};

// Plain string (not z.coerce.number()) to keep react-hook-form's resolver
// input/output types aligned — see src/app/(app)/deals/page.tsx's
// valueMajor field for the same pattern. Parsed to a minor-unit integer
// at submit time.
const moneyAmountSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount, e.g. 150 or 150.50");

const quickCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().max(60).optional(),
  unitPrice: moneyAmountSchema,
  billingType: z.enum(SERVICE_BILLING_TYPES),
});
type QuickCreateInput = z.infer<typeof quickCreateSchema>;

const priceChangeSchema = z.object({
  unitPrice: moneyAmountSchema,
});
type PriceChangeInput = z.infer<typeof priceChangeSchema>;

export default function ServiceCataloguePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [priceDialogItem, setPriceDialogItem] = useState<ServiceItemRow | null>(null);
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["service-items", debouncedSearch],
    queryFn: async (): Promise<ServiceItemListResponse> => {
      const params = new URLSearchParams({ pageSize: "100" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/v1/service-items?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load the service catalogue.");
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    enabled: Boolean(historyItemId),
    queryKey: ["service-item-history", historyItemId],
    queryFn: async (): Promise<{ priceHistory: PriceHistoryEntry[] }> => {
      const res = await fetch(`/api/v1/service-items/${historyItemId}`);
      if (!res.ok) throw new Error("Could not load price history.");
      return res.json();
    },
  });

  const createForm = useForm<QuickCreateInput>({
    resolver: zodResolver(quickCreateSchema),
    defaultValues: { billingType: "ONE_OFF" },
  });
  const priceForm = useForm<PriceChangeInput>({ resolver: zodResolver(priceChangeSchema) });

  async function onCreate(input: QuickCreateInput) {
    const res = await fetch("/api/v1/service-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        sku: input.sku || undefined,
        unitPriceMinor: Math.round(Number(input.unitPrice) * 100),
        billingType: input.billingType,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not create the service item.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["service-items"] });
    createForm.reset();
    setCreateOpen(false);
    toast.success(`${input.name} was added to your service catalogue.`);
  }

  async function onChangePrice(input: PriceChangeInput) {
    if (!priceDialogItem) return;
    const res = await fetch(`/api/v1/service-items/${priceDialogItem.id}/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitPriceMinor: Math.round(Number(input.unitPrice) * 100) }),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not update the price.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["service-items"] });
    priceForm.reset();
    setPriceDialogItem(null);
    toast.success(`Price updated for ${priceDialogItem.name}.`);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Service catalogue</h1>
          <p className="text-sm text-muted-foreground">
            The services you quote and bill — every price change is kept as history, never overwritten.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "var(--module-work)", color: "var(--module-on-accent)" }}>New service</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a service</DialogTitle>
              <DialogDescription>You can change its price later — every change is tracked.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...createForm.register("name")} />
                {createForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sku">SKU (optional)</Label>
                  <Input id="sku" {...createForm.register("sku")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="unitPrice">Unit price (GBP)</Label>
                  <Input id="unitPrice" type="number" step="0.01" min="0" {...createForm.register("unitPrice")} />
                  {createForm.formState.errors.unitPrice && (
                    <p className="text-xs text-destructive">{createForm.formState.errors.unitPrice.message}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Billing type</Label>
                <Controller
                  control={createForm.control}
                  name="billingType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_BILLING_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {formatEnumLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting ? "Adding…" : "Add service"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Input
        placeholder="Search the catalogue…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <BentoEmptyState
            title="No services in your catalogue yet"
            description="Add the services you quote and bill so proposals can be built from them."
            action={<Button onClick={() => setCreateOpen(true)}>New service</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.sku ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatEnumLabel(item.billingType)}</TableCell>
                  <TableCell className="text-foreground">
                    {formatMoneyMinor(item.unitPriceMinor, item.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[item.status] ?? "outline"}>
                      {formatEnumLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setHistoryItemId(item.id)}>
                        History
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          priceForm.reset({ unitPrice: (item.unitPriceMinor / 100).toFixed(2) });
                          setPriceDialogItem(item);
                        }}
                      >
                        Change price
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(priceDialogItem)} onOpenChange={(open) => !open && setPriceDialogItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change price for {priceDialogItem?.name}</DialogTitle>
            <DialogDescription>
              The current price is kept in history — this never overwrites it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={priceForm.handleSubmit(onChangePrice)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPrice">New unit price (GBP)</Label>
              <Input id="newPrice" type="number" step="0.01" min="0" {...priceForm.register("unitPrice")} />
              {priceForm.formState.errors.unitPrice && (
                <p className="text-xs text-destructive">{priceForm.formState.errors.unitPrice.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={priceForm.formState.isSubmitting}>
                {priceForm.formState.isSubmitting ? "Updating…" : "Update price"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyItemId)} onOpenChange={(open) => !open && setHistoryItemId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Price history</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !historyData || historyData.priceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price history recorded yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {historyData.priceHistory.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{formatMoneyMinor(entry.unitPriceMinor, entry.currency)}</span>
                  <span className="text-muted-foreground">{new Date(entry.effectiveFrom).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
