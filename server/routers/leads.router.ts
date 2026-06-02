import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import {
  insertLeadSchema,
  insertContactReferentSchema,
  PIPELINE_STAGES_FIXED,
} from "@shared/schema";
import { z } from "zod";

export const leadsRouter = Router();

function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(s\.r\.l\.?|srl|s\.p\.a\.?|spa|snc|s\.n\.c\.?|sas|s\.a\.s\.?|soc|società|societa|di|del|della|dei|degli|delle|il|lo|la|i|gli|le|e|&)\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// GET /api/leads — lista clienti con riepilogo opportunità + primo referente
leadsRouter.get("/leads", isAuthenticated, async (_req, res) => {
  try {
    const leads = await storage.getLeads();
    if (leads.length === 0) return res.json([]);

    const leadIds = leads.map((l) => l.id);
    const stages = await storage.getStages();
    const wonStageIds = new Set(stages.filter((s) => s.name === "Completato").map((s) => s.id));
    const opps = await storage.getOpportunitiesByLeadIds(leadIds);

    const summaryMap = new Map<string, { total: number; wonCount: number; lostCount: number; activeCount: number }>();
    for (const opp of opps) {
      if (!summaryMap.has(opp.leadId)) {
        summaryMap.set(opp.leadId, { total: 0, wonCount: 0, lostCount: 0, activeCount: 0 });
      }
      const s = summaryMap.get(opp.leadId)!;
      s.total += 1;
      if (opp.stageId && wonStageIds.has(opp.stageId)) s.wonCount += 1;
      else s.activeCount += 1;
    }

    const companyLeadIds = leads.filter((l) => l.entityType === "COMPANY").map((l) => l.id);
    const allReferents: { contactId: string; firstName: string | null; lastName: string | null }[] = [];
    for (const cid of companyLeadIds) {
      const refs = await storage.getReferentsByContact(cid);
      if (refs.length > 0) {
        allReferents.push({
          contactId: cid,
          firstName: refs[0].firstName,
          lastName: refs[0].lastName,
        });
      }
    }
    const refByContact = new Map(allReferents.map((r) => [r.contactId, `${r.firstName || ""} ${r.lastName || ""}`.trim()]));

    const result = leads.map((lead) => ({
      ...lead,
      firstReferentName: refByContact.get(lead.id) ?? null,
      opportunitySummary: summaryMap.get(lead.id) ?? { total: 0, wonCount: 0, lostCount: 0, activeCount: 0 },
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ message: "Errore nel recupero dei clienti" });
  }
});

// GET /api/leads/check-similar — verifica clienti simili (anti-duplicati)
leadsRouter.get("/leads/check-similar", isAuthenticated, async (req, res) => {
  try {
    const { name, email, phone, vatNumber } = req.query as {
      name?: string;
      email?: string;
      phone?: string;
      vatNumber?: string;
    };
    const allLeads = await storage.getLeads();
    const normalizedInputName = normalizeName(name);

    const similar: Array<{ lead: (typeof allLeads)[number]; reason: string }> = [];
    for (const lead of allLeads) {
      let reason: string | null = null;
      if (vatNumber && lead.vatNumber && vatNumber.trim().toLowerCase() === lead.vatNumber.trim().toLowerCase()) {
        reason = "same_vat";
      } else if (email && lead.email && email.trim().toLowerCase() === lead.email.trim().toLowerCase()) {
        reason = "same_email";
      } else if (phone && lead.phone && phone.trim().replace(/\s/g, "") === lead.phone.trim().replace(/\s/g, "")) {
        reason = "same_phone";
      } else if (normalizedInputName && normalizedInputName.length > 2) {
        const leadName = normalizeName(lead.name || `${lead.firstName || ""} ${lead.lastName || ""}`);
        if (leadName && leadName === normalizedInputName) reason = "same_name";
      }
      if (reason) similar.push({ lead, reason });
    }
    res.json(similar);
  } catch (error) {
    console.error("Error checking similar:", error);
    res.status(500).json({ message: "Errore nel controllo duplicati" });
  }
});

// GET /api/leads/:id — dettaglio cliente
leadsRouter.get("/leads/:id", isAuthenticated, async (req, res) => {
  try {
    const lead = await storage.getLead(req.params.id);
    if (!lead) return res.status(404).json({ message: "Cliente non trovato" });

    let firstReferentName: string | null = null;
    let firstReferentEmail: string | null = null;
    let firstReferentPhone: string | null = null;
    if (lead.entityType === "COMPANY") {
      const referents = await storage.getReferentsByContact(lead.id);
      const first = referents[0];
      if (first) {
        firstReferentName = `${first.firstName || ""} ${first.lastName || ""}`.trim();
        firstReferentEmail = first.email ?? null;
        firstReferentPhone = first.phone ?? null;
      }
    }
    res.json({ ...lead, firstReferentName, firstReferentEmail, firstReferentPhone });
  } catch (error) {
    console.error("Error fetching lead:", error);
    res.status(500).json({ message: "Errore nel recupero del cliente" });
  }
});

// POST /api/leads — crea cliente
leadsRouter.post("/leads", isAuthenticated, async (req, res) => {
  try {
    const validated = insertLeadSchema.parse(req.body);
    const lead = await storage.createLead(validated);
    res.status(201).json(lead);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error creating lead:", error);
    res.status(500).json({ message: "Errore nella creazione del cliente" });
  }
});

// PATCH /api/leads/:id — aggiorna cliente
leadsRouter.patch("/leads/:id", isAuthenticated, async (req, res) => {
  try {
    const validated = insertLeadSchema.partial().parse(req.body);
    const lead = await storage.updateLead(req.params.id, validated);
    if (!lead) return res.status(404).json({ message: "Cliente non trovato" });
    res.json(lead);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating lead:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento" });
  }
});

// DELETE /api/leads/:id
leadsRouter.delete("/leads/:id", isAuthenticated, async (req, res) => {
  try {
    const deleted = await storage.deleteLead(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Cliente non trovato" });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting lead:", error);
    res.status(500).json({ message: "Errore nell'eliminazione" });
  }
});

// GET /api/leads/:id/opportunities
leadsRouter.get("/leads/:id/opportunities", isAuthenticated, async (req, res) => {
  try {
    const opps = await storage.getOpportunitiesByLead(req.params.id);
    res.json(opps);
  } catch (error) {
    console.error("Error fetching lead opportunities:", error);
    res.status(500).json({ message: "Errore" });
  }
});

// ============ REFERENTI ============

leadsRouter.get("/leads/:id/referents", isAuthenticated, async (req, res) => {
  try {
    const lead = await storage.getLead(req.params.id);
    if (!lead) return res.status(404).json({ message: "Cliente non trovato" });
    const referents = await storage.getReferentsByContact(req.params.id);
    res.json(referents);
  } catch (error) {
    console.error("Error fetching referents:", error);
    res.status(500).json({ message: "Errore" });
  }
});

leadsRouter.post("/leads/:id/referents", isAuthenticated, async (req, res) => {
  try {
    const lead = await storage.getLead(req.params.id);
    if (!lead) return res.status(404).json({ message: "Cliente non trovato" });
    const parsed = insertContactReferentSchema.omit({ contactId: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
    }
    const referent = await storage.createReferent({ ...parsed.data, contactId: req.params.id });
    res.status(201).json(referent);
  } catch (error) {
    console.error("Error creating referent:", error);
    res.status(500).json({ message: "Errore" });
  }
});

leadsRouter.patch("/referents/:id", isAuthenticated, async (req, res) => {
  try {
    const parsed = insertContactReferentSchema.omit({ contactId: true }).partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
    }
    const referent = await storage.updateReferent(req.params.id, parsed.data);
    if (!referent) return res.status(404).json({ message: "Referente non trovato" });
    res.json(referent);
  } catch (error) {
    console.error("Error updating referent:", error);
    res.status(500).json({ message: "Errore" });
  }
});

leadsRouter.delete("/referents/:id", isAuthenticated, async (req, res) => {
  try {
    const deleted = await storage.deleteReferent(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Referente non trovato" });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting referent:", error);
    res.status(500).json({ message: "Errore" });
  }
});

// Esportato per testing / log: i nomi stadi fissi
export const FIXED_STAGE_NAMES = PIPELINE_STAGES_FIXED.map((s) => s.name);
