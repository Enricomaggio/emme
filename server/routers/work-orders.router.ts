import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { resolveUserCompany } from "../utils/accessContext";

export const workOrdersRouter = Router();

// GET /api/work-orders?opportunityId=...
// Restituisce la nota lavori (con le righe) per un'opportunità, o null se non esiste.
workOrdersRouter.get("/work-orders", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const { opportunityId } = req.query;
    if (!opportunityId || typeof opportunityId !== "string") {
      return res.status(400).json({ error: "opportunityId obbligatorio" });
    }

    const wo = await storage.getWorkOrderByOpportunity(opportunityId, userCtx.companyId);
    res.json(wo); // null se non esiste
  } catch (e) {
    console.error("[work-orders] GET error:", e);
    res.status(500).json({ error: "Errore interno" });
  }
});

// POST /api/work-orders
// Crea una nuova nota lavori (da preventivo o vuota).
workOrdersRouter.post("/work-orders", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const body = z
      .object({
        opportunityId: z.string().min(1),
        quoteId: z.string().optional(),
      })
      .parse(req.body);

    let wo;
    if (body.quoteId) {
      wo = await storage.createWorkOrderFromQuote(
        userCtx.companyId,
        body.opportunityId,
        body.quoteId
      );
    } else {
      wo = await storage.createEmptyWorkOrder(userCtx.companyId, body.opportunityId);
    }

    res.status(201).json(wo);
  } catch (e) {
    console.error("[work-orders] POST error:", e);
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Dati non validi", details: e.errors });
    }
    res.status(500).json({ error: "Errore interno" });
  }
});

// PUT /api/work-orders/:id
// Aggiorna header + righe della nota lavori in un'unica chiamata.
workOrdersRouter.put("/work-orders/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const itemSchema = z.object({
      description: z.string().default(""),
      unitOfMeasure: z.string().default("ml"),
      quantity: z.string().default("0"),
      unitPrice: z.string().default("0"),
      totalRow: z.string().default("0"),
      displayOrder: z.number().int().default(0),
    });

    const body = z
      .object({
        subject: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        totalAmount: z.string().optional(),
        items: z.array(itemSchema).optional(),
      })
      .parse(req.body);

    const { items, ...header } = body;

    const wo = await storage.updateWorkOrder(
      req.params.id,
      userCtx.companyId,
      header,
      items
    );

    if (!wo) return res.status(404).json({ error: "Nota lavori non trovata" });
    res.json(wo);
  } catch (e) {
    console.error("[work-orders] PUT error:", e);
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Dati non validi", details: e.errors });
    }
    res.status(500).json({ error: "Errore interno" });
  }
});

// DELETE /api/work-orders/:id
workOrdersRouter.delete("/work-orders/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const ok = await storage.deleteWorkOrder(req.params.id, userCtx.companyId);
    if (!ok) return res.status(404).json({ error: "Nota lavori non trovata" });
    res.status(204).end();
  } catch (e) {
    console.error("[work-orders] DELETE error:", e);
    res.status(500).json({ error: "Errore interno" });
  }
});
