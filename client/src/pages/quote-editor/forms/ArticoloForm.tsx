import { useState, useMemo, useEffect } from "react";
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
import type { ArticleFamilyWithVariants } from "@shared/schema";
import { DiscountFields } from "../components/DiscountFields";
import { articoloFormSchema } from "../schemas";
import type { QuoteItemDraft } from "../types";
import type { QuoteItemDraftValues } from "../schemas";
import { formatEur } from "../utils";

export function ArticoloForm({
  articleFamilies,
  onSubmit,
  initial,
  submitLabel = "Aggiungi",
  submitTestId = "button-add-articolo-row",
}: {
  articleFamilies: ArticleFamilyWithVariants[];
  onSubmit: (d: QuoteItemDraftValues) => void;
  initial?: QuoteItemDraft;
  submitLabel?: string;
  submitTestId?: string;
}) {
  const initialFamily = useMemo(() => {
    if (!initial?.catalogArticleId) return null;
    return articleFamilies.find((f) =>
      f.variants.some((v) => v.id === initial.catalogArticleId)
    ) ?? null;
  }, [initial, articleFamilies]);

  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(initialFamily?.id ?? "");

  const form = useForm<z.infer<typeof articoloFormSchema>>({
    resolver: zodResolver(articoloFormSchema),
    defaultValues: {
      catalogArticleId: initial?.catalogArticleId ?? "",
      quantity: initial?.quantity ?? "",
      description: initial?.description ?? "",
      marginPercent: initial?.marginPercent ?? "",
      discountPercent: initial?.discountPercent ?? "",
      overrideTotal: initial?.overrideTotal ?? "",
    },
  });

  const selectedVariantId = form.watch("catalogArticleId");
  const quantity = form.watch("quantity");
  const marginOverride = form.watch("marginPercent");

  const selectedFamily = articleFamilies.find((f) => f.id === selectedFamilyId);
  const variants = selectedFamily?.variants ?? [];
  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  useEffect(() => {
    if (selectedVariantId && selectedFamily && !selectedFamily.variants.some((v) => v.id === selectedVariantId)) {
      form.setValue("catalogArticleId", "");
    }
  }, [selectedFamilyId, selectedFamily, selectedVariantId, form]);

  const preview = useMemo(() => {
    if (!selectedVariant) return null;
    const qty = parseFloat(quantity || "0");
    if (!isFinite(qty) || qty <= 0) return null;
    const unit = parseFloat(selectedVariant.unitCost);
    const margin = marginOverride !== "" && marginOverride !== undefined
      ? parseFloat(marginOverride)
      : parseFloat(selectedVariant.marginPercent);
    const cost = unit * qty;
    const total = cost * (1 + (isFinite(margin) ? margin : 0) / 100);
    return { cost, total, margin: isFinite(margin) ? margin : 0 };
  }, [selectedVariant, quantity, marginOverride]);

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
      type: "ARTICOLO",
      description: vals.description || "",
      catalogArticleId: vals.catalogArticleId,
      quantity: vals.quantity,
      marginPercent: vals.marginPercent || undefined,
      discountPercent: discountPct > 0 ? String(discountPct) : undefined,
      overrideTotal: overrideTotalVal != null ? String(overrideTotalVal) : null,
      unitOfMeasure: selectedVariant?.unitOfMeasure ?? selectedFamily?.unitOfMeasure ?? "pz",
      baseTotal: baseT != null ? baseT.toFixed(2) : null,
      totalRow: finalTotal != null ? finalTotal.toFixed(2) : null,
      costRow: preview ? preview.cost.toFixed(2) : null,
      effectiveMargin: effectiveMarginPct.toFixed(4),
    });
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0" onKeyDown={(e) => { if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) e.preventDefault(); }}>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <div className="space-y-1">
            <label className="text-sm font-medium">Famiglia articoli</label>
            <Select value={selectedFamilyId} onValueChange={setSelectedFamilyId}>
              <SelectTrigger data-testid="select-article-family" autoFocus>
                <SelectValue placeholder="Seleziona famiglia" />
              </SelectTrigger>
              <SelectContent>
                {articleFamilies.map((f) => (
                  <SelectItem key={f.id} value={f.id} data-testid={`option-family-${f.id}`}>
                    {f.name} ({f.unitOfMeasure})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormField
            control={form.control}
            name="catalogArticleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Variante</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={!selectedFamilyId}>
                  <FormControl>
                    <SelectTrigger data-testid="select-catalog-article">
                      <SelectValue placeholder="Seleziona variante" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {variants.map((v) => {
                      const notesStr = v.notes ? ` (${v.notes})` : "";
                      return (
                        <SelectItem key={v.id} value={v.id} data-testid={`option-article-${v.id}`}>
                          {v.name}{notesStr} — {parseFloat(v.unitCost).toFixed(2)} €/{v.unitOfMeasure}
                        </SelectItem>
                      );
                    })}
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
                <FormLabel>Quantità ({selectedVariant?.unitOfMeasure || selectedFamily?.unitOfMeasure || "pz"})</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} data-testid="input-quantity-articolo" />
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
                <FormLabel>Descrizione riga (opzionale)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Descrizione personalizzata per questo preventivo" data-testid="input-description-articolo" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {preview && (
            <p className="text-sm text-muted-foreground" data-testid="preview-articolo">
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
                data-testid="toggle-advanced-articolo"
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
                        placeholder={selectedVariant ? parseFloat(selectedVariant.marginPercent).toString() : ""}
                        {...field}
                        data-testid="input-margin-override-articolo"
                      />
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
