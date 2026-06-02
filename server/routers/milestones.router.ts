import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { insertOpportunityMilestoneSchema } from "@shared/schema";
import { z } from "zod";

export const milestonesRouter = Router();

// Tutte le milestone vivono come sub-resource di un'opportunità.

// GET /api/opportunities/:opportunityId/milestones
milestonesRouter.get("/opportunities/:opportunityId/milestones", isAuthenticated, async (req, res) => {
  try {
    const opp = await storage.getOpportunity(req.params.opportunityId);
    if (!opp) return res.status(404).json({ message: "Opportunità non trovata" });
    const milestones = await storage.getMilestonesByOpportunity(req.params.opportunityId);
    res.json(milestones);
  } catch (error) {
    console.error("Error fetching milestones:", error);
    res.status(500).json({ message: "Errore nel recupero delle rate" });
  }
});

// POST /api/opportunities/:opportunityId/milestones
milestonesRouter.post("/opportunities/:opportunityId/milestones", isAuthenticated, async (req, res) => {
  try {
    const opp = await storage.getOpportunity(req.params.opportunityId);
    if (!opp) return res.status(404).json({ message: "Opportunità non trovata" });

    const body = { ...req.body, opportunityId: req.params.opportunityId };
    for (const dateField of ["invoiceDate", "paymentDate"]) {
      if (body[dateField] && typeof body[dateField] === "string") {
        body[dateField] = new Date(body[dateField]);
      }
    }
    const validated = insertOpportunityMilestoneSchema.parse(body);
    const milestone = await storage.createMilestone(validated);
    res.status(201).json(milestone);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error creating milestone:", error);
    res.status(500).json({ message: "Errore nella creazione della rata" });
  }
});

// PATCH /api/milestones/:id
milestonesRouter.patch("/milestones/:id", isAuthenticated, async (req, res) => {
  try {
    const body = { ...req.body };
    for (const dateField of ["invoiceDate", "paymentDate"]) {
      if (body[dateField] && typeof body[dateField] === "string") {
        body[dateField] = new Date(body[dateField]);
      }
    }
    const validated = insertOpportunityMilestoneSchema.partial().parse(body);
    const milestone = await storage.updateMilestone(req.params.id, validated);
    if (!milestone) return res.status(404).json({ message: "Rata non trovata" });
    res.json(milestone);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating milestone:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento" });
  }
});

// DELETE /api/milestones/:id
milestonesRouter.delete("/milestones/:id", isAuthenticated, async (req, res) => {
  try {
    const deleted = await storage.deleteMilestone(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Rata non trovata" });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting milestone:", error);
    res.status(500).json({ message: "Errore nell'eliminazione" });
  }
});
