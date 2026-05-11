import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, requireRole } from "../auth";
import { resolveUserCompany } from "../utils/accessContext";
import { insertPaymentMethodSchema } from "@shared/schema";

export const paymentMethodsRouter = Router();

// GET /api/payment-methods - Lista tutte le modalità di pagamento dell'azienda
paymentMethodsRouter.get("/payment-methods", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const methods = await storage.getPaymentMethodsByCompany(userCompany.companyId);
    res.json(methods);
  } catch (error: any) {
    console.error("Error fetching payment methods:", error);
    res.status(500).json({ message: error.message });
  }
});

// POST /api/payment-methods - Crea una nuova modalità di pagamento
paymentMethodsRouter.post("/payment-methods", isAuthenticated, requireRole("SUPER_ADMIN", "COMPANY_ADMIN"), async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const parsed = insertPaymentMethodSchema.omit({ companyId: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
    }

    const method = await storage.createPaymentMethod({ ...parsed.data, companyId: userCompany.companyId });
    res.status(201).json(method);
  } catch (error: any) {
    console.error("Error creating payment method:", error);
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/payment-methods/:id - Aggiorna una modalità di pagamento
paymentMethodsRouter.patch("/payment-methods/:id", isAuthenticated, requireRole("SUPER_ADMIN", "COMPANY_ADMIN"), async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const parsed = insertPaymentMethodSchema.omit({ companyId: true }).partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dati non validi", errors: parsed.error.flatten() });
    }

    const method = await storage.updatePaymentMethod(req.params.id, userCompany.companyId, parsed.data);
    if (!method) {
      return res.status(404).json({ message: "Modalità di pagamento non trovata" });
    }

    res.json(method);
  } catch (error: any) {
    console.error("Error updating payment method:", error);
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/payment-methods/:id - Elimina una modalità di pagamento
paymentMethodsRouter.delete("/payment-methods/:id", isAuthenticated, requireRole("SUPER_ADMIN", "COMPANY_ADMIN"), async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const deleted = await storage.deletePaymentMethod(req.params.id, userCompany.companyId);
    if (!deleted) {
      return res.status(404).json({ message: "Modalità di pagamento non trovata" });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting payment method:", error);
    res.status(500).json({ message: error.message });
  }
});
