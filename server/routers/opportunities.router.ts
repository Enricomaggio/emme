import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, canAccessLeads, isAdmin } from "../auth";
import { insertOpportunitySchema, type InsertOpportunity, type InsertQuoteItem } from "@shared/schema";
import { z } from "zod";
import { resolveUserCompany, buildAccessContext, validateUserInSameCompany } from "../utils/accessContext";
import { isUniqueConstraintError } from "../utils/errors";

export const opportunitiesRouter = Router();

// ============ PIPELINE STAGES ============
// IMPORTANTE: /stages/reorder PRIMA di /stages/:id per evitare conflitti di matching

// GET /api/stages - Lista fasi pipeline dell'azienda
opportunitiesRouter.get("/stages", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const stages = await storage.getStagesByCompany(userCompany.companyId);
    res.json(stages);
  } catch (error) {
    console.error("Error fetching stages:", error);
    res.status(500).json({ message: "Errore nel recupero delle fasi" });
  }
});

// POST /api/stages - Crea un nuovo stage della pipeline (solo admin)
opportunitiesRouter.post("/stages", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const { name, color, order } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Il nome è obbligatorio" });
    }
    const stage = await storage.createStage({
      name,
      color: color || "#4563FF",
      order: order || 0,
      companyId: userCompany.companyId,
    });
    res.status(201).json(stage);
  } catch (error) {
    console.error("Error creating stage:", error);
    res.status(500).json({ message: "Errore nella creazione dello stage" });
  }
});

// PUT /api/stages/reorder - Riordina gli stage della pipeline (solo admin)
// DEVE stare PRIMA di /stages/:id
opportunitiesRouter.put("/stages/reorder", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const { stageIds } = req.body;
    if (!Array.isArray(stageIds) || stageIds.length === 0) {
      return res.status(400).json({ message: "Array di stageIds obbligatorio" });
    }
    await storage.reorderStages(userCompany.companyId, stageIds);
    const stages = await storage.getStagesByCompany(userCompany.companyId);
    res.json(stages);
  } catch (error) {
    console.error("Error reordering stages:", error);
    res.status(500).json({ message: "Errore nel riordinamento degli stage" });
  }
});

// PUT /api/stages/:id - Aggiorna uno stage della pipeline (solo admin)
opportunitiesRouter.put("/stages/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const { name, color, order } = req.body;
    const stage = await storage.updateStage(req.params.id, userCompany.companyId, { name, color, order });
    if (!stage) {
      return res.status(404).json({ message: "Stage non trovato" });
    }
    res.json(stage);
  } catch (error) {
    console.error("Error updating stage:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dello stage" });
  }
});

// DELETE /api/stages/:id - Elimina uno stage della pipeline (solo admin)
opportunitiesRouter.delete("/stages/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono gestire la pipeline" });
    }
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }
    const opps = await storage.getOpportunitiesByCompany(userCompany.companyId);
    const hasOpps = opps.some((o: any) => o.stageId === req.params.id);
    if (hasOpps) {
      return res.status(400).json({ message: "Impossibile eliminare: ci sono opportunità in questa colonna. Spostale prima in un'altra colonna." });
    }
    const deleted = await storage.deleteStage(req.params.id, userCompany.companyId);
    if (!deleted) {
      return res.status(404).json({ message: "Stage non trovato" });
    }
    res.json({ message: "Stage eliminato" });
  } catch (error) {
    console.error("Error deleting stage:", error);
    res.status(500).json({ message: "Errore nell'eliminazione dello stage" });
  }
});

// ============ OPPORTUNITIES ============

// GET /api/opportunities - Lista opportunità dell'azienda (con controllo accesso)
opportunitiesRouter.get("/opportunities", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const ctx = await buildAccessContext(userId, role, req);
    if (!ctx) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const opportunities = await storage.getOpportunitiesWithAccess(ctx);
    const referentIds = Array.from(new Set(opportunities.map(o => o.referentId).filter((id): id is string => id !== null)));
    const referentMap = new Map<string, string>();
    for (const refId of referentIds) {
      const ref = await storage.getReferent(refId);
      if (ref) {
        referentMap.set(refId, `${ref.firstName || ""} ${ref.lastName || ""}`.trim());
      }
    }
    const enriched = opportunities.map(o => ({
      ...o,
      referentName: o.referentId ? referentMap.get(o.referentId) || null : null,
    }));

    // Filtro opportunità vinte con enrichment leadName + quoteTotal
    if (req.query.won === "true") {
      const wonOpps = enriched.filter(o => o.wonAt !== null);
      const enrichedWon = await Promise.all(wonOpps.map(async o => {
        const lead = await storage.getLead(o.leadId, o.companyId);
        const leadName = lead
          ? (lead.entityType === "COMPANY" ? lead.name || "" : `${lead.firstName || ""} ${lead.lastName || ""}`.trim())
          : null;
        const oppQuotes = await storage.getQuotesByOpportunity(o.id, o.companyId);
        const quoteTotal = oppQuotes.reduce((sum, q) => sum + parseFloat(q.totalAmount || "0"), 0);
        return { ...o, leadName, quoteTotal: quoteTotal.toFixed(2) };
      }));
      return res.json(enrichedWon);
    }

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching opportunities:", error);
    res.status(500).json({ message: "Errore nel recupero delle opportunità" });
  }
});

// GET /api/opportunities/:opportunityId/quotes - Lista preventivi di un'opportunità
opportunitiesRouter.get("/opportunities/:opportunityId/quotes", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const quotes = await storage.getQuotesByOpportunity(req.params.opportunityId, userCompany.companyId);
    res.json(quotes);
  } catch (error) {
    console.error("Error fetching quotes:", error);
    res.status(500).json({ message: "Errore nel recupero dei preventivi" });
  }
});

// GET /api/opportunities/:id - Dettaglio singola opportunità
opportunitiesRouter.get("/opportunities/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const opportunity = await storage.getOpportunity(req.params.id, userCompany.companyId);
    if (!opportunity) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    const lead = await storage.getLead(opportunity.leadId, userCompany.companyId);
    const leadNotes = lead?.notes || null;
    const leadName = lead
      ? (lead.entityType === "COMPANY"
        ? lead.name || ""
        : `${lead.firstName || ""} ${lead.lastName || ""}`.trim())
      : null;

    res.json({ ...opportunity, leadNotes, leadName });
  } catch (error) {
    console.error("Error fetching opportunity:", error);
    res.status(500).json({ message: "Errore nel recupero dell'opportunità" });
  }
});

// POST /api/opportunities - Crea nuova opportunità
opportunitiesRouter.post("/opportunities", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const validationSchema = insertOpportunitySchema.omit({ companyId: true, wonAt: true, lostAt: true, quoteSentAt: true, quoteReminderSnoozedUntil: true });
    const validatedData = validationSchema.parse(req.body);

    if (!isAdmin(role) && "assignedToUserId" in validatedData) {
      delete (validatedData as Record<string, unknown>).assignedToUserId;
    }
    if (validatedData.assignedToUserId) {
      const sameCompany = await validateUserInSameCompany(validatedData.assignedToUserId, userCompany.companyId);
      if (!sameCompany) {
        return res.status(400).json({ message: "Utente assegnatario non appartiene alla stessa azienda" });
      }
    }

    // Verifica che il lead esista e appartenga alla stessa azienda
    const lead = await storage.getLead(validatedData.leadId, userCompany.companyId);
    if (!lead) {
      return res.status(400).json({ message: "Lead non trovato o non appartiene alla tua azienda" });
    }

    // Verifica che lo stage esista e appartenga alla stessa azienda (se specificato)
    if (validatedData.stageId) {
      const stage = await storage.getStage(validatedData.stageId, userCompany.companyId);
      if (!stage) {
        return res.status(400).json({ message: "Fase pipeline non trovata" });
      }
    }

    // Eredita automaticamente l'assegnazione dal lead
    const opportunity = await storage.createOpportunity({
      ...validatedData,
      companyId: userCompany.companyId,
      assignedToUserId: validatedData.assignedToUserId || lead.assignedToUserId,
    });

    // Log creazione opportunità
    await storage.createActivityLog({
      companyId: userCompany.companyId,
      userId,
      entityType: "opportunity",
      entityId: opportunity.id,
      action: "created",
      details: {
        title: opportunity.title,
        value: opportunity.value,
        leadId: opportunity.leadId,
        leadName: `${lead.firstName} ${lead.lastName}`,
      },
    });

    res.status(201).json(opportunity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: error.errors
      });
    }
    console.error("Error creating opportunity:", error);
    res.status(500).json({ message: "Errore nella creazione dell'opportunità" });
  }
});

// PATCH /api/opportunities/:id - Aggiorna opportunità
opportunitiesRouter.patch("/opportunities/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const body = { ...req.body };
    if (body.estimatedStartDate && typeof body.estimatedStartDate === "string") {
      body.estimatedStartDate = new Date(body.estimatedStartDate);
    }
    if (body.estimatedEndDate && typeof body.estimatedEndDate === "string") {
      body.estimatedEndDate = new Date(body.estimatedEndDate);
    }

    const validationSchema = insertOpportunitySchema.omit({ companyId: true, wonAt: true, lostAt: true, quoteSentAt: true, quoteReminderSnoozedUntil: true }).partial();
    const validatedData = validationSchema.parse(body);

    // Only admins can change the assignee. Strip it from the payload otherwise
    // so a SALES_AGENT can't reassign opportunities (his own or others').
    if (!isAdmin(role) && "assignedToUserId" in validatedData) {
      delete (validatedData as Record<string, unknown>).assignedToUserId;
    }
    // If an admin is (re)assigning, make sure the target user belongs to the
    // same company — prevents cross-tenant assignment via crafted payload.
    if (validatedData.assignedToUserId) {
      const sameCompany = await validateUserInSameCompany(validatedData.assignedToUserId, userCompany.companyId);
      if (!sameCompany) {
        return res.status(400).json({ message: "Utente assegnatario non appartiene alla stessa azienda" });
      }
    }

    // Verifica che lo stage esista se viene aggiornato
    let patchStage: { name: string } | null = null;
    if (validatedData.stageId) {
      const stage = await storage.getStage(validatedData.stageId, userCompany.companyId);
      if (!stage) {
        return res.status(400).json({ message: "Fase pipeline non trovata" });
      }
      patchStage = stage;
    }

    // Recupera opportunità esistente per log dei cambiamenti
    const existingOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);

    // Imposta wonAt/lostAt/quoteSentAt solo quando lo stage cambia effettivamente
    const stageActuallyChanged = patchStage && validatedData.stageId !== existingOpp?.stageId;
    const dataWithTimestamps: typeof validatedData & { wonAt?: Date | null; lostAt?: Date | null; quoteSentAt?: Date } = { ...validatedData };
    if (stageActuallyChanged && patchStage) {
      if (patchStage.name === "Vinto") {
        dataWithTimestamps.wonAt = new Date();
        dataWithTimestamps.lostAt = null;
        (dataWithTimestamps as any).siteStatus = "ACTIVE";
      } else if (patchStage.name === "Perso") {
        dataWithTimestamps.lostAt = new Date();
        dataWithTimestamps.wonAt = null;
      } else {
        dataWithTimestamps.wonAt = null;
        dataWithTimestamps.lostAt = null;
      }
      if (patchStage.name === "Preventivo Inviato" && !existingOpp?.quoteSentAt) {
        dataWithTimestamps.quoteSentAt = new Date();
      }
    }

    // Note: storage type declares wonAt/lostAt as Date|undefined but runtime correctly handles null (clears DB field)
    const opportunity = await storage.updateOpportunity(req.params.id, userCompany.companyId, dataWithTimestamps as any);

    if (!opportunity) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    // Quando l'opportunità diventa "Vinto" (stage effettivamente cambiato), approva automaticamente tutti i preventivi collegati
    if (stageActuallyChanged && patchStage?.name === "Vinto") {
      try {
        const oppQuotes = await storage.getQuotesByOpportunity(opportunity.id, userCompany.companyId);
        for (const q of oppQuotes) {
          if (q.status !== "ACCEPTED") {
            await storage.updateQuote(q.id, userCompany.companyId, { status: "ACCEPTED" });
          }
        }
      } catch (quoteErr) {
        console.error("Error auto-approving quotes on Vinto:", quoteErr);
      }
    }

    if (validatedData.lostReason === "NOT_IN_TARGET" && opportunity.leadId) {
      try {
        await storage.updateLead(opportunity.leadId, userCompany.companyId, { type: "non_in_target" } as any);
      } catch (err) {
        console.error("Error auto-updating lead type to non_in_target:", err);
      }
    }

    // Auto-geocoding quando cambia l'indirizzo cantiere
    if ((validatedData.siteAddress || validatedData.siteCity) && !validatedData.siteLatitude) {
      const addr = `${opportunity.siteAddress || ""} ${opportunity.siteZip || ""} ${opportunity.siteCity || ""} Italia`;
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=it`,
          { headers: { "User-Agent": "DaDoPonteggiCRM/1.0" } }
        );
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          await storage.updateOpportunity(req.params.id, userCompany.companyId, {
            siteLatitude: geoData[0].lat,
            siteLongitude: geoData[0].lon,
          } as any);
          opportunity.siteLatitude = geoData[0].lat;
          opportunity.siteLongitude = geoData[0].lon;
        }
      } catch (geoErr) {
        console.error("Geocoding error:", geoErr);
      }
    }

    // Log aggiornamento opportunità
    if (existingOpp) {
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const key of Object.keys(validatedData) as (keyof typeof validatedData)[]) {
        if (existingOpp[key] !== (validatedData as Record<string, unknown>)[key]) {
          changes[key] = { old: existingOpp[key], new: (validatedData as Record<string, unknown>)[key] };
        }
      }
      if (Object.keys(changes).length > 0) {
        await storage.createActivityLog({
          companyId: userCompany.companyId,
          userId,
          entityType: "opportunity",
          entityId: opportunity.id,
          action: "updated",
          details: { title: opportunity.title, changes },
        });
      }
    }

    res.json(opportunity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: error.errors
      });
    }
    console.error("Error updating opportunity:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'opportunità" });
  }
});

// PUT /api/opportunities/:id/move - Sposta opportunità in nuova fase (Kanban)
opportunitiesRouter.put("/opportunities/:id/move", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const { stageId } = req.body;
    if (!stageId) {
      return res.status(400).json({ message: "stageId obbligatorio" });
    }

    // Recupera opportunità e stage precedente per il log
    const existingOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);
    const previousStage = existingOpp?.stageId ? await storage.getStage(existingOpp.stageId, userCompany.companyId) : null;
    const newStage = await storage.getStage(stageId, userCompany.companyId);

    const opportunity = await storage.moveOpportunityToStage(req.params.id, stageId, userCompany.companyId);

    if (!opportunity) {
      return res.status(404).json({ message: "Opportunità o fase non trovati" });
    }

    // Log spostamento opportunità
    if (existingOpp && previousStage?.id !== stageId) {
      await storage.createActivityLog({
        companyId: userCompany.companyId,
        userId,
        entityType: "opportunity",
        entityId: opportunity.id,
        action: "moved",
        details: {
          title: opportunity.title,
          fromStage: previousStage?.name || "Nessuna fase",
          toStage: newStage?.name || "Sconosciuto",
        },
      });
    }

    // Imposta siteStatus = "ACTIVE" quando opportunità passa a "Vinto"
    if (newStage && newStage.name === "Vinto") {
      try {
        await storage.updateOpportunity(opportunity.id, userCompany.companyId, { siteStatus: "ACTIVE" } as any);
      } catch (siteErr) {
        console.error("Error setting siteStatus=ACTIVE on Vinto:", siteErr);
      }
    }

    // Auto-approva preventivi quando opportunità passa a "Vinto"
    if (newStage && newStage.name === "Vinto") {
      try {
        const oppQuotes = await storage.getQuotesByOpportunity(opportunity.id, userCompany.companyId);
        for (const q of oppQuotes) {
          if (q.status !== "ACCEPTED") {
            await storage.updateQuote(q.id, userCompany.companyId, { status: "ACCEPTED" });
          }
        }
      } catch (quoteErr) {
        console.error("Error auto-approving quotes on Vinto (move):", quoteErr);
      }
    }

    res.json(opportunity);
  } catch (error) {
    console.error("Error moving opportunity:", error);
    res.status(500).json({ message: "Errore nello spostamento dell'opportunità" });
  }
});

// POST /api/opportunities/:id/duplicate - Duplica opportunità con preventivo
opportunitiesRouter.post("/opportunities/:id/duplicate", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const sourceOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);
    if (!sourceOpp) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    const stages = await storage.getStagesByCompany(userCompany.companyId);
    const firstStage = stages.length > 0 ? stages.sort((a, b) => a.order - b.order)[0] : null;

    const newOppData: InsertOpportunity = {
      title: `${sourceOpp.title} (copia)`,
      description: sourceOpp.description,
      value: null,
      stageId: firstStage?.id || sourceOpp.stageId,
      leadId: sourceOpp.leadId,
      referentId: null,
      companyId: userCompany.companyId,
      assignedToUserId: sourceOpp.assignedToUserId,
      siteAddress: sourceOpp.siteAddress,
      siteCity: sourceOpp.siteCity,
      siteZip: sourceOpp.siteZip,
      siteProvince: sourceOpp.siteProvince,
      mapsLink: sourceOpp.mapsLink,
      siteDistanceKm: sourceOpp.siteDistanceKm,
      siteSquadraInZonaKm: sourceOpp.siteSquadraInZonaKm,
      veniceZone: sourceOpp.veniceZone,
      siteLatitude: sourceOpp.siteLatitude,
      siteLongitude: sourceOpp.siteLongitude,
      lostReason: null,
      siteQuality: null,
      estimatedStartDate: sourceOpp.estimatedStartDate,
      estimatedEndDate: sourceOpp.estimatedEndDate,
      sopralluogoFatto: sourceOpp.sopralluogoFatto,
      expectedCloseDate: sourceOpp.expectedCloseDate,
      probability: sourceOpp.probability,
    };

    const newOpp = await storage.createOpportunity(newOppData);

    const sourceQuotes = await storage.getQuotesByOpportunity(sourceOpp.id, userCompany.companyId);
    const activeQuote = sourceQuotes.find(q => q.status === "ACCEPTED")
      || sourceQuotes.find(q => q.status === "SENT")
      || sourceQuotes.find(q => q.status === "DRAFT")
      || (sourceQuotes.length > 0 ? sourceQuotes[0] : null);

    if (activeQuote) {
      // Retry loop: usa createQuoteWithNextNumber con advisory lock + retry su collisione
      let newQuote = null;
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          newQuote = await storage.createQuoteWithNextNumber({
            opportunityId: newOpp.id,
            companyId: userCompany.companyId,
            status: "DRAFT",
            totalAmount: activeQuote.totalAmount,
            globalParams: activeQuote.globalParams,
            discounts: activeQuote.discounts,
            handlingData: activeQuote.handlingData,
            pdfData: activeQuote.pdfData as any,
          });
          break;
        } catch (err: any) {
          if (isUniqueConstraintError(err)) {
            lastError = err;
            console.warn(`Conflitto numero preventivo in duplicazione (tentativo ${attempt + 1}/3), ritento...`);
            continue;
          }
          throw err;
        }
      }
      if (!newQuote) {
        throw lastError || new Error("Impossibile assegnare un numero univoco al preventivo duplicato");
      }

      const sourceItems = await storage.getQuoteItems(activeQuote.id);
      if (sourceItems.length > 0) {
        const newItems: InsertQuoteItem[] = sourceItems.map(item => ({
          quoteId: newQuote!.id,
          articleId: item.articleId,
          quantity: item.quantity,
          phase: item.phase,
          priceSnapshot: item.priceSnapshot,
          unitPriceApplied: item.unitPriceApplied,
          totalRow: item.totalRow,
          vatRate: item.vatRate,
        }));
        await storage.createQuoteItems(newItems);
      }
    }

    await storage.createActivityLog({
      companyId: userCompany.companyId,
      userId,
      entityType: "opportunity",
      entityId: newOpp.id,
      action: "created",
      details: {
        title: newOpp.title,
        duplicatedFrom: sourceOpp.id,
        duplicatedFromTitle: sourceOpp.title,
      },
    });

    res.status(201).json(newOpp);
  } catch (error: any) {
    console.error("Error duplicating opportunity:", error);
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "Impossibile assegnare un numero univoco al preventivo duplicato. Riprova tra qualche secondo." });
    }
    res.status(500).json({ message: "Errore nella duplicazione dell'opportunità" });
  }
});

// DELETE /api/opportunities/:id - Elimina opportunità
opportunitiesRouter.delete("/opportunities/:id", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    // Recupera opportunità prima dell'eliminazione per il log
    const existingOpp = await storage.getOpportunity(req.params.id, userCompany.companyId);

    const deleted = await storage.deleteOpportunity(req.params.id, userCompany.companyId);

    if (!deleted) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    // Log eliminazione opportunità
    if (existingOpp) {
      await storage.createActivityLog({
        companyId: userCompany.companyId,
        userId,
        entityType: "opportunity",
        entityId: req.params.id,
        action: "deleted",
        details: { title: existingOpp.title, value: existingOpp.value },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting opportunity:", error);
    res.status(500).json({ message: "Errore nell'eliminazione dell'opportunità" });
  }
});

// GET /api/opportunities/:id/site-details - Scheda Cantiere da opportunità
opportunitiesRouter.get("/opportunities/:id/site-details", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const opportunity = await storage.getOpportunity(req.params.id, userCompany.companyId);
    if (!opportunity) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    const lead = opportunity.leadId ? await storage.getLead(opportunity.leadId, userCompany.companyId) : null;

    let referent = null;
    if (opportunity.referentId) {
      referent = await storage.getReferent(opportunity.referentId);
    }

    const quotesForOpp = await storage.getQuotesByOpportunity(opportunity.id, userCompany.companyId);
    const acceptedQuote = quotesForOpp.find(q => q.status === "ACCEPTED") || quotesForOpp[0] || null;

    let quoteItemsList: any[] = [];
    if (acceptedQuote) {
      const rawItems = await storage.getQuoteItems(acceptedQuote.id);
      const articleIds = Array.from(new Set(rawItems.map(i => i.articleId).filter((id): id is string => !!id)));
      const articlesMap: Record<string, { name: string; pricingLogic: string }> = {};
      for (const artId of articleIds) {
        const art = await storage.getArticle(artId, userCompany.companyId);
        if (art) articlesMap[artId] = { name: art.name, pricingLogic: art.pricingLogic };
      }
      quoteItemsList = rawItems.map(item => ({
        ...item,
        articleName: articlesMap[item.articleId]?.name || item.articleId,
        pricingLogic: articlesMap[item.articleId]?.pricingLogic || null,
      }));
    }

    let transportInfo: Array<{ vehicleName: string; vehicleDescription: string; trips: number }> = [];
    if (acceptedQuote?.pdfData) {
      const pd = acceptedQuote.pdfData as any;
      const tItems = pd?.quote?.transportItems || [];
      const transportQuoteItems = quoteItemsList.filter((qi: any) => qi.pricingLogic === "TRANSPORT" && qi.phase === "TRASPORTO_ANDATA");
      for (const ti of tItems) {
        if (ti.articleId && ti.vehicleIndex != null) {
          const matchingItem = transportQuoteItems.find((qi: any) => qi.articleId === ti.articleId);
          const vehicles = matchingItem?.priceSnapshot?.vehicles || [];
          const v = vehicles[ti.vehicleIndex];
          if (v) {
            transportInfo.push({
              vehicleName: v.name,
              vehicleDescription: v.description || "",
              trips: ti.quantity || 1,
            });
          }
        }
      }
    }

    res.json({
      opportunity: {
        id: opportunity.id,
        title: opportunity.title,
        description: opportunity.description,
        value: opportunity.value,
        siteAddress: opportunity.siteAddress,
        siteCity: opportunity.siteCity,
        siteZip: opportunity.siteZip,
        siteProvince: opportunity.siteProvince,
        mapsLink: opportunity.mapsLink,
        estimatedStartDate: opportunity.estimatedStartDate,
        estimatedEndDate: opportunity.estimatedEndDate,
        sopralluogoFatto: opportunity.sopralluogoFatto,
      },
      lead: lead ? {
        id: lead.id,
        name: lead.name,
        firstName: lead.firstName,
        lastName: lead.lastName,
        entityType: lead.entityType,
        email: lead.email,
        phone: lead.phone,
      } : null,
      referent: referent ? {
        id: referent.id,
        firstName: referent.firstName,
        lastName: referent.lastName,
        role: referent.role,
        email: referent.email,
        phone: referent.phone,
        mobile: (referent as any).mobile,
      } : null,
      quote: acceptedQuote ? {
        id: acceptedQuote.id,
        number: acceptedQuote.number,
        status: acceptedQuote.status,
        totalAmount: acceptedQuote.totalAmount,
        globalParams: acceptedQuote.globalParams,
        pdfData: acceptedQuote.pdfData,
      } : null,
      quoteItems: quoteItemsList,
      transportInfo,
    });
  } catch (error) {
    console.error("Error fetching opportunity site details:", error);
    res.status(500).json({ message: "Errore nel recupero dei dettagli cantiere" });
  }
});

// POST /api/opportunities/:id/complete-site - Chiude il cantiere (siteStatus = "COMPLETED")
opportunitiesRouter.post("/opportunities/:id/complete-site", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const opp = await storage.getOpportunity(req.params.id, userCompany.companyId);
    if (!opp) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    if (!opp.wonAt) {
      return res.status(400).json({ message: "L'opportunità non è vinta" });
    }

    const updated = await storage.updateOpportunity(req.params.id, userCompany.companyId, {
      siteStatus: "COMPLETED",
    } as any);

    res.json(updated);
  } catch (error) {
    console.error("Error completing site:", error);
    res.status(500).json({ message: "Errore nella chiusura del cantiere" });
  }
});

// POST /api/opportunities/:id/snooze-reminder - Posticipa il promemoria di N giorni
opportunitiesRouter.post("/opportunities/:id/snooze-reminder", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;

    if (!canAccessLeads(role)) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const { days } = req.body;
    if (!days || typeof days !== "number" || days <= 0) {
      return res.status(400).json({ message: "days deve essere un numero positivo" });
    }

    const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const opp = await storage.updateOpportunity(req.params.id, userCompany.companyId, {
      quoteReminderSnoozedUntil: snoozedUntil,
    });

    if (!opp) {
      return res.status(404).json({ message: "Opportunità non trovata" });
    }

    res.json({ success: true, snoozedUntil });
  } catch (error: any) {
    console.error("Error snoozing reminder:", error);
    res.status(500).json({ message: error.message });
  }
});
