import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { insertOpportunitySchema } from "@shared/schema";
import { z } from "zod";

export const opportunitiesRouter = Router();

// ============ PIPELINE STAGES (read-only: stadi fissi) ============

opportunitiesRouter.get("/stages", isAuthenticated, async (_req, res) => {
  try {
    const stages = await storage.getStages();
    res.json(stages);
  } catch (error) {
    console.error("Error fetching stages:", error);
    res.status(500).json({ message: "Errore nel recupero delle fasi" });
  }
});

// ============ OPPORTUNITIES ============

opportunitiesRouter.get("/opportunities", isAuthenticated, async (_req, res) => {
  try {
    const opps = await storage.getOpportunities();
    const referentIds = Array.from(new Set(opps.map((o) => o.referentId).filter((x): x is string => x !== null)));
    const refMap = new Map<string, string>();
    for (const rid of referentIds) {
      const ref = await storage.getReferent(rid);
      if (ref) refMap.set(rid, `${ref.firstName || ""} ${ref.lastName || ""}`.trim());
    }
    const enriched = opps.map((o) => ({
      ...o,
      referentName: o.referentId ? refMap.get(o.referentId) ?? null : null,
    }));
    res.json(enriched);
  } catch (error) {
    console.error("Error fetching opportunities:", error);
    res.status(500).json({ message: "Errore nel recupero" });
  }
});

opportunitiesRouter.get("/opportunities/:id", isAuthenticated, async (req, res) => {
  try {
    const opportunity = await storage.getOpportunity(req.params.id);
    if (!opportunity) return res.status(404).json({ message: "Opportunità non trovata" });
    const lead = await storage.getLead(opportunity.leadId);
    const leadName = lead
      ? lead.entityType === "COMPANY"
        ? lead.name || ""
        : `${lead.firstName || ""} ${lead.lastName || ""}`.trim()
      : null;
    res.json({ ...opportunity, leadName, leadNotes: lead?.notes ?? null });
  } catch (error) {
    console.error("Error fetching opportunity:", error);
    res.status(500).json({ message: "Errore" });
  }
});

opportunitiesRouter.post("/opportunities", isAuthenticated, async (req, res) => {
  try {
    const validated = insertOpportunitySchema.parse(req.body);

    const lead = await storage.getLead(validated.leadId);
    if (!lead) return res.status(400).json({ message: "Cliente non trovato" });

    if (validated.stageId) {
      const stage = await storage.getStage(validated.stageId);
      if (!stage) return res.status(400).json({ message: "Fase pipeline non trovata" });
    }

    const opportunity = await storage.createOpportunity(validated);
    res.status(201).json(opportunity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error creating opportunity:", error);
    res.status(500).json({ message: "Errore" });
  }
});

opportunitiesRouter.patch("/opportunities/:id", isAuthenticated, async (req, res) => {
  try {
    const body = { ...req.body };
    for (const dateField of ["estimatedStartDate", "estimatedEndDate", "expectedCloseDate", "wonAt", "lostAt"]) {
      if (body[dateField] && typeof body[dateField] === "string") {
        body[dateField] = new Date(body[dateField]);
      }
    }
    const validated = insertOpportunitySchema.partial().parse(body);

    if (validated.stageId) {
      const stage = await storage.getStage(validated.stageId);
      if (!stage) return res.status(400).json({ message: "Fase pipeline non trovata" });
      const dataWithTs: typeof validated & { wonAt?: Date | null; lostAt?: Date | null } = { ...validated };
      const existing = await storage.getOpportunity(req.params.id);
      if (existing && existing.stageId !== validated.stageId) {
        if (stage.name === "Completato") {
          dataWithTs.wonAt = new Date();
          dataWithTs.lostAt = null;
          (dataWithTs as any).lostReason = null;
        } else if (stage.name === "Persa") {
          dataWithTs.lostAt = new Date();
          dataWithTs.wonAt = null;
        } else {
          dataWithTs.wonAt = null;
          dataWithTs.lostAt = null;
          (dataWithTs as any).lostReason = null;
        }
      }
      const opp = await storage.updateOpportunity(req.params.id, dataWithTs);
      if (!opp) return res.status(404).json({ message: "Opportunità non trovata" });
      return res.json(opp);
    }

    const opp = await storage.updateOpportunity(req.params.id, validated);
    if (!opp) return res.status(404).json({ message: "Opportunità non trovata" });
    res.json(opp);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating opportunity:", error);
    res.status(500).json({ message: "Errore" });
  }
});

// PUT /api/opportunities/:id/move — sposta in nuovo stage (kanban DnD)
opportunitiesRouter.put("/opportunities/:id/move", isAuthenticated, async (req, res) => {
  try {
    const { stageId, lostReason } = req.body;
    if (!stageId) return res.status(400).json({ message: "stageId obbligatorio" });
    const opportunity = await storage.moveOpportunityToStage(req.params.id, stageId, lostReason ?? null);
    if (!opportunity) return res.status(404).json({ message: "Opportunità o fase non trovati" });
    res.json(opportunity);
  } catch (error) {
    console.error("Error moving opportunity:", error);
    res.status(500).json({ message: "Errore nello spostamento" });
  }
});

opportunitiesRouter.delete("/opportunities/:id", isAuthenticated, async (req, res) => {
  try {
    const deleted = await storage.deleteOpportunity(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Opportunità non trovata" });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting opportunity:", error);
    res.status(500).json({ message: "Errore" });
  }
});
