import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated, canAccessLeads } from "../auth";
import { resolveUserCompany } from "../utils/accessContext";
import { isUniqueConstraintError } from "../utils/errors";
import { round2, round4, applyDiscountOrOverride } from "../utils/quoteCalc";
import {
  quoteStatusEnum,
  type QuoteItemType,
  type InsertQuoteItem,
} from "@shared/schema";

class NotFoundCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundCatalogError";
  }
}

class ValidationCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationCatalogError";
  }
}

export const quotesRouter = Router();

// ==================== Validation ====================

const itemBaseSchema = z.object({
  id: z.string().optional(), // ignored on save (server reissues IDs)
  description: z.string().nullable().optional(),
  marginPercent: z.coerce.number().min(0).max(10000).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  overrideTotal: z.coerce.number().min(0).nullable().optional(),
  isInternalOnly: z.boolean().optional().default(false),
  clientTotal: z.coerce.number().min(0).nullable().optional(),
});

const lattoneriaItemSchema = itemBaseSchema.extend({
  type: z.literal("LATTONERIA"),
  materialId: z.string().min(1, "Materiale obbligatorio"),
  materialThicknessId: z.string().min(1, "Spessore obbligatorio"),
  materialFinishId: z.string().optional().nullable(),
  developmentCm: z.coerce.number().positive("Sviluppo deve essere > 0"),
  quantity: z.coerce.number().positive("Metri lineari devono essere > 0"),
});

const articoloItemSchema = itemBaseSchema.extend({
  type: z.literal("ARTICOLO"),
  catalogArticleId: z.string().min(1, "Articolo obbligatorio"),
  quantity: z.coerce.number().positive("Quantità deve essere > 0"),
});

const giornateItemSchema = itemBaseSchema.extend({
  type: z.literal("GIORNATE"),
  laborRateId: z.string().min(1, "Manodopera obbligatoria"),
  quantity: z.coerce.number().positive("Giorni devono essere > 0"),
});

const manualeItemSchema = z.object({
  id: z.string().optional(),
  type: z.literal("MANUALE"),
  description: z.string().trim().min(1, "Descrizione obbligatoria"),
  unitOfMeasure: z.string().trim().min(1, "Unità di misura obbligatoria"),
  quantity: z.coerce.number().positive("Quantità deve essere > 0"),
  unitCost: z.coerce.number().min(0, "Costo unitario deve essere >= 0"),
  marginPercent: z.coerce.number().min(0).max(10000).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  overrideTotal: z.coerce.number().min(0).nullable().optional(),
  isInternalOnly: z.boolean().optional().default(false),
  clientTotal: z.coerce.number().min(0).nullable().optional(),
});

const quoteItemInputSchema = z.discriminatedUnion("type", [
  lattoneriaItemSchema,
  articoloItemSchema,
  giornateItemSchema,
  manualeItemSchema,
]);
type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;

const globalDiscountSchema = z.object({
  mode: z.enum(["percent", "euro"]),
  value: z.coerce.number().min(0).transform((val, ctx) => {
    // Clamp percent to valid range; let it pass for euro (UI already clamps to subtotal)
    return val;
  }),
}).optional().transform((gd) => {
  if (!gd) return gd;
  // Normalize: percent cannot exceed 100
  if (gd.mode === "percent" && gd.value > 100) {
    return { ...gd, value: 100 };
  }
  return gd;
});

const quoteSaveSchema = z.object({
  subject: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(quoteStatusEnum).optional(),
  number: z.string().min(1).optional(), // only for create
  items: z.array(quoteItemInputSchema).default([]),
  globalDiscount: globalDiscountSchema,
});

// ==================== Calculation ====================

interface ComputedItem {
  type: QuoteItemType;
  description: string;
  unitOfMeasure: string;
  developmentCm: string | null;
  quantity: string;
  weightKg: string | null;
  unitCost: string;
  marginPercent: string;
  unitPriceApplied: string;
  baseTotal: string;
  discountPercent: string;
  overrideTotal: string | null;
  totalRow: string;
  isInternalOnly: boolean;
  clientTotal: string | null;
  // FKs
  materialId: string | null;
  materialThicknessId: string | null;
  materialFinishId: string | null;
  catalogArticleId: string | null;
  laborRateId: string | null;
}


async function computeItem(input: QuoteItemInput): Promise<ComputedItem> {
  if (input.type === "LATTONERIA") {
    const material = await storage.getMaterial(input.materialId);
    const thickness = await storage.getMaterialThickness(input.materialThicknessId);
    if (!material) throw new NotFoundCatalogError(`Materiale non trovato: ${input.materialId}`);
    if (!thickness) throw new NotFoundCatalogError(`Spessore non trovato: ${input.materialThicknessId}`);
    if (thickness.materialId !== material.id) {
      throw new ValidationCatalogError(`Lo spessore selezionato non appartiene al materiale scelto`);
    }

    let finish = null;
    if (input.materialFinishId) {
      finish = await storage.getMaterialFinish(input.materialFinishId);
      if (!finish) {
        throw new NotFoundCatalogError(`Finitura non trovata: ${input.materialFinishId}`);
      }
      if (finish.thicknessId !== thickness.id) {
        throw new ValidationCatalogError(`La finitura selezionata non appartiene allo spessore scelto`);
      }
    }

    const developmentCm = Number(input.developmentCm);
    const meters = Number(input.quantity);
    const thicknessMm = parseFloat(thickness.thicknessMm);
    const density = parseFloat(material.density);
    const isSingleMode = material.priceMode === "SINGLE";
    const costPerKg = isSingleMode
      ? parseFloat(material.singleCostPerKg ?? "0")
      : parseFloat(thickness.costPerKg);
    const defaultMargin = isSingleMode
      ? parseFloat(material.singleMarginPercent ?? "0")
      : parseFloat(thickness.marginPercent);
    const margin = input.marginPercent !== undefined
      ? Number(input.marginPercent)
      : defaultMargin;

    // Peso(kg) = (sviluppo_cm/100) * metri * (spessore_mm/1000) * peso_specifico
    const weightKg = (developmentCm / 100) * meters * (thicknessMm / 1000) * density;
    // Costo(€) = Peso * costo_kg
    const cost = weightKg * costPerKg;
    // Prezzo base(€) = Costo * (1 + margine/100)
    const baseTotal = cost * (1 + margin / 100);
    const unitPrice = meters > 0 ? baseTotal / meters : 0;

    const { totalRow, discountPercent, overrideTotal } = applyDiscountOrOverride(baseTotal, input.discountPercent, input.overrideTotal);

    const defaultDescription = finish
      ? `${material.name} ${thicknessMm}mm — ${finish.name}`
      : `${material.name} ${thicknessMm}mm`;

    return {
      type: "LATTONERIA",
      description: input.description?.trim() || defaultDescription,
      unitOfMeasure: "ml",
      developmentCm: String(Number(input.developmentCm)),
      quantity: String(Number(input.quantity)),
      weightKg: String(round4(weightKg)),
      unitCost: String(round4(costPerKg)),
      marginPercent: String(round2(margin)),
      unitPriceApplied: String(round2(unitPrice)),
      baseTotal: String(round2(baseTotal)),
      discountPercent: String(round2(discountPercent)),
      overrideTotal: overrideTotal != null ? String(round2(overrideTotal)) : null,
      totalRow: String(round2(totalRow)),
      isInternalOnly: input.isInternalOnly ?? false,
      clientTotal: input.clientTotal != null ? String(round2(input.clientTotal)) : null,
      materialId: material.id,
      materialThicknessId: thickness.id,
      materialFinishId: input.materialFinishId ?? null,
      catalogArticleId: null,
      laborRateId: null,
    };
  }

  if (input.type === "ARTICOLO") {
    const article = await storage.getCatalogArticle(input.catalogArticleId);
    if (!article) throw new NotFoundCatalogError(`Articolo non trovato: ${input.catalogArticleId}`);

    const quantity = Number(input.quantity);
    const unitCost = parseFloat(article.unitCost);
    const margin = input.marginPercent !== undefined
      ? Number(input.marginPercent)
      : parseFloat(article.marginPercent);

    const cost = unitCost * quantity;
    const baseTotal = cost * (1 + margin / 100);
    const unitPrice = quantity > 0 ? baseTotal / quantity : 0;

    const { totalRow, discountPercent, overrideTotal } = applyDiscountOrOverride(baseTotal, input.discountPercent, input.overrideTotal);

    return {
      type: "ARTICOLO",
      description: input.description?.trim() || article.name,
      unitOfMeasure: article.unitOfMeasure || "pz",
      developmentCm: null,
      quantity: String(Number(input.quantity)),
      weightKg: null,
      unitCost: String(round4(unitCost)),
      marginPercent: String(round2(margin)),
      unitPriceApplied: String(round2(unitPrice)),
      baseTotal: String(round2(baseTotal)),
      discountPercent: String(round2(discountPercent)),
      overrideTotal: overrideTotal != null ? String(round2(overrideTotal)) : null,
      totalRow: String(round2(totalRow)),
      isInternalOnly: input.isInternalOnly ?? false,
      clientTotal: input.clientTotal != null ? String(round2(input.clientTotal)) : null,
      materialId: null,
      materialThicknessId: null,
      materialFinishId: null,
      catalogArticleId: article.id,
      laborRateId: null,
    };
  }

  if (input.type === "MANUALE") {
    const quantity = Number(input.quantity);
    const unitCost = Number(input.unitCost);
    const margin = input.marginPercent !== undefined ? Number(input.marginPercent) : 0;
    const unitPriceApplied = unitCost * (1 + margin / 100);
    const baseTotal = quantity * unitPriceApplied;

    const { totalRow, discountPercent, overrideTotal } = applyDiscountOrOverride(baseTotal, input.discountPercent, input.overrideTotal);

    return {
      type: "MANUALE",
      description: input.description.trim(),
      unitOfMeasure: input.unitOfMeasure.trim(),
      developmentCm: null,
      quantity: String(round4(quantity)),
      weightKg: null,
      unitCost: String(round4(unitCost)),
      marginPercent: String(round2(margin)),
      unitPriceApplied: String(round2(unitPriceApplied)),
      baseTotal: String(round2(baseTotal)),
      discountPercent: String(round2(discountPercent)),
      overrideTotal: overrideTotal != null ? String(round2(overrideTotal)) : null,
      totalRow: String(round2(totalRow)),
      isInternalOnly: input.isInternalOnly ?? false,
      clientTotal: input.clientTotal != null ? String(round2(input.clientTotal)) : null,
      materialId: null,
      materialThicknessId: null,
      materialFinishId: null,
      catalogArticleId: null,
      laborRateId: null,
    };
  }

  // GIORNATE
  const labor = await storage.getLaborRate(input.laborRateId);
  if (!labor) throw new NotFoundCatalogError(`Manodopera non trovata: ${input.laborRateId}`);

  const days = Number(input.quantity);
  const unitCost = parseFloat(labor.costPerDay);
  const margin = input.marginPercent !== undefined
    ? Number(input.marginPercent)
    : parseFloat(labor.marginPercent);

  const cost = unitCost * days;
  const baseTotal = cost * (1 + margin / 100);
  const unitPrice = days > 0 ? baseTotal / days : 0;

  const { totalRow, discountPercent, overrideTotal } = applyDiscountOrOverride(baseTotal, input.discountPercent, input.overrideTotal);

  return {
    type: "GIORNATE",
    description: input.description?.trim() || labor.name,
    unitOfMeasure: "gg",
    developmentCm: null,
    quantity: String(Number(input.quantity)),
    weightKg: null,
    unitCost: String(round4(unitCost)),
    marginPercent: String(round2(margin)),
    unitPriceApplied: String(round2(unitPrice)),
    baseTotal: String(round2(baseTotal)),
    discountPercent: String(round2(discountPercent)),
    overrideTotal: overrideTotal != null ? String(round2(overrideTotal)) : null,
    totalRow: String(round2(totalRow)),
    isInternalOnly: input.isInternalOnly ?? false,
    clientTotal: null, // GIORNATE mai esposto al cliente
    materialId: null,
    materialThicknessId: null,
    materialFinishId: null,
    catalogArticleId: null,
    laborRateId: labor.id,
  };
}

function toInsertItem(quoteId: string, computed: ComputedItem, displayOrder: number): InsertQuoteItem {
  return {
    quoteId,
    type: computed.type,
    materialId: computed.materialId,
    materialThicknessId: computed.materialThicknessId,
    materialFinishId: computed.materialFinishId,
    catalogArticleId: computed.catalogArticleId,
    laborRateId: computed.laborRateId,
    description: computed.description,
    unitOfMeasure: computed.unitOfMeasure,
    developmentCm: computed.developmentCm,
    quantity: computed.quantity,
    weightKg: computed.weightKg,
    unitCost: computed.unitCost,
    marginPercent: computed.marginPercent,
    unitPriceApplied: computed.unitPriceApplied,
    baseTotal: computed.baseTotal,
    discountPercent: computed.discountPercent,
    overrideTotal: computed.overrideTotal,
    totalRow: computed.totalRow,
    isInternalOnly: computed.isInternalOnly,
    clientTotal: computed.clientTotal,
    displayOrder,
  };
}

// ==================== Routes ====================

// GET /api/quotes/next-number — anteprima del prossimo numero per l'azienda
quotesRouter.get("/quotes/next-number", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const year = new Date().getFullYear();
    const numbers = await storage.getQuoteNumbersByCompany(userCompany.companyId);

    let maxNum = 299;
    for (const n of numbers) {
      if (!n) continue;
      if (!n.endsWith(`-${year}`) && !n.startsWith(`PREV-${year}`)) continue;
      const m = n.match(/^(?:PREV-\d{4}-)?(\d+)/);
      if (m) {
        const v = parseInt(m[1], 10);
        if (v > maxNum) maxNum = v;
      }
    }
    const nextNumber = `${String(maxNum + 1).padStart(3, "0")}-${year}`;
    res.json({ number: nextNumber });
  } catch (error) {
    console.error("Error generating next quote number:", error);
    res.status(500).json({ message: "Errore nella generazione del numero preventivo" });
  }
});

// GET /api/quotes/:id — Dettaglio preventivo + righe
quotesRouter.get("/quotes/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const quote = await storage.getQuote(req.params.id, userCompany.companyId);
    if (!quote) return res.status(404).json({ message: "Preventivo non trovato" });

    const items = await storage.getQuoteItems(quote.id);
    res.json({ ...quote, items });
  } catch (error) {
    console.error("Error fetching quote:", error);
    res.status(500).json({ message: "Errore nel recupero del preventivo" });
  }
});

// POST /api/opportunities/:opportunityId/quotes — Crea nuovo preventivo per opportunità
quotesRouter.post("/opportunities/:opportunityId/quotes", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const opportunity = await storage.getOpportunity(req.params.opportunityId, userCompany.companyId);
    if (!opportunity) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    const parsed = quoteSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten(),
      });
    }
    const { subject, notes, status, number, items, globalDiscount } = parsed.data;

    // Pre-calcola tutte le righe e congela i prezzi
    const computed: ComputedItem[] = [];
    for (const it of items) {
      computed.push(await computeItem(it));
    }
    const totalAmount = computed.reduce((sum, c) => sum + parseFloat(c.totalRow), 0);

    // Build discounts JSONB with global discount info
    const discountsData = globalDiscount && globalDiscount.value > 0
      ? {
          globalDiscountMode: globalDiscount.mode,
          ...(globalDiscount.mode === "percent"
            ? { globalDiscountPercent: globalDiscount.value }
            : { globalDiscountAmount: globalDiscount.value }),
        }
      : null;

    let quote;
    try {
      quote = await storage.createQuoteWithNextNumber({
        opportunityId: opportunity.id,
        companyId: userCompany.companyId,
        status: status ?? "DRAFT",
        totalAmount: String(round2(totalAmount)),
        subject: subject ?? null,
        notes: notes ?? null,
        globalParams: null,
        discounts: discountsData,
      }, number);
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        return res.status(409).json({ message: "Numero preventivo già esistente" });
      }
      throw e;
    }

    if (computed.length > 0) {
      const insertItems = computed.map((c, i) => toInsertItem(quote.id, c, i));
      await storage.createQuoteItems(insertItems);
    }

    const savedItems = await storage.getQuoteItems(quote.id);
    res.status(201).json({ ...quote, items: savedItems });
  } catch (error) {
    if (error instanceof NotFoundCatalogError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof ValidationCatalogError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error creating quote:", error);
    const msg = error instanceof Error ? error.message : "Errore nella creazione del preventivo";
    res.status(500).json({ message: msg });
  }
});

// PUT /api/quotes/:id — Aggiorna preventivo (sostituisce tutte le righe)
quotesRouter.put("/quotes/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const existing = await storage.getQuote(req.params.id, userCompany.companyId);
    if (!existing) return res.status(404).json({ message: "Preventivo non trovato" });

    const parsed = quoteSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten(),
      });
    }
    const { subject, notes, status, items, globalDiscount } = parsed.data;

    const computed: ComputedItem[] = [];
    for (const it of items) {
      computed.push(await computeItem(it));
    }
    const totalAmount = computed.reduce((sum, c) => sum + parseFloat(c.totalRow), 0);

    // Build discounts JSONB with global discount info
    const discountsData = globalDiscount && globalDiscount.value > 0
      ? {
          globalDiscountMode: globalDiscount.mode,
          ...(globalDiscount.mode === "percent"
            ? { globalDiscountPercent: globalDiscount.value }
            : { globalDiscountAmount: globalDiscount.value }),
        }
      : null;

    const updated = await storage.updateQuote(existing.id, userCompany.companyId, {
      subject: subject ?? null,
      notes: notes ?? null,
      status: status ?? existing.status,
      totalAmount: String(round2(totalAmount)),
      discounts: discountsData,
    });

    await storage.deleteQuoteItems(existing.id);
    if (computed.length > 0) {
      const insertItems = computed.map((c, i) => toInsertItem(existing.id, c, i));
      await storage.createQuoteItems(insertItems);
    }

    const savedItems = await storage.getQuoteItems(existing.id);
    res.json({ ...(updated || existing), items: savedItems });
  } catch (error) {
    if (error instanceof NotFoundCatalogError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof ValidationCatalogError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error updating quote:", error);
    const msg = error instanceof Error ? error.message : "Errore nell'aggiornamento del preventivo";
    res.status(500).json({ message: msg });
  }
});

// ==================== Nota Lavori ====================

// POST /api/quotes/:id/work-order/start — Avvia nota lavori (ACCEPTED → WORK_ORDER_DRAFT)
quotesRouter.post("/quotes/:id/work-order/start", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) return res.status(403).json({ message: "Accesso negato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const quote = await storage.getQuote(req.params.id, userCompany.companyId);
    if (!quote) return res.status(404).json({ message: "Preventivo non trovato" });
    if (quote.status !== "ACCEPTED") return res.status(400).json({ message: "Il preventivo deve essere nello stato Accettato" });

    const updated = await storage.updateQuote(req.params.id, userCompany.companyId, { status: "WORK_ORDER_DRAFT" });

    // Sposta l'opportunità allo stadio "Cantiere in corso" se esiste
    const stages = await storage.getStagesByCompany(userCompany.companyId);
    const cantiereStage = stages.find(s => s.name === "Cantiere in corso");
    if (cantiereStage) {
      await storage.updateOpportunity(quote.opportunityId, userCompany.companyId, { stageId: cantiereStage.id });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Errore nell'avvio della nota lavori" });
  }
});

// POST /api/quotes/:id/work-order/send — Invia nota lavori (WORK_ORDER_DRAFT → WORK_ORDER_SENT)
quotesRouter.post("/quotes/:id/work-order/send", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) return res.status(403).json({ message: "Accesso negato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const quote = await storage.getQuote(req.params.id, userCompany.companyId);
    if (!quote) return res.status(404).json({ message: "Preventivo non trovato" });
    if (quote.status !== "WORK_ORDER_DRAFT") return res.status(400).json({ message: "La nota lavori deve essere in bozza" });

    const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
    const updated = await storage.updateQuote(req.params.id, userCompany.companyId, {
      status: "WORK_ORDER_SENT",
      workOrderSentAt: new Date(),
      ...(notes !== undefined && { workOrderNotes: notes }),
    });

    // Sposta l'opportunità allo stadio "Nota Lavori Inviata"
    const stages = await storage.getStagesByCompany(userCompany.companyId);
    const nlInviataStage = stages.find(s => s.name === "Nota Lavori Inviata");
    if (nlInviataStage) {
      await storage.updateOpportunity(quote.opportunityId, userCompany.companyId, { stageId: nlInviataStage.id });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Errore nell'invio della nota lavori" });
  }
});

// POST /api/quotes/:id/work-order/confirm — Conferma nota lavori (WORK_ORDER_SENT → WORK_ORDER_CONFIRMED)
quotesRouter.post("/quotes/:id/work-order/confirm", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) return res.status(403).json({ message: "Accesso negato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const quote = await storage.getQuote(req.params.id, userCompany.companyId);
    if (!quote) return res.status(404).json({ message: "Preventivo non trovato" });
    if (quote.status !== "WORK_ORDER_SENT") return res.status(400).json({ message: "La nota lavori deve essere nello stato Inviata" });

    const updated = await storage.updateQuote(req.params.id, userCompany.companyId, {
      status: "WORK_ORDER_CONFIRMED",
      workOrderConfirmedAt: new Date(),
    });

    // Sposta l'opportunità allo stadio "Da Fatturare"
    const stages = await storage.getStagesByCompany(userCompany.companyId);
    const daFatturareStage = stages.find(s => s.name === "Da Fatturare");
    if (daFatturareStage) {
      await storage.updateOpportunity(quote.opportunityId, userCompany.companyId, { stageId: daFatturareStage.id });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Errore nella conferma della nota lavori" });
  }
});

// PATCH /api/quotes/:id/work-order/notes — Aggiorna note nota lavori
quotesRouter.patch("/quotes/:id/work-order/notes", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) return res.status(403).json({ message: "Accesso negato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const { notes } = z.object({ notes: z.string() }).parse(req.body);
    const updated = await storage.updateQuote(req.params.id, userCompany.companyId, { workOrderNotes: notes });
    if (!updated) return res.status(404).json({ message: "Preventivo non trovato" });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Errore nell'aggiornamento delle note" });
  }
});

// PATCH /api/quote-items/:id/work-order-quantity — Override quantità per nota lavori
quotesRouter.patch("/quote-items/:id/work-order-quantity", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) return res.status(403).json({ message: "Accesso negato" });
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const { quantity } = z.object({ quantity: z.number().nullable() }).parse(req.body);
    const updated = await storage.updateQuoteItemWorkOrderQuantity(req.params.id, userCompany.companyId, quantity);
    if (!updated) return res.status(404).json({ message: "Riga non trovata" });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Errore nell'aggiornamento della quantità" });
  }
});

// DELETE /api/quotes/:id — Elimina preventivo
quotesRouter.delete("/quotes/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const ok = await storage.deleteQuote(req.params.id, userCompany.companyId);
    if (!ok) return res.status(404).json({ message: "Preventivo non trovato" });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting quote:", error);
    res.status(500).json({ message: "Errore nell'eliminazione del preventivo" });
  }
});
