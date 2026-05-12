import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  Save,
  Loader2,
  Pencil,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { QuotePdfActions } from "@/pdf/QuotePdfActions";
import type { PdfQuote } from "@/pdf/quote-pdf-utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type {
  Material,
  MaterialThickness,
  MaterialThicknessWithFinishes,
  MaterialFinish,
  MaterialWithThicknesses,
  ArticleFamilyWithVariants,
  CatalogArticle,
  LaborRate,
  QuoteItemType,
  Opportunity,
} from "@shared/schema";

interface QuoteItemDraft {
  uid: string; // local id (for list ops)
  type: QuoteItemType;
  description: string;
  // LATTONERIA
  materialId?: string;
  materialThicknessId?: string;
  materialFinishId?: string;
  developmentMm?: string;
  // ARTICOLO
  catalogArticleId?: string;
  // GIORNATE
  laborRateId?: string;
  // MANUALE
  unitCost?: string;
  quantity: string;
  marginPercent?: string; // optional override
  // Sconto riga
  discountPercent?: string;
  overrideTotal?: string | null;
  // For display only — frozen on saved items
  unitOfMeasure?: string | null;
  baseTotal?: string | null; // prezzo calcolato prima di sconto/override
  totalRow?: string | null;
  // Cost/margin data for live summary panel
  costRow?: string | null;
  effectiveMargin?: string | null;
}

type QuoteItemPayload =
  | {
      type: "LATTONERIA";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
      materialId: string;
      materialThicknessId: string;
      materialFinishId?: string;
      developmentMm: string;
    }
  | {
      type: "ARTICOLO";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
      catalogArticleId: string;
    }
  | {
      type: "GIORNATE";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
      laborRateId: string;
    }
  | {
      type: "MANUALE";
      description: string;
      unitOfMeasure: string;
      quantity: string;
      unitCost: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
    };

interface QuoteSavePayload {
  subject: string | null;
  notes: string | null;
  number?: string;
  items: QuoteItemPayload[];
}

interface QuoteResponse {
  id: string;
  number: string;
  opportunityId: string;
  status: string;
  totalAmount: string;
  subject: string | null;
  notes: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    type: QuoteItemType | null;
    materialId: string | null;
    materialThicknessId: string | null;
    materialFinishId: string | null;
    catalogArticleId: string | null;
    laborRateId: string | null;
    description: string | null;
    unitOfMeasure: string | null;
    developmentMm: string | null;
    quantity: string;
    unitCost: string | null;
    marginPercent: string | null;
    discountPercent: string | null;
    overrideTotal: string | null;
    baseTotal: string | null;
    unitPriceApplied: string;
    totalRow: string;
    displayOrder: number;
  }>;
}

function formatEur(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function genUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ==================== Shared Discount/Override fields ====================

interface WithDiscountFields {
  discountPercent?: string;
  overrideTotal?: string;
}

function DiscountFields<T extends WithDiscountFields>({ form, baseTotal }: { form: UseFormReturn<T>; baseTotal: number | null }) {
  const discountPct = form.watch("discountPercent");
  const overrideTotalVal = form.watch("overrideTotal");

  const discountedTotal = useMemo(() => {
    if (baseTotal == null) return null;
    const pct = parseFloat(discountPct || "0");
    if (!isFinite(pct) || pct <= 0) return null;
    return baseTotal * (1 - pct / 100);
  }, [baseTotal, discountPct]);

  const overrideNum = useMemo(() => {
    const v = parseFloat(overrideTotalVal || "");
    return isFinite(v) && v >= 0 ? v : null;
  }, [overrideTotalVal]);

  const finalTotal = overrideNum != null ? overrideNum : discountedTotal;

  return (
    <div className="border-t pt-3 space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sconto / Override prezzo</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Sconto %</label>
          <Input
            type="number"
            step="any"
            min="0"
            max="100"
            placeholder="0"
            {...form.register("discountPercent")}
            data-testid="input-discount-percent"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Totale manuale (€)</label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="—"
            {...form.register("overrideTotal")}
            data-testid="input-override-total"
          />
        </div>
      </div>
      {(finalTotal != null || overrideNum != null) && baseTotal != null && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-sm" data-testid="discount-preview">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">Prezzo originale:</span>
            <span className="line-through text-muted-foreground">€ {formatEur(baseTotal)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold text-amber-800 dark:text-amber-200">
              € {formatEur(overrideNum != null ? overrideNum : (discountedTotal ?? baseTotal))}
            </span>
            {overrideNum == null && discountedTotal != null && (
              <span className="text-xs text-muted-foreground">(-{parseFloat(discountPct || "0").toFixed(1)}%)</span>
            )}
            {overrideNum != null && (
              <span className="text-xs text-muted-foreground">(manuale)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Type-specific add forms ====================

const discountFields = {
  discountPercent: z.string().optional(),
  overrideTotal: z.string().optional(),
};

const lattoneriaFormSchema = z.object({
  materialId: z.string().min(1, "Seleziona un materiale"),
  materialThicknessId: z.string().min(1, "Seleziona uno spessore"),
  materialFinishId: z.string().optional(),
  developmentMm: z.string().refine((v) => parseFloat(v) > 0, { message: "Sviluppo > 0" }),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Metri > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
  ...discountFields,
});

const articoloFormSchema = z.object({
  catalogArticleId: z.string().min(1, "Seleziona un articolo"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Quantità > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
  ...discountFields,
});

const giornateFormSchema = z.object({
  laborRateId: z.string().min(1, "Seleziona una manodopera"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Giorni > 0" }),
  description: z.string().optional(),
  marginPercent: z.string().optional(),
  ...discountFields,
});

const manualeFormSchema = z.object({
  description: z.string().trim().min(1, "Descrizione obbligatoria"),
  unitOfMeasure: z.string().trim().min(1, "Unità di misura obbligatoria"),
  quantity: z.string().refine((v) => parseFloat(v) > 0, { message: "Quantità deve essere > 0" }),
  unitCost: z.string().refine((v) => parseFloat(v) >= 0, { message: "Costo unitario >= 0" }),
  marginPercent: z.string().optional(),
  ...discountFields,
});

type QuoteItemDraftValues = Omit<QuoteItemDraft, "uid">;

interface AddRowDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (draft: QuoteItemDraft) => void;
  materials: MaterialWithThicknesses[];
  articleFamilies: ArticleFamilyWithVariants[];
  laborRates: LaborRate[];
}

function AddRowDialog({ open, onClose, onAdd, materials, articleFamilies, laborRates }: AddRowDialogProps) {
  const [type, setType] = useState<QuoteItemType>("LATTONERIA");

  useEffect(() => {
    if (open) setType("LATTONERIA");
  }, [open]);

  const handleSubmit = (d: QuoteItemDraftValues) => {
    onAdd({ uid: genUid(), ...d });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-add-row">
        <DialogHeader>
          <DialogTitle>Aggiungi riga al preventivo</DialogTitle>
          <DialogDescription>Scegli il tipo di voce da inserire</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Tipo riga</Label>
          <Select value={type} onValueChange={(v) => setType(v as QuoteItemType)}>
            <SelectTrigger data-testid="select-row-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LATTONERIA" data-testid="option-lattoneria">Lattoneria (sviluppo × metri)</SelectItem>
              <SelectItem value="ARTICOLO" data-testid="option-articolo">Articolo (catalogo)</SelectItem>
              <SelectItem value="GIORNATE" data-testid="option-giornate">Manodopera (giornate)</SelectItem>
              <SelectItem value="MANUALE" data-testid="option-manuale">Voce manuale (one-off)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "LATTONERIA" && (
          <LattoneriaForm materials={materials} onSubmit={handleSubmit} />
        )}
        {type === "ARTICOLO" && (
          <ArticoloForm articleFamilies={articleFamilies} onSubmit={handleSubmit} />
        )}
        {type === "GIORNATE" && (
          <GiornateForm laborRates={laborRates} onSubmit={handleSubmit} />
        )}
        {type === "MANUALE" && (
          <ManualeForm onSubmit={handleSubmit} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EditRowDialogProps {
  item: QuoteItemDraft | null;
  onClose: () => void;
  onUpdate: (uid: string, draft: QuoteItemDraftValues) => void;
  materials: MaterialWithThicknesses[];
  articleFamilies: ArticleFamilyWithVariants[];
  laborRates: LaborRate[];
}

function EditRowDialog({ item, onClose, onUpdate, materials, articleFamilies, laborRates }: EditRowDialogProps) {
  const open = item !== null;

  const handleSubmit = (d: QuoteItemDraftValues) => {
    if (!item) return;
    onUpdate(item.uid, d);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-edit-row">
        <DialogHeader>
          <DialogTitle>Modifica riga del preventivo</DialogTitle>
          <DialogDescription>Aggiorna i campi e salva per ricalcolare il prezzo</DialogDescription>
        </DialogHeader>

        {item?.type === "LATTONERIA" && (
          <LattoneriaForm
            key={item.uid}
            materials={materials}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-lattoneria-row"
            onSubmit={handleSubmit}
          />
        )}
        {item?.type === "ARTICOLO" && (
          <ArticoloForm
            key={item.uid}
            articleFamilies={articleFamilies}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-articolo-row"
            onSubmit={handleSubmit}
          />
        )}
        {item?.type === "GIORNATE" && (
          <GiornateForm
            key={item.uid}
            laborRates={laborRates}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-giornate-row"
            onSubmit={handleSubmit}
          />
        )}
        {item?.type === "MANUALE" && (
          <ManualeForm
            key={item.uid}
            initial={item}
            submitLabel="Salva modifiche"
            submitTestId="button-save-manuale-row"
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LattoneriaForm({
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
      developmentMm: initial?.developmentMm ?? "",
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
  const developmentMm = form.watch("developmentMm");
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

  // Reset thickness when material changes
  useEffect(() => {
    if (selectedThicknessId && selectedMaterial &&
        !selectedMaterial.thicknesses?.some((t) => t.id === selectedThicknessId)) {
      form.setValue("materialThicknessId", "");
      form.setValue("materialFinishId", "");
    }
  }, [selectedMaterialId, selectedMaterial, selectedThicknessId, form]);

  // Reset finish when thickness changes
  useEffect(() => {
    if (selectedFinishId && selectedThickness &&
        !selectedThickness.finishes?.some((f) => f.id === selectedFinishId)) {
      form.setValue("materialFinishId", "");
    }
  }, [selectedThicknessId, selectedThickness, selectedFinishId, form]);

  const preview = useMemo(() => {
    if (!selectedMaterial || !selectedThickness) return null;
    const dev = parseFloat(developmentMm || "0");
    const meters = parseFloat(quantity || "0");
    const thickMm = parseFloat(selectedThickness.thicknessMm);
    const density = parseFloat(selectedMaterial.density);
    // Use material-level price if SINGLE, variant price if PER_VARIANT
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
  }, [selectedMaterial, selectedThickness, developmentMm, quantity, marginOverride, isSingle]);

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
      developmentMm: vals.developmentMm,
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

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        <FormField
          control={form.control}
          name="materialId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Materiale</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-material">
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
            name="developmentMm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sviluppo (cm)</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} data-testid="input-development-mm" />
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
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="preview-lattoneria">
            <div>Peso stimato: <span className="font-medium">{preview.weightKg.toFixed(2)} kg</span></div>
            <div>Costo: <span className="font-medium">€ {formatEur(preview.cost)}</span></div>
            <div>Margine applicato: <span className="font-medium">{preview.margin.toFixed(2)}%</span></div>
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

function ArticoloForm({
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
  // Find initial family from initial catalogArticleId
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

  // Reset variant when family changes
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

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        {/* Step 1: Select Family */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Famiglia articoli</label>
          <Select value={selectedFamilyId} onValueChange={setSelectedFamilyId}>
            <SelectTrigger data-testid="select-article-family">
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

        {/* Step 2: Select Variant */}
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
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione (opzionale)</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-description-articolo" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="preview-articolo">
            <div>Costo: <span className="font-medium">€ {formatEur(preview.cost)}</span></div>
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

function GiornateForm({
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

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-3">
        <FormField
          control={form.control}
          name="laborRateId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Manodopera</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-labor-rate">
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
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="preview-giornate">
            <div>Costo: <span className="font-medium">€ {formatEur(preview.cost)}</span></div>
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

function ManualeForm({
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

// ==================== Main editor ====================

export default function QuoteEditorPage() {
  const params = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  // Determine mode: if route is /opportunities/:id/quotes/new => create with opportunityId = params.id
  // If /quotes/:id => edit existing quote with quoteId = params.id
  const isNew = location.startsWith("/opportunities/");
  const opportunityIdFromRoute = isNew ? params.id : null;
  const quoteId = isNew ? null : params.id;

  const [items, setItems] = useState<QuoteItemDraft[]>([]);
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [number, setNumber] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuoteItemDraft | null>(null);

  const materialsQuery = useQuery<MaterialWithThicknesses[]>({ queryKey: ["/api/materials"] });
  const articleFamiliesQuery = useQuery<ArticleFamilyWithVariants[]>({ queryKey: ["/api/article-families"] });
  const laborRatesQuery = useQuery<LaborRate[]>({ queryKey: ["/api/labor-rates"] });

  // Existing quote (edit mode)
  const quoteQuery = useQuery<QuoteResponse>({
    queryKey: ["/api/quotes", quoteId],
    enabled: !!quoteId,
  });

  // Next number (create mode)
  const nextNumberQuery = useQuery<{ number: string }>({
    queryKey: ["/api/quotes/next-number"],
    enabled: isNew,
  });

  // Opportunity for header (loaded once we know the opportunityId)
  const opportunityId = isNew ? opportunityIdFromRoute : quoteQuery.data?.opportunityId;
  const opportunityQuery = useQuery<Opportunity>({
    queryKey: ["/api/opportunities", opportunityId],
    enabled: !!opportunityId,
  });

  // Hydrate state from loaded quote
  useEffect(() => {
    if (!quoteQuery.data) return;
    const q = quoteQuery.data;
    setSubject(q.subject || "");
    setNotes(q.notes || "");
    setNumber(q.number);
    setItems(
      (q.items || [])
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((i) => {
          const qty = parseFloat(i.quantity);
          const unitCostVal = parseFloat(i.unitCost || "0");
          const marginPct = parseFloat(i.marginPercent || "0");
          const totalRowVal = parseFloat(i.totalRow);
          // Derive costRow from saved data.
          // For ARTICOLO, GIORNATE, MANUALE: unitCost is per unit of quantity, so cost = unitCost * qty.
          // For LATTONERIA: unitCost is stored as €/kg (incompatible with ml quantity), so always use
          // the reverse-margin formula: cost = preDiscountTotal / (1 + marginPercent/100).
          // Prefer baseTotal over totalRow for the reverse-margin formula — baseTotal is the pre-discount
          // price, so it gives the true cost even when a discount/override has been applied.
          let costRow: string | null = null;
          const canUseUnitCost = i.type !== "LATTONERIA" && i.unitCost && isFinite(unitCostVal) && isFinite(qty);
          if (canUseUnitCost) {
            costRow = (unitCostVal * qty).toFixed(2);
          } else if (isFinite(marginPct) && marginPct >= 0) {
            const baseTotalVal = parseFloat(i.baseTotal || "");
            const refTotal = isFinite(baseTotalVal) && baseTotalVal > 0 ? baseTotalVal : totalRowVal;
            if (isFinite(refTotal)) {
              costRow = (refTotal / (1 + marginPct / 100)).toFixed(2);
            }
          }
          // Recalculate effective margin % to reflect post-discount/override revenue
          // Formula: (finalRevenue - cost) / cost * 100
          // Cost is estimated from baseTotal and original marginPercent
          let effectiveMargin: string | null = i.marginPercent || null;
          if (i.baseTotal && i.totalRow && i.marginPercent) {
            const baseTotalNum = parseFloat(i.baseTotal);
            const finalTotalNum = parseFloat(i.totalRow);
            const marginPctNum = parseFloat(i.marginPercent);
            const estimatedCost = baseTotalNum / (1 + marginPctNum / 100);
            if (estimatedCost > 0 && isFinite(estimatedCost)) {
              effectiveMargin = ((finalTotalNum - estimatedCost) / estimatedCost * 100).toFixed(4);
            }
          }
          return {
            uid: i.id,
            type: (i.type ?? "ARTICOLO") as QuoteItemType,
            description: i.description || "",
            materialId: i.materialId || undefined,
            materialThicknessId: i.materialThicknessId || undefined,
            materialFinishId: i.materialFinishId || undefined,
            developmentMm: i.developmentMm || undefined,
            catalogArticleId: i.catalogArticleId || undefined,
            laborRateId: i.laborRateId || undefined,
            unitCost: i.type === "MANUALE" ? (i.unitCost || "0") : undefined,
            quantity: i.quantity,
            marginPercent: i.marginPercent || undefined,
            discountPercent: i.discountPercent && parseFloat(i.discountPercent) > 0 ? i.discountPercent : undefined,
            overrideTotal: i.overrideTotal || null,
            unitOfMeasure: i.unitOfMeasure,
            baseTotal: i.baseTotal || i.totalRow,
            totalRow: i.totalRow,
            costRow,
            effectiveMargin,
          };
        }),
    );
  }, [quoteQuery.data]);

  // Hydrate next number for new quotes
  useEffect(() => {
    if (isNew && nextNumberQuery.data?.number && !number) {
      setNumber(nextNumberQuery.data.number);
    }
  }, [isNew, nextNumberQuery.data, number]);

  const totalEstimated = useMemo(() => {
    return items.reduce((sum, it) => sum + parseFloat(it.totalRow || "0"), 0);
  }, [items]);

  const quoteSummary = useMemo(() => {
    let totalCost = 0;
    const marginGroups = new Map<number, { count: number; revenue: number; cost: number }>();

    for (const it of items) {
      const revenue = parseFloat(it.totalRow || "0");
      const cost = parseFloat(it.costRow || "0");
      const margin = parseFloat(it.effectiveMargin || "0");
      const marginKey = Math.round((isFinite(margin) ? margin : 0) * 10) / 10;

      totalCost += isFinite(cost) ? cost : 0;

      const group = marginGroups.get(marginKey) ?? { count: 0, revenue: 0, cost: 0 };
      group.count++;
      group.revenue += isFinite(revenue) ? revenue : 0;
      group.cost += isFinite(cost) ? cost : 0;
      marginGroups.set(marginKey, group);
    }

    const totalMarginEur = totalEstimated - totalCost;
    const distinctMargins = Array.from(marginGroups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([percent, { count, revenue, cost }]) => ({ percent, count, revenue, cost }));

    return { totalCost, totalMarginEur, distinctMargins };
  }, [items, totalEstimated]);

  function buildPayload(): QuoteSavePayload {
    return {
      subject: subject || null,
      notes: notes || null,
      number: isNew ? (number || undefined) : undefined,
      items: items.map((it): QuoteItemPayload => {
        const margin =
          it.marginPercent !== undefined && it.marginPercent !== ""
            ? it.marginPercent
            : undefined;
        const discount = it.discountPercent && it.discountPercent !== "0" ? it.discountPercent : undefined;
        const override = it.overrideTotal != null && it.overrideTotal !== "" ? it.overrideTotal : null;
        if (it.type === "LATTONERIA") {
          return {
            type: "LATTONERIA",
            description: it.description || null,
            quantity: it.quantity,
            marginPercent: margin,
            discountPercent: discount,
            overrideTotal: override,
            materialId: it.materialId ?? "",
            materialThicknessId: it.materialThicknessId ?? "",
            materialFinishId: it.materialFinishId || undefined,
            developmentMm: it.developmentMm ?? "",
          };
        }
        if (it.type === "ARTICOLO") {
          return {
            type: "ARTICOLO",
            description: it.description || null,
            quantity: it.quantity,
            marginPercent: margin,
            discountPercent: discount,
            overrideTotal: override,
            catalogArticleId: it.catalogArticleId ?? "",
          };
        }
        if (it.type === "MANUALE") {
          return {
            type: "MANUALE",
            description: it.description,
            unitOfMeasure: it.unitOfMeasure ?? "",
            quantity: it.quantity,
            unitCost: it.unitCost ?? "0",
            marginPercent: margin,
            discountPercent: discount,
            overrideTotal: override,
          };
        }
        return {
          type: "GIORNATE",
          description: it.description || null,
          quantity: it.quantity,
          marginPercent: margin,
          discountPercent: discount,
          overrideTotal: override,
          laborRateId: it.laborRateId ?? "",
        };
      }),
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (isNew) {
        const res = await apiRequest(
          "POST",
          `/api/opportunities/${opportunityIdFromRoute}/quotes`,
          payload,
        );
        return (await res.json()) as QuoteResponse;
      } else {
        const res = await apiRequest("PUT", `/api/quotes/${quoteId}`, payload);
        return (await res.json()) as QuoteResponse;
      }
    },
    onSuccess: (data) => {
      toast({ title: "Preventivo salvato", description: `Numero ${data.number}` });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", data.id] });
      if (opportunityId) {
        queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "quotes"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/quotes/next-number"] });
      if (isNew) {
        navigate(`/quotes/${data.id}`);
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Impossibile salvare il preventivo";
      toast({
        title: "Errore",
        description: message,
        variant: "destructive",
      });
    },
  });

  function moveItem(uid: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.uid === uid);
      if (idx < 0) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const next = prev.slice();
      const [it] = next.splice(idx, 1);
      next.splice(ni, 0, it);
      return next;
    });
  }

  function deleteItem(uid: string) {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  }

  function updateItem(uid: string, draft: QuoteItemDraftValues) {
    setItems((prev) => prev.map((i) => (i.uid === uid ? { uid, ...draft } : i)));
  }

  const isLoading =
    materialsQuery.isLoading ||
    articleFamiliesQuery.isLoading ||
    laborRatesQuery.isLoading ||
    (!isNew && quoteQuery.isLoading) ||
    (isNew && nextNumberQuery.isLoading);

  const loadError = quoteQuery.error;

  function rowTypeBadge(type: QuoteItemType) {
    const map: Record<QuoteItemType, { label: string; cls: string }> = {
      LATTONERIA: { label: "Lattoneria", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
      ARTICOLO: { label: "Articolo", cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" },
      GIORNATE: { label: "Manodopera", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
      MANUALE: { label: "Manuale", cls: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" },
    };
    const v = map[type];
    return <Badge className={v.cls} variant="secondary" data-testid={`badge-row-type-${type}`}>{v.label}</Badge>;
  }

  function rowDetailsForItem(it: QuoteResponse["items"][number]): string {
    if (it.type === "LATTONERIA") {
      const m = materialsQuery.data?.find((x) => x.id === it.materialId);
      const t = m?.thicknesses?.find((x) => x.id === it.materialThicknessId) as
        | MaterialThicknessWithFinishes
        | undefined;
      const f = it.materialFinishId ? t?.finishes?.find((x) => x.id === it.materialFinishId) : undefined;
      if (m && t) {
        return `${m.name} ${parseFloat(t.thicknessMm)}mm${f ? ` — ${f.name}` : ""}`;
      }
      return it.description || "Lattoneria";
    }
    if (it.type === "ARTICOLO") {
      for (const fam of (articleFamiliesQuery.data ?? [])) {
        const v = fam.variants.find((x) => x.id === it.catalogArticleId);
        if (v) return `${fam.name} – ${v.name}`;
      }
      return it.description || "Articolo";
    }
    if (it.type === "MANUALE") {
      return it.description || "Voce manuale";
    }
    const l = laborRatesQuery.data?.find((x) => x.id === it.laborRateId);
    return it.description || l?.name || "Manodopera";
  }

  function buildPdfQuote(q: QuoteResponse): PdfQuote {
    return {
      id: q.id,
      number: q.number,
      subject: q.subject,
      notes: q.notes,
      totalAmount: q.totalAmount,
      createdAt: q.createdAt,
      items: q.items
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((it) => ({
          id: it.id,
          type: it.type,
          description: it.description,
          unitOfMeasure: it.unitOfMeasure,
          developmentMm: it.developmentMm,
          quantity: it.quantity,
          unitPriceApplied: it.unitPriceApplied,
          totalRow: it.totalRow,
          displayOrder: it.displayOrder,
          discountPercent: it.discountPercent ?? null,
          overrideTotal: it.overrideTotal ?? null,
          baseTotal: it.baseTotal ?? null,
        })),
    };
  }

  function fmtQty(value: string | number | null | undefined): string {
    const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
    if (!isFinite(n)) return "?";
    return n.toLocaleString("it-IT", { maximumFractionDigits: 4 });
  }

  function rowDetails(it: QuoteItemDraft): string {
    if (it.type === "LATTONERIA") {
      const m = materialsQuery.data?.find((x) => x.id === it.materialId);
      const t = m?.thicknesses?.find((x) => x.id === it.materialThicknessId) as MaterialThicknessWithFinishes | undefined;
      const f = it.materialFinishId ? t?.finishes?.find((x) => x.id === it.materialFinishId) : undefined;
      const desc = it.description ||
        (m && t ? `${m.name} ${parseFloat(t.thicknessMm)}mm${f ? ` — ${f.name}` : ""}` : "Lattoneria");
      return `${desc} — sviluppo ${it.developmentMm ? fmtQty(it.developmentMm) : "?"}cm × ${fmtQty(it.quantity)} ml`;
    }
    if (it.type === "ARTICOLO") {
      let variantName: string | undefined;
      for (const fam of (articleFamiliesQuery.data ?? [])) {
        const v = fam.variants.find((x) => x.id === it.catalogArticleId);
        if (v) { variantName = `${fam.name} – ${v.name}`; break; }
      }
      const desc = it.description || variantName || "Articolo";
      return `${desc} — ${fmtQty(it.quantity)} ${it.unitOfMeasure || "pz"}`;
    }
    if (it.type === "MANUALE") {
      return `${it.description || "Voce manuale"} — ${it.quantity} ${it.unitOfMeasure || "pz"}`;
    }
    const l = laborRatesQuery.data?.find((x) => x.id === it.laborRateId);
    const desc = it.description || l?.name || "Manodopera";
    return `${desc} — ${fmtQty(it.quantity)} gg`;
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-4" data-testid="page-quote-editor">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isNew ? "Nuovo preventivo" : `Preventivo ${number}`}
          </h1>
          {opportunityQuery.data && (
            <div className="text-sm text-muted-foreground">
              Opportunità:{" "}
              <Link href={`/opportunities?selected=${opportunityQuery.data.id}`} className="underline">
                {opportunityQuery.data.title}
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            data-testid="button-save-quote"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salva preventivo
          </Button>
          {!isNew && quoteQuery.data && (
            <QuotePdfActions
              quote={buildPdfQuote(quoteQuery.data)}
              opportunity={opportunityQuery.data ?? null}
              opportunityLoading={opportunityQuery.isLoading}
              resolveItemName={(id) => {
                const it = quoteQuery.data!.items.find((x) => x.id === id);
                if (!it) return undefined;
                return rowDetailsForItem(it);
              }}
              disabled={saveMutation.isPending}
            />
          )}
        </div>
      </div>

      {loadError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Errore nel caricamento del preventivo: {loadError instanceof Error ? loadError.message : "errore sconosciuto"}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Intestazione</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="quote-number">Numero preventivo</Label>
                <Input
                  id="quote-number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  disabled={!isNew}
                  data-testid="input-quote-number"
                />
              </div>
              <div className="space-y-1">
                <Label>Data</Label>
                <Input
                  value={
                    quoteQuery.data?.createdAt
                      ? format(new Date(quoteQuery.data.createdAt), "dd MMMM yyyy", { locale: it })
                      : format(new Date(), "dd MMMM yyyy", { locale: it })
                  }
                  disabled
                  data-testid="input-quote-date"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="quote-subject">Oggetto</Label>
                <Input
                  id="quote-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Es. Fornitura e posa lattoneria copertura..."
                  data-testid="input-quote-subject"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="quote-notes">Note</Label>
                <Textarea
                  id="quote-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Note libere per il preventivo"
                  data-testid="input-quote-notes"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Righe</CardTitle>
              <Button onClick={() => setAddOpen(true)} size="sm" data-testid="button-open-add-row">
                <Plus className="w-4 h-4 mr-2" />
                Aggiungi riga
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-rows">
                  Nessuna riga. Aggiungi la prima voce con "Aggiungi riga".
                </div>
              ) : (
                <Table data-testid="table-quote-items">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Tipo</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                      <TableHead className="w-[140px] text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, idx) => (
                      <TableRow
                        key={it.uid}
                        onClick={() => setEditingItem(it)}
                        className="cursor-pointer hover-elevate"
                        data-testid={`row-quote-item-${it.uid}`}
                      >
                        <TableCell>{rowTypeBadge(it.type)}</TableCell>
                        <TableCell className="text-sm">{rowDetails(it)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {(() => {
                            const hasDiscount = (it.discountPercent && parseFloat(it.discountPercent) > 0) || (it.overrideTotal != null && it.overrideTotal !== "");
                            const originalTotal = it.baseTotal ? parseFloat(it.baseTotal) : null;
                            const finalTotal = it.totalRow ? parseFloat(it.totalRow) : null;
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                {hasDiscount && originalTotal != null && (
                                  <span className="line-through text-muted-foreground text-xs" data-testid={`text-original-total-${it.uid}`}>
                                    € {formatEur(originalTotal)}
                                  </span>
                                )}
                                <span data-testid={`text-total-${it.uid}`} className={hasDiscount ? "text-amber-700 dark:text-amber-300" : ""}>
                                  {finalTotal != null ? `€ ${formatEur(finalTotal)}` : "—"}
                                </span>
                                {hasDiscount && it.discountPercent && parseFloat(it.discountPercent) > 0 && it.overrideTotal == null && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400" data-testid={`badge-discount-${it.uid}`}>
                                    -{parseFloat(it.discountPercent).toFixed(1)}%
                                  </span>
                                )}
                                {it.overrideTotal != null && it.overrideTotal !== "" && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400" data-testid={`badge-override-${it.uid}`}>
                                    manuale
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditingItem(it)}
                              data-testid={`button-edit-${it.uid}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={idx === 0}
                              onClick={() => moveItem(it.uid, -1)}
                              data-testid={`button-move-up-${it.uid}`}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={idx === items.length - 1}
                              onClick={() => moveItem(it.uid, 1)}
                              data-testid={`button-move-down-${it.uid}`}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteItem(it.uid)}
                              data-testid={`button-delete-${it.uid}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="mt-4 pt-3 border-t" data-testid="quote-summary-panel">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  {items.length > 0 && (
                    <div className="text-sm space-y-1" data-testid="quote-cost-summary">
                      <div className="flex items-center gap-6">
                        <span className="text-muted-foreground w-28">Costo totale</span>
                        <span className="font-semibold">€ {formatEur(quoteSummary.totalCost)}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-muted-foreground w-28">Margine €</span>
                        <span className="font-semibold">€ {formatEur(quoteSummary.totalMarginEur)}</span>
                      </div>
                      {quoteSummary.distinctMargins.length === 1 ? (
                        <div className="flex items-center gap-6">
                          <span className="text-muted-foreground w-28">Margine %</span>
                          <span className="font-semibold">{quoteSummary.distinctMargins[0].percent.toFixed(1)}%</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-muted-foreground mb-0.5">Margini %</div>
                          <div className="pl-2 space-y-0.5">
                            {quoteSummary.distinctMargins.map((g) => (
                              <div key={g.percent} className="flex items-center gap-4" data-testid={`margin-group-${g.percent}`}>
                                <span className="font-semibold w-12">{g.percent.toFixed(1)}%</span>
                                <span className="text-muted-foreground text-xs">
                                  {g.count} {g.count === 1 ? "riga" : "righe"} — € {formatEur(g.revenue)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-right sm:ml-auto">
                    <div className="text-xs text-muted-foreground">Totale stimato</div>
                    <div className="text-2xl font-semibold" data-testid="text-total">
                      € {formatEur(totalEstimated)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      I prezzi vengono ricalcolati e congelati al salvataggio
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <AddRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(d) => setItems((prev) => [...prev, d])}
        materials={materialsQuery.data || []}
        articleFamilies={articleFamiliesQuery.data || []}
        laborRates={laborRatesQuery.data || []}
      />

      <EditRowDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onUpdate={updateItem}
        materials={materialsQuery.data || []}
        articleFamilies={articleFamiliesQuery.data || []}
        laborRates={laborRatesQuery.data || []}
      />
    </div>
  );
}
