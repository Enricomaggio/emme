import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { resolveUserCompany } from "../utils/accessContext";

export const workOrdersRouter = Router();

// GET /api/work-orders?opportunityId=... | ?companyScope=all
// Con opportunityId: restituisce array di WO per quell'opportunità.
// Con companyScope=all: restituisce tutte le WO della company.
workOrdersRouter.get("/work-orders", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const { opportunityId, companyScope } = req.query;

    if (companyScope === "all") {
      const wos = await storage.getAllWorkOrdersByCompany(userCtx.companyId);
      return res.json(wos);
    }

    if (!opportunityId || typeof opportunityId !== "string") {
      return res.status(400).json({ error: "opportunityId obbligatorio" });
    }

    const wos = await storage.getWorkOrdersByOpportunity(opportunityId, userCtx.companyId);
    res.json(wos);
  } catch (e) {
    console.error("[work-orders] GET error:", e);
    res.status(500).json({ error: "Errore interno" });
  }
});

// GET /api/work-orders/:id
// Restituisce una singola nota lavori con le sue righe.
workOrdersRouter.get("/work-orders/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const wo = await storage.getWorkOrder(req.params.id, userCtx.companyId);
    if (!wo) return res.status(404).json({ error: "Nota lavori non trovata" });
    res.json(wo);
  } catch (e) {
    console.error("[work-orders] GET /:id error:", e);
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

// POST /api/work-orders/:id/send
// Imposta status = "SENT", sentAt = now()
workOrdersRouter.post("/work-orders/:id/send", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const wo = await storage.updateWorkOrder(
      req.params.id,
      userCtx.companyId,
      { status: "SENT", sentAt: new Date() }
    );

    if (!wo) return res.status(404).json({ error: "Nota lavori non trovata" });
    res.json(wo);
  } catch (e) {
    console.error("[work-orders] POST /send error:", e);
    res.status(500).json({ error: "Errore interno" });
  }
});

// POST /api/work-orders/:id/confirm
// Imposta status = "CONFIRMED", confirmedAt = now()
// Imposta siteStatus = "INVOICING_PENDING" sull'opportunity collegata
workOrdersRouter.post("/work-orders/:id/confirm", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const existingWo = await storage.getWorkOrder(req.params.id, userCtx.companyId);
    if (!existingWo) return res.status(404).json({ error: "Nota lavori non trovata" });

    const wo = await storage.updateWorkOrder(
      req.params.id,
      userCtx.companyId,
      { status: "CONFIRMED", confirmedAt: new Date() }
    );

    const opportunity = await storage.updateOpportunity(
      existingWo.opportunityId,
      userCtx.companyId,
      { siteStatus: "INVOICING_PENDING" } as any
    );

    res.json({ workOrder: wo, opportunity: opportunity ?? null });
  } catch (e) {
    console.error("[work-orders] POST /confirm error:", e);
    res.status(500).json({ error: "Errore interno" });
  }
});

// GET /api/opportunities/:id/sal
// Restituisce il SAL per riga di preventivo dell'opportunity.
workOrdersRouter.get("/opportunities/:id/sal", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const sal = await storage.getSal(req.params.id, userCtx.companyId);
    res.json(sal);
  } catch (e) {
    console.error("[work-orders] GET /sal error:", e);
    res.status(500).json({ error: "Errore interno" });
  }
});

// POST /api/opportunities/:id/work-orders/from-quote
// Crea una NL con selezione parziale delle righe di un preventivo.
workOrdersRouter.post("/opportunities/:id/work-orders/from-quote", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const itemSchema = z.object({
      sourceQuoteItemId: z.string().min(1),
      description: z.string().default(""),
      unitOfMeasure: z.string().default(""),
      quantity: z.string().default("0"),
      unitPrice: z.string().default("0"),
      totalRow: z.string().default("0"),
    });

    const body = z
      .object({
        quoteId: z.string().min(1),
        items: z.array(itemSchema).min(1),
      })
      .parse(req.body);

    const wo = await storage.createWorkOrderFromSelection(
      userCtx.companyId,
      req.params.id,
      body.quoteId,
      body.items
    );

    await storage.updateOpportunity(req.params.id, userCtx.companyId, { siteStatus: "ACTIVE" } as any);

    res.status(201).json(wo);
  } catch (e) {
    console.error("[work-orders] POST /from-quote error:", e);
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Dati non validi", details: e.errors });
    }
    res.status(500).json({ error: "Errore interno" });
  }
});

// POST /api/work-orders/:id/invoice
// body: { invoicedAmount: string }
// Salva invoicedAmount, invoicedAt = now()
// Imposta siteStatus = "ACTIVE" sull'opportunity (logica SAL completa al Prompt 2)
workOrdersRouter.post("/work-orders/:id/invoice", isAuthenticated, async (req: any, res) => {
  try {
    const userCtx = await resolveUserCompany(req.user.id, req.user.role, req);
    if (!userCtx) return res.status(403).json({ error: "No company access" });

    const { invoicedAmount } = z
      .object({ invoicedAmount: z.string().min(1) })
      .parse(req.body);

    const existingWo = await storage.getWorkOrder(req.params.id, userCtx.companyId);
    if (!existingWo) return res.status(404).json({ error: "Nota lavori non trovata" });

    const wo = await storage.registerInvoice(
      req.params.id,
      userCtx.companyId,
      invoicedAmount,
      new Date()
    );

    const opportunity = await storage.updateOpportunity(
      existingWo.opportunityId,
      userCtx.companyId,
      { siteStatus: "ACTIVE" } as any
    );

    res.json({ workOrder: wo, opportunity: opportunity ?? null });
  } catch (e) {
    console.error("[work-orders] POST /invoice error:", e);
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Dati non validi", details: e.errors });
    }
    res.status(500).json({ error: "Errore interno" });
  }
});
