import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogFooter } from "@/components/ui/dialog";
import { DiscountFields } from "../components/DiscountFields";
import { manualeFormSchema } from "../schemas";
import type { QuoteItemDraft } from "../types";
import type { QuoteItemDraftValues } from "../schemas";
import { formatEur } from "../utils";

export function ManualeForm({
  onSubmit,
  initial,
  submitLabel = "Aggiungi",
  submitTestId = "button-add-manuale-row",
}: {
  onSubmit: (d: QuoteItemDraftValues) => void;
  initial?: QuoteItemDraft;
  submitLabel?: string;
  submitTestId?: string;
}) {
  const form = useForm<z.infer<typeof manualeFormSchema>>({
    resolver: zodResolver(manualeFormSchema),
    defaultValues: {
      description: initial?.description ?? "",
      unitOfMeasure: initial?.unitOfMeasure ?? "",
      quantity: initial?.quantity ?? "",
      unitCost: initial?.unitCost ?? "",
      marginPercent: initial?.marginPercent ?? "",
      discountPercent: initial?.discountPercent ?? "",
      overrideTotal: initial?.overrideTotal ?? "",
    },
  });

  const quantity = form.watch("quantity");
  const unitCost = form.watch("unitCost");
  const marginPercent = form.watch("marginPercent");

  const preview = useMemo(() => {
    const qty = parseFloat(quantity || "0");
    const cost = parseFloat(unitCost || "0");
    const margin = parseFloat(marginPercent || "0");
    if (!isFinite(qty) || qty <= 0 || !isFinite(cost) || cost < 0) return null;
    const m = isFinite(margin) ? margin : 0;
    const unitPriceApplied = cost * (1 + m / 100);
    const total = qty * unitPriceApplied;
    return { unitPriceApplied, total, margin: m };
  }, [quantity, unitCost, marginPercent]);

  const submit = form.handleSubmit((vals) => {
    const cost = preview ? (parseFloat(vals.unitCost) * parseFloat(vals.quantity)) : null;
    const discountPct = vals.discountPercent && parseFloat(vals.discountPercent) > 0
      ? parseFloat(vals.discountPercent) : 0;
    const overrideTotalVal = vals.overrideTotal && parseFloat(vals.overrideTotal) >= 0
      ? parseFloat(vals.overrideTotal) : null;
    const baseT = preview ? preview.total : null;
    const finalTotal = overrideTotalVal != null
      ? overrideTotalVal
      : baseT != null && discountPct > 0
        ? baseT * (1 - discountPct / 100)
        : baseT;
    const effectiveMarginPct = finalTotal != null && cost != null && cost > 0
      ? (finalTotal - cost) / cost * 100
      : preview?.margin ?? 0;
    onSubmit({
      type: "MANUALE",
      description: vals.description,
      unitOfMeasure: vals.unitOfMeasure,
      quantity: vals.quantity,
      unitCost: vals.unitCost,
      marginPercent: vals.marginPercent || undefined,
      discountPercent: discountPct > 0 ? String(discountPct) : undefined,
      overrideTotal: overrideTotalVal != null ? String(overrideTotalVal) : null,
      baseTotal: baseT != null ? baseT.toFixed(2) : null,
      totalRow: finalTotal != null ? finalTotal.toFixed(2) : null,
      costRow: cost !== null ? cost.toFixed(2) : null,
      effectiveMargin: effectiveMarginPct.toFixed(4),
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Es. Nolo ponteggio extra, Fornitura speciale…" data-testid="input-description-manuale" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="unitOfMeasure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unità di misura</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Es. pz, ml, gg, ore…" data-testid="input-unit-of-measure-manuale" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantità</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} data-testid="input-quantity-manuale" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="unitCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Costo unitario (€)</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} data-testid="input-unit-cost-manuale" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="marginPercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Margine %</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="0" {...field} data-testid="input-margin-manuale" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="preview-manuale">
            <div>Prezzo unitario: <span className="font-medium">€ {formatEur(preview.unitPriceApplied)}</span></div>
            <div>Margine: <span className="font-medium">{preview.margin.toFixed(2)}%</span></div>
            <div className="pt-1 border-t">
              Prezzo totale riga: <span className="font-semibold">€ {formatEur(preview.total)}</span>
            </div>
          </div>
        )}
        <DiscountFields form={form} baseTotal={preview?.total ?? null} />
        <DialogFooter>
          <Button type="submit" data-testid={submitTestId}>
            {initial ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
