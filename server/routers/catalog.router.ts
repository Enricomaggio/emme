import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import {
  insertMaterialSchema,
  insertMaterialThicknessSchema,
  insertArticleFamilySchema,
  insertCatalogArticleSchema,
  insertLaborRateSchema,
} from "@shared/schema";
import { z } from "zod";

export const catalogRouter = Router();

const updateMaterialSchema = insertMaterialSchema.partial();
const updateMaterialThicknessSchema = insertMaterialThicknessSchema.partial();
const updateArticleFamilySchema = insertArticleFamilySchema.partial();
const updateCatalogArticleSchema = insertCatalogArticleSchema.partial();
const updateLaborRateSchema = insertLaborRateSchema.partial();

const bulkUpdateSchema = z.object({
  target: z.enum(["ALL", "MATERIALS", "ARTICLES", "MATERIAL", "ARTICLE_FAMILY"]),
  targetId: z.string().optional(),
  operation: z.enum(["INCREASE_COST_PCT", "DECREASE_COST_PCT", "SET_MARGIN_PCT", "INCREASE_MARGIN_PCT"]),
  value: z.number().min(0),
  preview: z.boolean().optional(),
});

function isCatalogAdmin(role: string | undefined): boolean {
  return role === "COMPANY_ADMIN" || role === "SUPER_ADMIN";
}

function isFkViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23503";
}

// ============ MATERIALI ============

catalogRouter.get("/materials", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getMaterials();
    res.json(items);
  } catch (error) {
    console.error("Error fetching materials:", error);
    res.status(500).json({ message: "Errore nel recupero dei materiali" });
  }
});

catalogRouter.post("/materials", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare materiali" });
    }
    const parsed = insertMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const created = await storage.createMaterial(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating material:", error);
    res.status(500).json({ message: "Errore nella creazione del materiale" });
  }
});

catalogRouter.put("/materials/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare materiali" });
    }
    const parsed = updateMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.updateMaterial(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Materiale non trovato" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating material:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento del materiale" });
  }
});

catalogRouter.delete("/materials/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare materiali" });
    }
    const deleted = await storage.deleteMaterial(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Materiale non trovato" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting material:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: il materiale è referenziato da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione del materiale" });
  }
});

// ============ SPESSORI / VARIANTI MATERIALI ============

catalogRouter.post("/material-thicknesses", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare spessori" });
    }
    const parsed = insertMaterialThicknessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const material = await storage.getMaterial(parsed.data.materialId);
    if (!material) {
      return res.status(400).json({ message: "Materiale non trovato" });
    }
    // Validate: costPerKg and marginPercent required only for PER_VARIANT materials
    if (material.priceMode === "PER_VARIANT") {
      const cost = parsed.data.costPerKg;
      const margin = parsed.data.marginPercent;
      if (cost === undefined || cost === null || cost === "" ||
          margin === undefined || margin === null || margin === "") {
        return res.status(400).json({
          message: "Per materiali con prezzo per variante, costo al kg e margine sono obbligatori",
        });
      }
    }
    const created = await storage.createMaterialThickness(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating material thickness:", error);
    res.status(500).json({ message: "Errore nella creazione dello spessore" });
  }
});

catalogRouter.put("/material-thicknesses/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare spessori" });
    }
    const parsed = updateMaterialThicknessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    // Look up existing thickness to determine its materialId
    const existingThickness = await storage.getMaterialThickness(req.params.id);
    if (!existingThickness) {
      return res.status(404).json({ message: "Spessore non trovato" });
    }
    const materialId = parsed.data.materialId ?? existingThickness.materialId;
    const material = await storage.getMaterial(materialId);
    if (!material) {
      return res.status(400).json({ message: "Materiale non trovato" });
    }
    // Validate: costPerKg and marginPercent required only for PER_VARIANT materials
    if (material.priceMode === "PER_VARIANT") {
      const cost = parsed.data.costPerKg ?? existingThickness.costPerKg;
      const margin = parsed.data.marginPercent ?? existingThickness.marginPercent;
      if (cost === undefined || cost === null || cost === "" ||
          margin === undefined || margin === null || margin === "") {
        return res.status(400).json({
          message: "Per materiali con prezzo per variante, costo al kg e margine sono obbligatori",
        });
      }
    }
    const updated = await storage.updateMaterialThickness(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Spessore non trovato" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating material thickness:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dello spessore" });
  }
});

catalogRouter.delete("/material-thicknesses/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare spessori" });
    }
    const deleted = await storage.deleteMaterialThickness(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Spessore non trovato" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting material thickness:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: lo spessore è referenziato da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione dello spessore" });
  }
});

// ============ FAMIGLIE ARTICOLI ============

catalogRouter.get("/article-families", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getArticleFamilies();
    res.json(items);
  } catch (error) {
    console.error("Error fetching article families:", error);
    res.status(500).json({ message: "Errore nel recupero delle famiglie articoli" });
  }
});

catalogRouter.post("/article-families", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare famiglie articoli" });
    }
    const parsed = insertArticleFamilySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const created = await storage.createArticleFamily(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating article family:", error);
    res.status(500).json({ message: "Errore nella creazione della famiglia articoli" });
  }
});

catalogRouter.put("/article-families/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare famiglie articoli" });
    }
    const parsed = updateArticleFamilySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.updateArticleFamily(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Famiglia non trovata" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating article family:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento della famiglia articoli" });
  }
});

catalogRouter.delete("/article-families/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare famiglie articoli" });
    }
    const deleted = await storage.deleteArticleFamily(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Famiglia non trovata" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting article family:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: la famiglia è referenziata da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione della famiglia articoli" });
  }
});

// POST /api/article-families/:id/variants — aggiunge variante a famiglia
catalogRouter.post("/article-families/:id/variants", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono aggiungere varianti" });
    }
    const family = await storage.getArticleFamily(req.params.id);
    if (!family) {
      return res.status(404).json({ message: "Famiglia non trovata" });
    }
    const body = { ...req.body, familyId: req.params.id, unitOfMeasure: req.body.unitOfMeasure || family.unitOfMeasure };
    const parsed = insertCatalogArticleSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const created = await storage.createCatalogArticle(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating article variant:", error);
    res.status(500).json({ message: "Errore nella creazione della variante" });
  }
});

// ============ ARTICOLI (varianti di famiglie) ============

catalogRouter.get("/catalog-articles", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getCatalogArticles();
    res.json(items);
  } catch (error) {
    console.error("Error fetching catalog articles:", error);
    res.status(500).json({ message: "Errore nel recupero degli articoli" });
  }
});

catalogRouter.put("/catalog-articles/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare articoli" });
    }
    const parsed = updateCatalogArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.updateCatalogArticle(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Articolo non trovato" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating catalog article:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento dell'articolo" });
  }
});

catalogRouter.delete("/catalog-articles/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare articoli" });
    }
    const deleted = await storage.deleteCatalogArticle(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Articolo non trovato" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting catalog article:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: l'articolo è referenziato da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione dell'articolo" });
  }
});

// ============ AGGIORNAMENTO PREZZI MASSIVO ============

catalogRouter.post("/catalog/bulk-update", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono aggiornare i prezzi" });
    }
    const parsed = bulkUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.bulkUpdateCatalog(parsed.data);
    res.json({ updated });
  } catch (error) {
    console.error("Error bulk updating catalog:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento massivo dei prezzi" });
  }
});

// ============ MANODOPERA / GIORNATE ============

catalogRouter.get("/labor-rates", isAuthenticated, async (_req, res) => {
  try {
    const items = await storage.getLaborRates();
    res.json(items);
  } catch (error) {
    console.error("Error fetching labor rates:", error);
    res.status(500).json({ message: "Errore nel recupero della manodopera" });
  }
});

catalogRouter.post("/labor-rates", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono creare voci di manodopera" });
    }
    const parsed = insertLaborRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const created = await storage.createLaborRate(parsed.data);
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating labor rate:", error);
    res.status(500).json({ message: "Errore nella creazione della voce di manodopera" });
  }
});

catalogRouter.put("/labor-rates/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono modificare voci di manodopera" });
    }
    const parsed = updateLaborRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dati non validi",
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const updated = await storage.updateLaborRate(req.params.id, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "Voce di manodopera non trovata" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating labor rate:", error);
    res.status(500).json({ message: "Errore nell'aggiornamento della voce di manodopera" });
  }
});

catalogRouter.delete("/labor-rates/:id", isAuthenticated, async (req, res) => {
  try {
    const { role } = req.user!;
    if (!isCatalogAdmin(role)) {
      return res.status(403).json({ message: "Solo gli amministratori possono eliminare voci di manodopera" });
    }
    const deleted = await storage.deleteLaborRate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Voce di manodopera non trovata" });
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error("Error deleting labor rate:", error);
    if (isFkViolation(error)) {
      return res.status(409).json({
        message: "Impossibile eliminare: la voce di manodopera è referenziata da altri elementi",
      });
    }
    res.status(500).json({ message: "Errore nell'eliminazione della voce di manodopera" });
  }
});
