import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated, requireRole, getUserByEmail, sanitizeUser } from "../auth";
import { z } from "zod";

export const companyRouter = Router();

// ============================================
// SUPER ADMIN API Routes — /api/admin/companies
// ============================================

// GET /api/admin/companies - Lista tutte le aziende con conteggio utenti
companyRouter.get("/admin/companies", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const companies = await storage.getAllCompaniesWithUserCount();
    res.json(companies);
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({ message: "Errore nel recupero delle aziende" });
  }
});

// POST /api/admin/companies - Crea nuova azienda con primo admin (transazione atomica)
companyRouter.post("/admin/companies", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const createCompanySchema = z.object({
      companyName: z.string().min(1, "Nome azienda obbligatorio"),
      vatNumber: z.string().optional(),
      address: z.string().optional(),
      adminFirstName: z.string().min(1, "Nome admin obbligatorio"),
      adminLastName: z.string().min(1, "Cognome admin obbligatorio"),
      adminEmail: z.string().email("Email admin non valida"),
      adminPassword: z.string()
        .min(8, "La password deve avere almeno 8 caratteri")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "La password deve contenere almeno una maiuscola, una minuscola e un numero"),
    });

    const validatedData = createCompanySchema.parse(req.body);

    // Verifica che l'email admin non esista già
    const existingUser = await getUserByEmail(validatedData.adminEmail);
    if (existingUser) {
      return res.status(400).json({ message: "Email admin già registrata nel sistema" });
    }

    // Crea company + admin in transazione atomica (all-or-nothing)
    const { company, admin } = await storage.createCompanyWithAdmin(
      {
        name: validatedData.companyName,
        vatNumber: validatedData.vatNumber || null,
        address: validatedData.address || null,
      },
      {
        firstName: validatedData.adminFirstName,
        lastName: validatedData.adminLastName,
        email: validatedData.adminEmail,
        password: validatedData.adminPassword,
      }
    );

    res.status(201).json({
      company,
      admin: sanitizeUser(admin),
      message: "Azienda e amministratore creati con successo",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error creating company:", error);
    res.status(500).json({ message: "Errore nella creazione dell'azienda" });
  }
});

// PATCH /api/admin/companies/:id - Modifica azienda
companyRouter.patch("/admin/companies/:id", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const updateCompanySchema = z.object({
      name: z.string().min(1, "Nome azienda obbligatorio").optional(),
      vatNumber: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
    });

    const validatedData = updateCompanySchema.parse(req.body);
    const company = await storage.updateCompany(req.params.id, validatedData);

    if (!company) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }

    res.json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating company:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'azienda" });
  }
});

// DELETE /api/admin/companies/:id - Elimina azienda (cascade su utenti e lead)
companyRouter.delete("/admin/companies/:id", isAuthenticated, requireRole("SUPER_ADMIN"), async (req, res) => {
  try {
    const deleted = await storage.deleteCompanyWithCascade(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ message: "Errore nell'eliminazione dell'azienda" });
  }
});

// POST /api/admin/sync-opportunity-assignments - Sincronizza venditore da lead a opportunità importate
// Accessibile solo a COMPANY_ADMIN e SUPER_ADMIN
companyRouter.post("/admin/sync-opportunity-assignments", isAuthenticated, async (req, res) => {
  try {
    const { role, id: userId } = req.user!;

    if (role !== "COMPANY_ADMIN" && role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Accesso negato: richiesto COMPANY_ADMIN o SUPER_ADMIN" });
    }

    // Usa resolveUserCompany che gestisce automaticamente x-company-id header per SUPER_ADMIN
    // COMPANY_ADMIN → companyId della propria azienda
    // SUPER_ADMIN + header x-company-id → quella companyId specifica
    // SUPER_ADMIN senza header → undefined (sync su tutte le aziende)
    const userCompany = await resolveUserCompany(userId, role, req);

    if (role === "COMPANY_ADMIN" && !userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const companyId = userCompany?.companyId;
    const updatedCount = await storage.syncOpportunityAssignments(companyId);

    res.json({
      message: `Sincronizzazione completata: ${updatedCount} opportunità aggiornate`,
      updatedCount,
    });
  } catch (error) {
    console.error("Error syncing opportunity assignments:", error);
    res.status(500).json({ message: "Errore nella sincronizzazione delle opportunità" });
  }
});

// ============================================
// TENANT SETTINGS — /api/company
// ============================================

// GET /api/company - Dati azienda corrente
companyRouter.get("/company", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }
    const company = await storage.getCompany(userCompany.companyId);
    if (!company) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }
    res.json(company);
  } catch (error) {
    console.error("Error fetching company:", error);
    res.status(500).json({ message: "Errore nel recupero dell'azienda" });
  }
});

// PUT /api/company - Aggiorna impostazioni azienda (nome, logo, P.IVA, IBAN…)
// NB: PATCH /api/company è mantenuto come alias per retrocompatibilità.
const updateCompanyHandler = async (req: any, res: any) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    // Solo COMPANY_ADMIN può modificare i dati azienda
    if (role !== "COMPANY_ADMIN") {
      return res.status(403).json({ message: "Accesso negato. Solo gli amministratori possono modificare i dati aziendali." });
    }

    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) {
      return res.status(403).json({ message: "Utente non associato a nessuna azienda" });
    }

    const updateCompanySchema = z.object({
      name: z.string().min(1).optional(),
      vatNumber: z.string().optional(),
      fiscalCode: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      shareCapital: z.string().optional(),
      iban: z.string().optional(),
      logoUrl: z.string().optional(),
      // Campi aggiuntivi per PDF preventivo
      pecEmail: z.string().email().optional().or(z.literal("")),
      website: z.string().optional(),
      rea: z.string().optional(),
      bankName: z.string().optional(),
      bankHolder: z.string().optional(),
      bankSwift: z.string().optional(),
      quotePaymentTerms: z.string().optional(),
      quoteValidityDays: z.coerce.number().int().min(1).max(365).optional(),
      quoteFooterNotes: z.string().optional(),
      emailSubjectTemplate: z.string().optional(),
      emailBodyTemplate: z.string().optional(),
      workOrderDisclaimerText: z.string().optional(),
      workOrderEmailSubjectTemplate: z.string().optional(),
      workOrderEmailBodyTemplate: z.string().optional(),
    });

    const validatedData = updateCompanySchema.parse(req.body);

    // Filtra campi vuoti o undefined
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== undefined) {
        updateData[key] = value === "" ? null : value;
      }
    }
    // quoteValidityDays è numerico: lo convertiamo da stringa se necessario è già fatto dal coerce


    const company = await storage.updateCompany(userCompany.companyId, updateData);

    if (!company) {
      return res.status(404).json({ message: "Azienda non trovata" });
    }

    res.json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dati non validi", errors: error.errors });
    }
    console.error("Error updating company:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'azienda" });
  }
};

companyRouter.put("/company", isAuthenticated, updateCompanyHandler);
companyRouter.patch("/company", isAuthenticated, updateCompanyHandler);

