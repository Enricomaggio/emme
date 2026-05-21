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
import type {
  MaterialThicknessWithFinishes,
  MaterialFinish,
  MaterialWithThicknesses,
} from "@shared/schema";
import { DiscountFields } from "../components/DiscountFields";
import { lattoneriaFormSchema } from "../schemas";
import type { QuoteItemDraft } from "../types";
import type { QuoteItemDraftValues } from "../schemas";
import { formatEur } from "../utils";

// Re-export QuoteItemDraftValues via schemas to keep single import path
export type { QuoteItemDraftValues };

export function LattoneriaForm({
  materials,
  onSubmit,
  initial,
  submitLabel = "Aggiungi",
  submitTestId = "button-add-lattoneria-row",
}: {
  materials: MaterialWithThicknesses[];
  onSubmit: (d: QuoteItemDraftValues) => void;
  initial?: QuoteItemDraft;
  submitLabel?: string;
  submitTestId?: string;
}) {
  const form = useForm<z.infer<typeof lattoneriaFormSchema>>({
    resolver: zodResolver(lattoneriaFormSchema),
    defaultValues: {
      materialId: initial?.materialId ?? "",
      materialThicknessId: initial?.materialThicknessId ?? "",
      materialFinishId: initial?.materialFinishId ?? "",
      developmentCm: initial?.developmentCm ?? "",
      quantity: initial?.quantity ?? "",
      description: initial?.description ?? "",
      marginPercent: initial?.marginPercent ?? "",
      discountPercent: initial?.discountPercent ?? "",
      overrideTotal: initial?.overrideTotal ?? "",
    },
  });

  const selectedMaterialId = form.watch("materialId");
  const selectedThicknessId = form.watch("materialThicknessId");
  const selectedFinishId = form.watch("materialFinishId");
  const developmentCm = form.watch("developmentCm");
  const quantity = form.watch("quantity");
  const marginOverride = form.watch("marginPercent");

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedMaterialId),
    [materials, selectedMaterialId],
  );
  const selectedThickness = useMemo(
    () => selectedMaterial?.thicknesses?.find((t) => t.id === selectedThicknessId) as MaterialThicknessWithFinishes | undefined,
    [selectedMaterial, selectedThicknessId],
  );

  const isSingle = selectedMaterial?.priceMode === "SINGLE";
  const availableFinishes: MaterialFinish[] = selectedThickness?.finishes ?? [];

  useEffect(() => {
    if (selectedThicknessId && selectedMaterial &&
        !selectedMaterial.thicknesses?.some((t) => t.id === selectedThicknessId)) {
      form.setValue("materialThicknessId", "");
      form.setValue("materialFinishId", "");
    }
  }, [selectedMaterialId, selectedMaterial, selectedThicknessId, form]);

  useEffect(() => {
    if (selectedFinishId && selectedThickness &&
        !selectedThickness.finishes?.some((f) => f.id === selectedFinishId)) {
      form.setValue("materialFinishId", "");
    }
  }, [selectedThicknessId, selectedThickness, selectedFinishId, form]);

  const preview = useMemo(() => {
    if (!selectedMaterial || !selectedThickness) return null;
    const dev = parseFloat(developmentCm || "0");
    const meters = parseFloat(quantity || "0");
    const thickMm = parseFloat(selectedThickness.thicknessMm);
    const density = parseFloat(selectedMaterial.density);
    const costKg = isSingle
      ? parseFloat(String(selectedMaterial.singleCostPerKg ?? "0"))
      : parseFloat(String(selectedThickness.costPerKg ?? "0"));
    const defaultMargin = isSingle
      ? parseFloat(String(selectedMaterial.singleMarginPercent ?? "0"))
      : parseFloat(String(selectedThickness.marginPercent ?? "0"));
    const margin = marginOverride !== "" && marginOverride !== undefined
      ? parseFloat(marginOverride)
      : defaultMargin;
    if (!isFinite(dev) || !isFinite(meters) || meters <= 0 || dev <= 0) return null;
    const weightKg = (dev / 100) * meters * (thickMm / 1000) * density;
    const cost = weightKg * costKg;
    const total = cost * (1 + (isFinite(margin) ? margin : 0) / 100);
    return { weightKg, cost, total, margin: isFinite(margin) ? margin : 0 };
  }, [selectedMaterial, selectedThickness, developmentCm, quantity, marginOverride, isSingle]);

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
      type: "LATTONERIA",
      description: vals.description || "",
      materialId: vals.materialId,
      materialThicknessId: vals.materialThicknessId,
      materialFinishId: vals.materialFinishId || undefined,
      developmentCm: vals.developmentCm,
      quantity: vals.quantity,
      marginPercent: vals.marginPercent || undefined,
      discountPercent: discountPct > 0 ? String(discountPct) : undefined,
      overrideTotal: overrideTotalVal != null ? String(overrideTotalVal) : null,
      unitOfMeasure: "ml",
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
            name="materialId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Materiale</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger data-testid="select-material" autoFocus>
                      <SelectValue placeholder="Seleziona materiale" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={m.id} data-testid={`option-material-${m.id}`}>
                        {m.name} ({parseFloat(m.density)} kg/m³)
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
            name="materialThicknessId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Spessore</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={!selectedMaterial}>
                  <FormControl>
                    <SelectTrigger data-testid="select-thickness">
                      <SelectValue placeholder="Seleziona spessore" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(selectedMaterial?.thicknesses || []).map((t) => {
                      const label = `${parseFloat(t.thicknessMm)} mm`;
                      const priceSuffix = !isSingle && t.costPerKg
                        ? ` — ${parseFloat(String(t.costPerKg)).toFixed(2)} €/kg`
                        : "";
                      return (
                        <SelectItem key={t.id} value={t.id} data-testid={`option-thickness-${t.id}`}>
                          {label}{priceSuffix}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {availableFinishes.length > 0 && (
            <FormField
              control={form.control}
              name="materialFinishId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Finitura (opzionale)</FormLabel>
                  <Select
                    value={field.value ?? "__NONE__"}
                    onValueChange={(v) => field.onChange(v === "__NONE__" ? "" : v)}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-finish">
                        <SelectValue placeholder="Nessuna finitura" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__NONE__" data-testid="option-finish-none">
                        — Nessuna finitura —
                      </SelectItem>
                      {availableFinishes.map((f) => (
                        <SelectItem key={f.id} value={f.id} data-testid={`option-finish-${f.id}`}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="developmentCm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sviluppo (cm)</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" {...field} data-testid="input-development-cm" />
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
                  <FormLabel>Metri lineari</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" {...field} data-testid="input-quantity-meters" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {preview && (
            <p className="text-sm text-muted-foreground" data-testid="preview-lattoneria">
              Peso: <span className="font-medium text-foreground">{preview.weightKg.toFixed(2)} kg</span>
              {" · "}Costo: <span className="font-medium text-foreground">€ {formatEur(preview.cost)}</span>
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
                data-testid="toggle-advanced-lattoneria"
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
                        placeholder={
                          isSingle && selectedMaterial
                            ? parseFloat(String(selectedMaterial.singleMarginPercent ?? "0")).toString()
                            : selectedThickness
                              ? parseFloat(String(selectedThickness.marginPercent ?? "0")).toString()
                              : ""
                        }
                        {...field}
                        data-testid="input-margin-override"
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
                      <Input {...field} data-testid="input-description" />
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
