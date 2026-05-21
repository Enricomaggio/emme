import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Save, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogFooter } from "@/components/ui/dialog";
import type { LaborRate } from "@shared/schema";
import { DiscountFields } from "../components/DiscountFields";
import { giornateFormSchema } from "../schemas";
import type { QuoteItemDraft } from "../types";
import type { QuoteItemDraftValues } from "../schemas";
import { formatEur } from "../utils";

export function GiornateForm({
  laborRates,
  onSubmit,
  initial,
  submitLabel = "Aggiungi",
  submitTestId = "button-add-giornate-row",
}: {
  laborRates: LaborRate[];
  onSubmit: (d: QuoteItemDraftValues) => void;
  initial?: QuoteItemDraft;
  submitLabel?: string;
  submitTestId?: string;
}) {
  const form = useForm<z.infer<typeof giornateFormSchema>>({
    resolver: zodResolver(giornateFormSchema),
    defaultValues: {
      laborRateId: initial?.laborRateId ?? "",
      quantity: initial?.quantity ?? "",
      description: initial?.description ?? "",
      marginPercent: initial?.marginPercent ?? "",
      discountPercent: initial?.discountPercent ?? "",
      overrideTotal: initial?.overrideTotal ?? "",
    },
  });

  const selectedId = form.watch("laborRateId");
  const quantity = form.watch("quantity");
  const marginOverride = form.watch("marginPercent");
  const selected = laborRates.find((l) => l.id === selectedId);

  const preview = useMemo(() => {
    if (!selected) return null;
    const days = parseFloat(quantity || "0");
    if (!isFinite(days) || days <= 0) return null;
    const unit = parseFloat(selected.costPerDay);
    const margin = marginOverride !== "" && marginOverride !== undefined
      ? parseFloat(marginOverride)
      : parseFloat(selected.marginPercent);
    const cost = unit * days;
    const total = cost * (1 + (isFinite(margin) ? margin : 0) / 100);
    return { cost, total, margin: isFinite(margin) ? margin : 0 };
  }, [selected, quantity, marginOverride]);

  const submit = form.handleSubmit((vals) => {
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
    const effectiveMarginPct = finalTotal != null && preview && preview.cost > 0
      ? (finalTotal - preview.cost) / preview.cost * 100
      : preview?.margin ?? 0;
    onSubmit({
      type: "GIORNATE",
      description: vals.description || "",
      laborRateId: vals.laborRateId,
      quantity: vals.quantity,
      marginPercent: vals.marginPercent || undefined,
      discountPercent: discountPct > 0 ? String(discountPct) : undefined,
      overrideTotal: overrideTotalVal != null ? String(overrideTotalVal) : null,
      unitOfMeasure: "gg",
      baseTotal: baseT != null ? baseT.toFixed(2) : null,
      totalRow: finalTotal != null ? finalTotal.toFixed(2) : null,
      costRow: preview ? preview.cost.toFixed(2) : null,
      effectiveMargin: effectiveMarginPct.toFixed(4),
    });
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <FormField
            control={form.control}
            name="laborRateId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Manodopera</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger data-testid="select-labor-rate" autoFocus>
                      <SelectValue placeholder="Seleziona voce manodopera" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {laborRates.map((l) => (
                      <SelectItem key={l.id} value={l.id} data-testid={`option-labor-${l.id}`}>
                        {l.name} — {parseFloat(l.costPerDay).toFixed(2)} €/gg
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Giornate</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} data-testid="input-quantity-giornate" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {preview && (
            <p className="text-sm text-muted-foreground" data-testid="preview-giornate">
              Costo: <span className="font-medium text-foreground">€ {formatEur(preview.cost)}</span>
              {" · "}Totale: <span className="font-semibold text-foreground">€ {formatEur(preview.total)}</span>
              {" "}
              <span className="text-muted-foreground">({preview.margin.toFixed(1)}%)</span>
            </p>
          )}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="toggle-advanced-giornate"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                {advancedOpen ? "Nascondi opzioni avanzate" : "+ Opzioni avanzate"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <FormField
                control={form.control}
                name="marginPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Margine % (opzionale, default da catalogo)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder={selected ? parseFloat(selected.marginPercent).toString() : ""}
                        {...field}
                        data-testid="input-margin-override-giornate"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrizione (opzionale)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-description-giornate" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DiscountFields form={form} baseTotal={preview?.total ?? null} />
            </CollapsibleContent>
          </Collapsible>
        </div>
        <DialogFooter className="shrink-0 pt-3 border-t mt-1">
          <Button type="submit" data-testid={submitTestId}>
            {initial ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
