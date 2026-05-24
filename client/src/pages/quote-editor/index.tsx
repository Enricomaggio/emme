import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  FileCheck,
  Save,
  Loader2,
  Pencil,
  Send,
  CheckCircle2,
  ArrowRightLeft,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type {
  MaterialThicknessWithFinishes,
  MaterialWithThicknesses,
  ArticleFamilyWithVariants,
  LaborRate,
  QuoteItemType,
  Opportunity,
} from "@shared/schema";
import { AddRowDialog } from "./components/AddRowDialog";
import { EditRowDialog } from "./components/EditRowDialog";
import type { QuoteItemDraft, QuoteItemPayload, QuoteSavePayload, QuoteResponse } from "./types";
import type { QuoteItemDraftValues } from "./schemas";
import { formatEur } from "./utils";

export default function QuoteEditorPage() {
  const params = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  // Determine mode: if route is /opportunities/:id/quotes/new => create with opportunityId = params.id
  // If /quotes/:id => edit existing quote with quoteId = params.id
  const isNew = location.startsWith("/opportunities/");
  const opportunityIdFromRoute = isNew ? params.id : null;
  const quoteId = isNew ? null : params.id;

  // Nota Lavori mode: ?nl=true nell'URL
  const isNLMode = new URLSearchParams(window.location.search).get("nl") === "true";

  const [items, setItems] = useState<QuoteItemDraft[]>([]);
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [number, setNumber] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuoteItemDraft | null>(null);
  const [globalDiscountMode, setGlobalDiscountMode] = useState<"percent" | "euro">("percent");
  const [globalDiscountValue, setGlobalDiscountValue] = useState<string>("");
  // Prezzi pannello cliente: uid → valore stringa (€)
  const [clientPrices, setClientPrices] = useState<Record<string, string>>({});

  const materialsQuery = useQuery<MaterialWithThicknesses[]>({ queryKey: ["/api/materials"] });
  const articleFamiliesQuery = useQuery<ArticleFamilyWithVariants[]>({ queryKey: ["/api/article-families"] });
  const laborRatesQuery = useQuery<LaborRate[]>({ queryKey: ["/api/labor-rates"] });

  // Existing quote (edit mode)
  const quoteQuery = useQuery<QuoteResponse>({
    queryKey: ["/api/quotes", quoteId],
    enabled: !!quoteId,
  });

  // Next number (create mode). staleTime:0 so a freshly-opened editor always
  // refetches and shows the latest "preview" number, reducing the chance of
  // two concurrent tabs both displaying the same pre-save value.
  const nextNumberQuery = useQuery<{ number: string }>({
    queryKey: ["/api/quotes/next-number"],
    enabled: isNew,
    staleTime: 0,
  });

  // Opportunity for header (loaded once we know the opportunityId)
  const opportunityId = isNew ? opportunityIdFromRoute : quoteQuery.data?.opportunityId;
  const opportunityQuery = useQuery<Opportunity>({
    queryKey: ["/api/opportunities", opportunityId],
    enabled: !!opportunityId,
  });

  // Estrae i prezzi cliente da una risposta server (uid → clientTotal)
  function hydrateClientPricesFromResponse(rawItems: QuoteResponse["items"]): Record<string, string> {
    const cp: Record<string, string> = {};
    for (const i of rawItems) {
      if (i.clientTotal != null && i.clientTotal !== "" && i.type !== "GIORNATE") {
        cp[i.id] = i.clientTotal;
      }
    }
    return cp;
  }

  // Hydrate a raw API items array into local QuoteItemDraft[]
  function hydrateItemsFromResponse(rawItems: QuoteResponse["items"]): QuoteItemDraft[] {
    return rawItems
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((i) => {
        const qty = parseFloat(i.quantity);
        const unitCostVal = parseFloat(i.unitCost || "0");
        const marginPct = parseFloat(i.marginPercent || "0");
        const totalRowVal = parseFloat(i.totalRow);
        // Derive costRow from saved data.
        // For LATTONERIA: weightKg * unitCost gives the exact material cost if both fields are
        // present. Fall back to the reverse-margin formula when weightKg is missing.
        // For ARTICOLO, GIORNATE, MANUALE: unitCost is per unit of quantity, so cost = unitCost * qty.
        let costRow: string | null = null;
        if (i.type === "LATTONERIA") {
          const weightKgVal = parseFloat(i.weightKg || "");
          if (isFinite(weightKgVal) && weightKgVal > 0 && isFinite(unitCostVal)) {
            costRow = (weightKgVal * unitCostVal).toFixed(2);
          } else if (isFinite(marginPct) && marginPct >= 0) {
            const baseTotalVal = parseFloat(i.baseTotal || "");
            const refTotal = isFinite(baseTotalVal) && baseTotalVal > 0 ? baseTotalVal : totalRowVal;
            if (isFinite(refTotal)) {
              costRow = (refTotal / (1 + marginPct / 100)).toFixed(2);
            }
          }
        } else {
          const canUseUnitCost = i.unitCost && isFinite(unitCostVal) && isFinite(qty);
          if (canUseUnitCost) {
            costRow = (unitCostVal * qty).toFixed(2);
          } else if (isFinite(marginPct) && marginPct >= 0) {
            const baseTotalVal = parseFloat(i.baseTotal || "");
            const refTotal = isFinite(baseTotalVal) && baseTotalVal > 0 ? baseTotalVal : totalRowVal;
            if (isFinite(refTotal)) {
              costRow = (refTotal / (1 + marginPct / 100)).toFixed(2);
            }
          }
        }
        // Recalculate effective margin % to reflect post-discount/override revenue
        // Formula: (finalRevenue - cost) / cost * 100
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
          developmentCm: i.developmentCm || undefined,
          catalogArticleId: i.catalogArticleId || undefined,
          laborRateId: i.laborRateId || undefined,
          unitCost: i.type === "MANUALE" ? (i.unitCost || "0") : undefined,
          unitCostPerKg: i.type === "LATTONERIA" ? (i.unitCost || null) : undefined,
          quantity: i.quantity,
          marginPercent: i.marginPercent || undefined,
          discountPercent: i.discountPercent && parseFloat(i.discountPercent) > 0 ? i.discountPercent : undefined,
          overrideTotal: i.overrideTotal || null,
          unitOfMeasure: i.unitOfMeasure,
          baseTotal: i.baseTotal || i.totalRow,
          totalRow: i.totalRow,
          costRow,
          effectiveMargin,
          isInternalOnly: i.isInternalOnly ?? false,
          clientTotal: i.clientTotal || null,
        };
      });
  }

  // Hydrate state from loaded quote — only once per quoteId, so refetches
  // (window-focus, polling) don't overwrite the user's unsaved edits.
  const hydratedQuoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!quoteQuery.data || !quoteId) return;
    if (hydratedQuoteIdRef.current === quoteId) return;
    const q = quoteQuery.data;
    setSubject(q.subject || "");
    setNotes(q.notes || "");
    setNumber(q.number);
    setItems(hydrateItemsFromResponse(q.items || []));
    setClientPrices(hydrateClientPricesFromResponse(q.items || []));
    if (q.discounts?.globalDiscountMode) {
      setGlobalDiscountMode(q.discounts.globalDiscountMode);
      const val = q.discounts.globalDiscountMode === "percent"
        ? q.discounts.globalDiscountPercent
        : q.discounts.globalDiscountAmount;
      setGlobalDiscountValue(val != null && val > 0 ? String(val) : "");
    } else {
      setGlobalDiscountMode("percent");
      setGlobalDiscountValue("");
    }
    hydratedQuoteIdRef.current = quoteId;
  }, [quoteQuery.data, quoteId]);

  // Hydrate next number for new quotes
  useEffect(() => {
    if (isNew && nextNumberQuery.data?.number && !number) {
      setNumber(nextNumberQuery.data.number);
    }
  }, [isNew, nextNumberQuery.data, number]);

  const totalEstimated = useMemo(() => {
    return items.reduce((sum, it) => sum + parseFloat(it.totalRow || "0"), 0);
  }, [items]);

  const globalDiscountAmount = useMemo(() => {
    const val = parseFloat(globalDiscountValue || "0");
    if (!isFinite(val) || val <= 0) return 0;
    let raw: number;
    if (globalDiscountMode === "percent") {
      // Clamp percent to 100% max
      const pct = Math.min(val, 100);
      raw = totalEstimated * pct / 100;
    } else {
      raw = val;
    }
    // Never discount more than the subtotal
    return Math.min(raw, totalEstimated);
  }, [globalDiscountMode, globalDiscountValue, totalEstimated]);

  const totalAfterDiscount = useMemo(() => {
    return Math.max(0, totalEstimated - globalDiscountAmount);
  }, [totalEstimated, globalDiscountAmount]);

  // Totale pannello cliente (somma prezzi impostati o totalRow come fallback)
  const clientTotalAmount = useMemo(() => {
    return items
      .filter((it) => it.type !== "GIORNATE")
      .reduce((sum, it) => {
        const price = clientPrices[it.uid];
        const val = parseFloat(price != null ? price : (it.totalRow || "0"));
        return sum + (isFinite(val) ? val : 0);
      }, 0);
  }, [items, clientPrices]);

  const isBalanced = Math.abs(clientTotalAmount - totalAfterDiscount) < 0.02;

  // Distribuisce il costo GIORNATE proporzionalmente sui non-GIORNATE
  function handleSpalma() {
    const nonLaborItems = items.filter((it) => it.type !== "GIORNATE");
    const giornateItems = items.filter((it) => it.type === "GIORNATE");

    const laborTotal = giornateItems.reduce((sum, it) => sum + parseFloat(it.totalRow || "0"), 0);
    const nonLaborBaseTotal = nonLaborItems.reduce((sum, it) => sum + parseFloat(it.totalRow || "0"), 0);

    if (nonLaborItems.length === 0 || nonLaborBaseTotal <= 0) return;

    const r2 = (n: number) => Math.round(n * 100) / 100;

    const newValues: string[] = nonLaborItems.map((it) => {
      const itemTotal = parseFloat(it.totalRow || "0");
      return String(r2(itemTotal + laborTotal * itemTotal / nonLaborBaseTotal));
    });

    // Ultimo item assorbe gli arrotondamenti
    if (newValues.length > 0) {
      const sumExceptLast = newValues
        .slice(0, -1)
        .reduce((s, p) => s + parseFloat(p), 0);
      const lastPrice = r2(totalAfterDiscount - sumExceptLast);
      newValues[newValues.length - 1] = String(Math.max(0, lastPrice));
    }

    const updated: Record<string, string> = {};
    nonLaborItems.forEach((it, i) => {
      updated[it.uid] = newValues[i];
    });
    setClientPrices((prev) => ({ ...prev, ...updated }));
  }

  const quoteSummary = useMemo(() => {
    let totalCost = 0;
    for (const it of items) {
      const cost = parseFloat(it.costRow || "0");
      totalCost += isFinite(cost) ? cost : 0;
    }

    // Margin is computed against the discounted total, not the raw subtotal
    const totalMarginEur = totalAfterDiscount - totalCost;
    const avgMarginPercent = totalAfterDiscount !== 0 ? (totalMarginEur / totalAfterDiscount) * 100 : 0;

    return { totalCost, totalMarginEur, avgMarginPercent };
  }, [items, totalAfterDiscount]);

  function buildPayload(): QuoteSavePayload {
    const gdVal = parseFloat(globalDiscountValue || "0");
    const globalDiscount = isFinite(gdVal) && gdVal > 0
      ? { mode: globalDiscountMode, value: gdVal }
      : undefined;
    return {
      subject: subject || null,
      notes: notes || null,
      number: isNew ? (number || undefined) : undefined,
      globalDiscount,
      items: items.map((it): QuoteItemPayload => {
        const margin =
          it.marginPercent !== undefined && it.marginPercent !== ""
            ? it.marginPercent
            : undefined;
        const discount = it.discountPercent && it.discountPercent !== "0" ? it.discountPercent : undefined;
        const override = it.overrideTotal != null && it.overrideTotal !== "" ? it.overrideTotal : null;
        // clientTotal dal pannello destra (solo non-GIORNATE)
        const rawCp = clientPrices[it.uid];
        const clientTotal = rawCp != null ? rawCp : null;
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
            developmentCm: it.developmentCm ?? "",
            clientTotal,
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
            clientTotal,
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
            clientTotal,
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
          isInternalOnly: true,
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
      } else {
        // Immediately refresh local items from the server response so the summary
        // panel reflects the re-computed unitCost/baseTotal (e.g. after a SINGLE-mode
        // material price change) without waiting for the query to re-fetch.
        setItems(hydrateItemsFromResponse(data.items || []));
        setClientPrices(hydrateClientPricesFromResponse(data.items || []));
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

  // ─── Nota Lavori mutations (NL mode only) ────────────────────────────────
  const nlSendMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${quoteId}/work-order/send`),
    onSuccess: () => {
      toast({ title: "Nota lavori segnata come inviata" });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId] });
      if (opportunityId) queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "quotes"] });
    },
    onError: () => toast({ title: "Errore", description: "Impossibile aggiornare lo stato", variant: "destructive" }),
  });

  const nlConfirmMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${quoteId}/work-order/confirm`),
    onSuccess: () => {
      toast({ title: "Nota lavori confermata — pronta per fatturazione" });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", quoteId] });
      if (opportunityId) queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "quotes"] });
    },
    onError: () => toast({ title: "Errore", description: "Impossibile confermare", variant: "destructive" }),
  });

  function moveItem(uid: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.uid === uid);
      if (idx < 0) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(ni, 0, item);
      return next;
    });
  }

  function deleteItem(uid: string) {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  }

  function updateItem(uid: string, draft: QuoteItemDraftValues) {
    setItems((prev) => prev.map((i) => (i.uid === uid ? { uid, ...draft } : i)));
  }

  function updateItemDiscount(uid: string, discountStr: string) {
    setItems((prev) => prev.map((it) => {
      if (it.uid !== uid) return it;
      const discount = parseFloat(discountStr) || 0;
      // Always compute from the true base: prefer stored baseTotal, fall back to
      // current totalRow (only safe on the first change — we then persist baseTotal
      // so subsequent edits always compute from the undiscounted original).
      const effectiveBase = it.baseTotal
        ? parseFloat(it.baseTotal)
        : (it.totalRow ? parseFloat(it.totalRow) : null);
      const newTotal = effectiveBase != null ? +(effectiveBase * (1 - discount / 100)).toFixed(2) : null;
      return {
        ...it,
        discountPercent: discount > 0 ? String(discount) : undefined,
        baseTotal: effectiveBase != null ? String(effectiveBase) : it.baseTotal,
        totalRow: newTotal != null ? String(newTotal) : it.totalRow,
      };
    }));
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
    const gdMode = q.discounts?.globalDiscountMode;
    const gdVal = gdMode === "percent"
      ? q.discounts?.globalDiscountPercent
      : q.discounts?.globalDiscountAmount;
    const globalDiscount = gdMode && gdVal != null && gdVal > 0
      ? { mode: gdMode, value: gdVal }
      : null;

    // Filtra righe interne (GIORNATE marcate isInternalOnly, o GIORNATE legacy)
    const pdfItems = q.items
      .filter((it) => !it.isInternalOnly && it.type !== "GIORNATE")
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((it) => {
        const effectiveTotalRow = it.clientTotal != null ? it.clientTotal : it.totalRow;
        const qty = parseFloat(it.quantity) || 1;
        // Ricalcola unitPriceApplied coerente col prezzo cliente
        const effectiveUnitPrice = it.clientTotal != null
          ? String(Math.round(parseFloat(it.clientTotal) / qty * 100) / 100)
          : it.unitPriceApplied;
        return {
          id: it.id,
          type: it.type,
          description: it.description,
          unitOfMeasure: it.unitOfMeasure,
          developmentCm: it.developmentCm,
          quantity: it.quantity,
          unitPriceApplied: effectiveUnitPrice,
          totalRow: effectiveTotalRow,
          displayOrder: it.displayOrder,
          discountPercent: it.clientTotal != null ? null : (it.discountPercent ?? null),
          overrideTotal: it.clientTotal != null ? null : (it.overrideTotal ?? null),
          baseTotal: it.clientTotal != null ? null : (it.baseTotal ?? null),
        };
      });

    const pdfTotalAmount = String(
      Math.round(pdfItems.reduce((s, it) => s + parseFloat(it.totalRow || "0"), 0) * 100) / 100
    );

    // Se i prezzi cliente sono impostati (spalma eseguito), il globalDiscount è già compreso
    const anyHasClientTotal = q.items.some(
      (it) => it.clientTotal != null && it.type !== "GIORNATE"
    );

    return {
      id: q.id,
      number: q.number,
      subject: q.subject,
      notes: q.notes,
      totalAmount: pdfTotalAmount,
      createdAt: q.createdAt,
      globalDiscount: anyHasClientTotal ? null : globalDiscount,
      items: pdfItems,
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
      const computedName = m && t ? `${m.name} ${parseFloat(t.thicknessMm)}mm${f ? ` — ${f.name}` : ""}` : null;
      const desc = computedName || it.description || "Lattoneria";
      const costSuffix = it.unitCostPerKg
        ? ` — ${formatEur(parseFloat(it.unitCostPerKg))} €/kg`
        : "";
      return `${desc} — sviluppo ${it.developmentCm ? fmtQty(it.developmentCm) : "?"} cm × ${fmtQty(it.quantity)} ml${costSuffix}`;
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
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-4" data-testid="page-quote-editor">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {isNLMode ? <FileCheck className="w-5 h-5 text-indigo-500" /> : <FileText className="w-5 h-5" />}
            {isNLMode
              ? (isNew ? "Nuova Nota Lavori" : `Nota Lavori ${number}`)
              : (isNew ? "Nuovo preventivo" : `Preventivo ${number}`)}
          </h1>
          {opportunityQuery.data && (
            <div className="text-sm text-muted-foreground">
              Opportunità:{" "}
              <Link href={`/opportunities?selected=${opportunityQuery.data.id}`} className="underline">
                {opportunityQuery.data.title}
              </Link>
            </div>
          )}
          {isNLMode && quoteQuery.data && (() => {
            const s = quoteQuery.data.status;
            const cfg: Record<string, { label: string; cls: string }> = {
              WORK_ORDER_DRAFT:     { label: "Bozza",            cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
              WORK_ORDER_SENT:      { label: "Inviata",          cls: "bg-blue-100 text-blue-800 border-blue-200" },
              WORK_ORDER_CONFIRMED: { label: "Confermata",       cls: "bg-purple-100 text-purple-800 border-purple-200" },
            };
            const c = cfg[s];
            return c ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
                {c.label}
              </span>
            ) : null;
          })()}
        </div>
        <div className="flex items-center gap-2">
          {/* Salva */}
          {(!isNLMode || quoteQuery.data?.status === "WORK_ORDER_DRAFT") && (
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
              {isNLMode ? "Salva Nota Lavori" : "Salva preventivo"}
            </Button>
          )}
          {/* PDF / Email — sempre disponibili */}
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
          {/* NL: Segna come Inviata (salva prima, poi transiziona) */}
          {isNLMode && quoteQuery.data?.status === "WORK_ORDER_DRAFT" && (
            <Button
              variant="outline"
              onClick={async () => {
                await saveMutation.mutateAsync();
                nlSendMutation.mutate();
              }}
              disabled={saveMutation.isPending || nlSendMutation.isPending}
              data-testid="button-nl-send"
            >
              {(saveMutation.isPending || nlSendMutation.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Segna come Inviata
            </Button>
          )}
          {/* NL: Conferma */}
          {isNLMode && quoteQuery.data?.status === "WORK_ORDER_SENT" && (
            <Button
              onClick={() => nlConfirmMutation.mutate()}
              disabled={nlConfirmMutation.isPending}
              data-testid="button-nl-confirm"
            >
              {nlConfirmMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Conferma Nota Lavori
            </Button>
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

          {/* ─── Due pannelli affiancati ─── */}
          <div className="grid grid-cols-2 gap-3">

            {/* ══════ Pannello sinistro: Bozza interna ══════ */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Bozza interna</CardTitle>
                  <Badge variant="secondary" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">Interna</Badge>
                </div>
                <Button onClick={() => setAddOpen(true)} size="sm" data-testid="button-open-add-row">
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi riga
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                {items.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-rows">
                    Nessuna riga. Aggiungi la prima voce con "Aggiungi riga".
                  </div>
                ) : (
                  <Table data-testid="table-quote-items">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Tipo</TableHead>
                        <TableHead>Descrizione</TableHead>
                        <TableHead className="w-[70px] text-right">Sc.%</TableHead>
                        <TableHead className="w-[110px] text-right">Totale</TableHead>
                        <TableHead className="w-[120px] text-right">Azioni</TableHead>
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
                          <TableCell className="text-xs">{rowDetails(it)}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={it.discountPercent && parseFloat(it.discountPercent) > 0 ? parseFloat(it.discountPercent) : ""}
                              placeholder="0"
                              onChange={(e) => updateItemDiscount(it.uid, e.target.value)}
                              data-testid={`input-discount-${it.uid}`}
                              className="w-12 h-7 text-right text-sm rounded border border-input bg-transparent px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap">
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
                                  <span data-testid={`text-total-${it.uid}`} className={`text-sm ${hasDiscount ? "text-amber-700 dark:text-amber-300" : ""}`}>
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
                            <div className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingItem(it)} data-testid={`button-edit-${it.uid}`}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => moveItem(it.uid, -1)} data-testid={`button-move-up-${it.uid}`}>
                                <ArrowUp className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === items.length - 1} onClick={() => moveItem(it.uid, 1)} data-testid={`button-move-down-${it.uid}`}>
                                <ArrowDown className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteItem(it.uid)} data-testid={`button-delete-${it.uid}`}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* Sconto globale */}
                <div className="mt-3 pt-3 border-t" data-testid="global-discount-panel">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Sconto globale</div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border border-input overflow-hidden">
                      <button type="button" onClick={() => setGlobalDiscountMode("percent")} data-testid="toggle-discount-percent" className={`px-2.5 py-1.5 text-sm font-medium transition-colors ${globalDiscountMode === "percent" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}>%</button>
                      <button type="button" onClick={() => setGlobalDiscountMode("euro")} data-testid="toggle-discount-euro" className={`px-2.5 py-1.5 text-sm font-medium transition-colors border-l border-input ${globalDiscountMode === "euro" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}>€</button>
                    </div>
                    <Input type="number" step="any" min="0" placeholder="0" value={globalDiscountValue} onChange={(e) => setGlobalDiscountValue(e.target.value)} className="w-28" data-testid="input-global-discount" />
                    {globalDiscountAmount > 0 && (
                      <span className="text-sm text-amber-700 dark:text-amber-300 font-medium" data-testid="text-global-discount-amount">
                        − € {formatEur(globalDiscountAmount)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Riepilogo costi/margini */}
                <div className="mt-3 pt-3 border-t" data-testid="quote-summary-panel">
                  <div className="flex flex-col gap-3">
                    {items.length > 0 && (
                      <div className="text-sm space-y-1" data-testid="quote-cost-summary">
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground w-24 text-xs">Costo totale</span>
                          <span className="font-semibold text-sm">€ {formatEur(quoteSummary.totalCost)}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground w-24 text-xs">Margine €</span>
                          <span className="font-semibold text-sm">€ {formatEur(quoteSummary.totalMarginEur)}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground w-24 text-xs">Margine %</span>
                          <span className="font-semibold text-sm" data-testid="avg-margin-percent">{quoteSummary.avgMarginPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    )}
                    <div>
                      {globalDiscountAmount > 0 && (
                        <>
                          <div className="text-xs text-muted-foreground">Subtotale</div>
                          <div className="text-base text-muted-foreground line-through" data-testid="text-subtotal">
                            € {formatEur(totalEstimated)}
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-global-discount-label">
                            Sconto —{" "}
                            {globalDiscountMode === "percent"
                              ? `${parseFloat(globalDiscountValue || "0").toFixed(1)}%`
                              : `€ ${formatEur(parseFloat(globalDiscountValue || "0"))}`}
                          </div>
                        </>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">Totale bozza</div>
                      <div className="text-2xl font-semibold" data-testid="text-total">
                        € {formatEur(totalAfterDiscount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Prezzi congelati al salvataggio
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ══════ Pannello destro: Preventivo cliente ══════ */}
            {(() => {
              const nonLaborItems = items.filter((it) => it.type !== "GIORNATE");
              const hasLabor = items.some((it) => it.type === "GIORNATE");
              return (
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">Preventivo cliente</CardTitle>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100">Cliente</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSpalma}
                      disabled={!hasLabor || nonLaborItems.length === 0}
                      data-testid="button-spalma"
                    >
                      <ArrowRightLeft className="w-4 h-4 mr-2" />
                      Spalma manodopera
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {nonLaborItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        Nessuna riga non-manodopera.
                      </div>
                    ) : (
                      <Table data-testid="table-client-items">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[90px]">Tipo</TableHead>
                            <TableHead>Descrizione</TableHead>
                            <TableHead className="w-[130px] text-right">Prezzo cliente</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {nonLaborItems.map((it) => (
                            <TableRow key={it.uid}>
                              <TableCell>{rowTypeBadge(it.type)}</TableCell>
                              <TableCell className="text-xs">{rowDetails(it)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-xs text-muted-foreground">€</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={clientPrices[it.uid] ?? (it.totalRow ?? "")}
                                    onChange={(e) =>
                                      setClientPrices((prev) => ({ ...prev, [it.uid]: e.target.value }))
                                    }
                                    className="w-28 h-7 text-right text-sm rounded border border-input bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                                    data-testid={`input-client-price-${it.uid}`}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}

                    {/* Indicatore di bilanciamento */}
                    <div className="mt-3 pt-3 border-t flex items-end justify-between gap-3" data-testid="client-balance-panel">
                      <div className="flex flex-col gap-1">
                        <div className="text-xs text-muted-foreground">Vs. bozza interna</div>
                        {isBalanced ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-100 border-0 w-fit" data-testid="badge-balanced">
                            ✓ Bilanciato
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-100 border-0 w-fit" data-testid="badge-diff">
                            Δ € {formatEur(Math.abs(clientTotalAmount - totalAfterDiscount))}
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Totale cliente</div>
                        <div className="text-2xl font-semibold" data-testid="text-client-total">
                          € {formatEur(clientTotalAmount)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

          </div>{/* fine grid 2 colonne */}
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
