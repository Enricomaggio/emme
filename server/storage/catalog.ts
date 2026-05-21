import {
  materials, materialThicknesses, materialFinishes, articleFamilies, catalogArticles, laborRates,
  type Material, type InsertMaterial, type MaterialWithThicknesses,
  type MaterialThickness, type InsertMaterialThickness,
  type MaterialFinish, type InsertMaterialFinish,
  type ArticleFamily, type InsertArticleFamily, type ArticleFamilyWithVariants,
  type CatalogArticle, type InsertCatalogArticle,
  type LaborRate, type InsertLaborRate,
} from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import type { BulkUpdateParams } from "./types";

export const catalogStorage = {
  // ============ Materials ============

  async getMaterials(): Promise<MaterialWithThicknesses[]> {
    return db.query.materials.findMany({
      with: {
        thicknesses: {
          orderBy: (t, { asc }) => [asc(t.thicknessMm)],
          with: {
            finishes: {
              orderBy: (f, { asc }) => [asc(f.sortOrder), asc(f.createdAt)],
            },
          },
        },
      },
      orderBy: (m, { asc }) => [asc(m.name)],
    }) as Promise<MaterialWithThicknesses[]>;
  },

  async getMaterial(id: string): Promise<Material | undefined> {
    const [m] = await db.select().from(materials).where(eq(materials.id, id));
    return m || undefined;
  },

  async createMaterial(data: InsertMaterial): Promise<Material> {
    const [m] = await db.insert(materials).values(data).returning();
    return m;
  },

  async updateMaterial(id: string, data: Partial<InsertMaterial>): Promise<Material | undefined> {
    const [m] = await db.update(materials).set({ ...data, updatedAt: new Date() })
      .where(eq(materials.id, id))
      .returning();
    return m || undefined;
  },

  async deleteMaterial(id: string): Promise<boolean> {
    const result = await db.delete(materials).where(eq(materials.id, id)).returning();
    return result.length > 0;
  },

  // ============ Material Thicknesses ============

  async getMaterialThickness(id: string): Promise<MaterialThickness | undefined> {
    const [t] = await db.select().from(materialThicknesses).where(eq(materialThicknesses.id, id));
    return t || undefined;
  },

  async createMaterialThickness(data: InsertMaterialThickness): Promise<MaterialThickness> {
    const [t] = await db.insert(materialThicknesses).values(data).returning();
    return t;
  },

  async updateMaterialThickness(id: string, data: Partial<InsertMaterialThickness>): Promise<MaterialThickness | undefined> {
    const [t] = await db.update(materialThicknesses).set({ ...data, updatedAt: new Date() })
      .where(eq(materialThicknesses.id, id))
      .returning();
    return t || undefined;
  },

  async deleteMaterialThickness(id: string): Promise<boolean> {
    const result = await db.delete(materialThicknesses).where(eq(materialThicknesses.id, id)).returning();
    return result.length > 0;
  },

  // ============ Material Finishes ============

  async getMaterialFinish(id: string): Promise<MaterialFinish | undefined> {
    const [f] = await db.select().from(materialFinishes).where(eq(materialFinishes.id, id));
    return f || undefined;
  },

  async createMaterialFinish(data: InsertMaterialFinish): Promise<MaterialFinish> {
    const [f] = await db.insert(materialFinishes).values(data).returning();
    return f;
  },

  async updateMaterialFinish(id: string, data: Partial<InsertMaterialFinish>): Promise<MaterialFinish | undefined> {
    const [f] = await db.update(materialFinishes).set(data)
      .where(eq(materialFinishes.id, id))
      .returning();
    return f || undefined;
  },

  async deleteMaterialFinish(id: string): Promise<boolean> {
    const result = await db.delete(materialFinishes).where(eq(materialFinishes.id, id)).returning();
    return result.length > 0;
  },

  // ============ Article Families ============

  async getArticleFamilies(): Promise<ArticleFamilyWithVariants[]> {
    return db.query.articleFamilies.findMany({
      with: {
        variants: {
          orderBy: (v, { asc }) => [asc(v.name)],
        },
      },
      orderBy: (f, { asc }) => [asc(f.name)],
    }) as Promise<ArticleFamilyWithVariants[]>;
  },

  async getArticleFamily(id: string): Promise<ArticleFamily | undefined> {
    const [f] = await db.select().from(articleFamilies).where(eq(articleFamilies.id, id));
    return f || undefined;
  },

  async createArticleFamily(data: InsertArticleFamily): Promise<ArticleFamily> {
    const [f] = await db.insert(articleFamilies).values(data).returning();
    return f;
  },

  async updateArticleFamily(id: string, data: Partial<InsertArticleFamily>): Promise<ArticleFamily | undefined> {
    const [f] = await db.update(articleFamilies).set({ ...data, updatedAt: new Date() })
      .where(eq(articleFamilies.id, id))
      .returning();
    return f || undefined;
  },

  async deleteArticleFamily(id: string): Promise<boolean> {
    const result = await db.delete(articleFamilies).where(eq(articleFamilies.id, id)).returning();
    return result.length > 0;
  },

  // ============ Catalog Articles ============

  async getCatalogArticles(): Promise<CatalogArticle[]> {
    return db.select().from(catalogArticles).orderBy(catalogArticles.name);
  },

  async getCatalogArticle(id: string): Promise<CatalogArticle | undefined> {
    const [a] = await db.select().from(catalogArticles).where(eq(catalogArticles.id, id));
    return a || undefined;
  },

  async createCatalogArticle(data: InsertCatalogArticle): Promise<CatalogArticle> {
    const [a] = await db.insert(catalogArticles).values(data).returning();
    return a;
  },

  async updateCatalogArticle(id: string, data: Partial<InsertCatalogArticle>): Promise<CatalogArticle | undefined> {
    const [a] = await db.update(catalogArticles).set({ ...data, updatedAt: new Date() })
      .where(eq(catalogArticles.id, id))
      .returning();
    return a || undefined;
  },

  async deleteCatalogArticle(id: string): Promise<boolean> {
    const result = await db.delete(catalogArticles).where(eq(catalogArticles.id, id)).returning();
    return result.length > 0;
  },

  // ============ Bulk Update ============

  async bulkUpdateCatalog(params: BulkUpdateParams): Promise<number> {
    const { target, targetId, operation, value, preview } = params;
    let count = 0;
    const factor = value / 100;

    if (preview) {
      if (target === "ALL" || target === "MATERIALS") {
        const mats = await db.select().from(materials);
        for (const m of mats) {
          if (m.priceMode === "SINGLE") count++;
          else {
            const ths = await db.select().from(materialThicknesses).where(eq(materialThicknesses.materialId, m.id));
            count += ths.length;
          }
        }
      }
      if (target === "MATERIAL" && targetId) {
        const m = await catalogStorage.getMaterial(targetId);
        if (m) {
          if (m.priceMode === "SINGLE") count++;
          else {
            const ths = await db.select().from(materialThicknesses).where(eq(materialThicknesses.materialId, targetId));
            count += ths.length;
          }
        }
      }
      if (target === "ALL" || target === "ARTICLES") {
        const arts = await db.select().from(catalogArticles);
        count += arts.length;
      }
      if (target === "ARTICLE_FAMILY" && targetId) {
        const variants = await db.select().from(catalogArticles).where(eq(catalogArticles.familyId, targetId));
        count += variants.length;
      }
      return count;
    }

    if (target === "ALL" || target === "MATERIALS" || target === "MATERIAL") {
      const mats = target === "MATERIAL" && targetId
        ? await db.select().from(materials).where(eq(materials.id, targetId))
        : await db.select().from(materials);

      for (const m of mats) {
        if (m.priceMode === "SINGLE") {
          if (operation === "INCREASE_COST_PCT") {
            await db.update(materials).set({ singleCostPerKg: sql`${materials.singleCostPerKg} * ${1 + factor}`, updatedAt: new Date() }).where(eq(materials.id, m.id));
          } else if (operation === "DECREASE_COST_PCT") {
            await db.update(materials).set({ singleCostPerKg: sql`${materials.singleCostPerKg} * ${1 - factor}`, updatedAt: new Date() }).where(eq(materials.id, m.id));
          } else if (operation === "SET_MARGIN_PCT") {
            await db.update(materials).set({ singleMarginPercent: String(value), updatedAt: new Date() }).where(eq(materials.id, m.id));
          } else if (operation === "INCREASE_MARGIN_PCT") {
            await db.update(materials).set({ singleMarginPercent: sql`${materials.singleMarginPercent} + ${value}`, updatedAt: new Date() }).where(eq(materials.id, m.id));
          }
          count++;
        } else {
          if (operation === "INCREASE_COST_PCT") {
            const res = await db.update(materialThicknesses).set({ costPerKg: sql`${materialThicknesses.costPerKg} * ${1 + factor}`, updatedAt: new Date() }).where(eq(materialThicknesses.materialId, m.id)).returning();
            count += res.length;
          } else if (operation === "DECREASE_COST_PCT") {
            const res = await db.update(materialThicknesses).set({ costPerKg: sql`${materialThicknesses.costPerKg} * ${1 - factor}`, updatedAt: new Date() }).where(eq(materialThicknesses.materialId, m.id)).returning();
            count += res.length;
          } else if (operation === "SET_MARGIN_PCT") {
            const res = await db.update(materialThicknesses).set({ marginPercent: String(value), updatedAt: new Date() }).where(eq(materialThicknesses.materialId, m.id)).returning();
            count += res.length;
          } else if (operation === "INCREASE_MARGIN_PCT") {
            const res = await db.update(materialThicknesses).set({ marginPercent: sql`${materialThicknesses.marginPercent} + ${value}`, updatedAt: new Date() }).where(eq(materialThicknesses.materialId, m.id)).returning();
            count += res.length;
          }
        }
      }
    }

    if (target === "ALL" || target === "ARTICLES") {
      if (operation === "INCREASE_COST_PCT") {
        const res = await db.update(catalogArticles).set({ unitCost: sql`${catalogArticles.unitCost} * ${1 + factor}`, updatedAt: new Date() }).returning();
        count += res.length;
      } else if (operation === "DECREASE_COST_PCT") {
        const res = await db.update(catalogArticles).set({ unitCost: sql`${catalogArticles.unitCost} * ${1 - factor}`, updatedAt: new Date() }).returning();
        count += res.length;
      } else if (operation === "SET_MARGIN_PCT") {
        const res = await db.update(catalogArticles).set({ marginPercent: String(value), updatedAt: new Date() }).returning();
        count += res.length;
      } else if (operation === "INCREASE_MARGIN_PCT") {
        const res = await db.update(catalogArticles).set({ marginPercent: sql`${catalogArticles.marginPercent} + ${value}`, updatedAt: new Date() }).returning();
        count += res.length;
      }
    }

    if (target === "ARTICLE_FAMILY" && targetId) {
      const whereClause = eq(catalogArticles.familyId, targetId);
      if (operation === "INCREASE_COST_PCT") {
        const res = await db.update(catalogArticles).set({ unitCost: sql`${catalogArticles.unitCost} * ${1 + factor}`, updatedAt: new Date() }).where(whereClause).returning();
        count += res.length;
      } else if (operation === "DECREASE_COST_PCT") {
        const res = await db.update(catalogArticles).set({ unitCost: sql`${catalogArticles.unitCost} * ${1 - factor}`, updatedAt: new Date() }).where(whereClause).returning();
        count += res.length;
      } else if (operation === "SET_MARGIN_PCT") {
        const res = await db.update(catalogArticles).set({ marginPercent: String(value), updatedAt: new Date() }).where(whereClause).returning();
        count += res.length;
      } else if (operation === "INCREASE_MARGIN_PCT") {
        const res = await db.update(catalogArticles).set({ marginPercent: sql`${catalogArticles.marginPercent} + ${value}`, updatedAt: new Date() }).where(whereClause).returning();
        count += res.length;
      }
    }

    return count;
  },

  // ============ Labor Rates ============

  async getLaborRates(): Promise<LaborRate[]> {
    return db.select().from(laborRates).orderBy(laborRates.name);
  },

  async getLaborRate(id: string): Promise<LaborRate | undefined> {
    const [l] = await db.select().from(laborRates).where(eq(laborRates.id, id));
    return l || undefined;
  },

  async createLaborRate(data: InsertLaborRate): Promise<LaborRate> {
    const [l] = await db.insert(laborRates).values(data).returning();
    return l;
  },

  async updateLaborRate(id: string, data: Partial<InsertLaborRate>): Promise<LaborRate | undefined> {
    const [l] = await db.update(laborRates).set({ ...data, updatedAt: new Date() })
      .where(eq(laborRates.id, id))
      .returning();
    return l || undefined;
  },

  async deleteLaborRate(id: string): Promise<boolean> {
    const result = await db.delete(laborRates).where(eq(laborRates.id, id)).returning();
    return result.length > 0;
  },
};
