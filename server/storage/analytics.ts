import {
  opportunities, salesTargets, warehouseBalances,
  type SalesTarget, type InsertSalesTarget,
  type WarehouseBalance,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, gte, lte, isNull, isNotNull } from "drizzle-orm";

export const analyticsStorage = {
  async getWonByMonth(
    companyId: string,
    currentYear: number,
    sellerUserId?: string
  ): Promise<{ currentYear: number[]; lastYear: number[]; twoYearsAgo: number[] }> {
    const years = [currentYear, currentYear - 1, currentYear - 2];
    const results: Record<string, number[]> = {
      currentYear: Array(12).fill(0),
      lastYear: Array(12).fill(0),
      twoYearsAgo: Array(12).fill(0),
    };
    const yearKeys = ["currentYear", "lastYear", "twoYearsAgo"];

    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

      const conditions = [
        eq(opportunities.companyId, companyId),
        isNotNull(opportunities.wonAt),
        gte(opportunities.wonAt, startDate),
        lte(opportunities.wonAt, endDate),
      ];

      if (sellerUserId) {
        conditions.push(eq(opportunities.assignedToUserId, sellerUserId));
      }

      const opps = await db
        .select({ wonAt: opportunities.wonAt, value: opportunities.value })
        .from(opportunities)
        .where(and(...conditions));

      for (const opp of opps) {
        if (!opp.wonAt) continue;
        const month = new Date(opp.wonAt).getMonth();
        results[yearKeys[i]][month] += parseFloat(opp.value ?? "0") || 0;
      }
    }

    return results as { currentYear: number[]; lastYear: number[]; twoYearsAgo: number[] };
  },

  // ============ Sales Targets ============

  async getSalesTargets(companyId: string, month: number, year: number): Promise<SalesTarget[]> {
    return db.select().from(salesTargets)
      .where(and(eq(salesTargets.companyId, companyId), eq(salesTargets.month, month), eq(salesTargets.year, year)));
  },

  async getSalesTargetsForRange(companyId: string, startDate: Date, endDate: Date): Promise<SalesTarget[]> {
    const monthKeys: { year: number; month: number }[] = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const rangeEnd = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cursor <= rangeEnd) {
      monthKeys.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (monthKeys.length === 0) return [];

    const results: SalesTarget[] = [];
    for (const { year, month } of monthKeys) {
      const rows = await db.select().from(salesTargets)
        .where(and(eq(salesTargets.companyId, companyId), eq(salesTargets.month, month), eq(salesTargets.year, year)));
      results.push(...rows);
    }
    return results;
  },

  async getSalesTarget(companyId: string, userId: string, month: number, year: number): Promise<SalesTarget | undefined> {
    const [target] = await db.select().from(salesTargets)
      .where(and(
        eq(salesTargets.companyId, companyId),
        eq(salesTargets.userId, userId),
        eq(salesTargets.month, month),
        eq(salesTargets.year, year)
      ));
    return target || undefined;
  },

  async upsertSalesTarget(data: InsertSalesTarget): Promise<SalesTarget> {
    const existing = await analyticsStorage.getSalesTarget(data.companyId, data.userId, data.month, data.year);
    if (existing) {
      const [updated] = await db.update(salesTargets)
        .set({ quoteTarget: data.quoteTarget, wonTarget: data.wonTarget, updatedAt: new Date() })
        .where(eq(salesTargets.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(salesTargets).values(data).returning();
      return created;
    }
  },

  // ============ Warehouse Balances ============

  async getWarehouseBalances(companyId: string): Promise<WarehouseBalance[]> {
    return db.select().from(warehouseBalances).where(eq(warehouseBalances.companyId, companyId));
  },

  async upsertWarehouseBalance(companyId: string, warehouseType: "VILLA" | "PL" | "EP", date: Date | null, value: number): Promise<WarehouseBalance> {
    const existing = await db.select().from(warehouseBalances).where(
      and(
        eq(warehouseBalances.companyId, companyId),
        eq(warehouseBalances.warehouseType, warehouseType),
        date === null ? isNull(warehouseBalances.date) : eq(warehouseBalances.date, date)
      )
    );
    if (existing.length > 0) {
      const [updated] = await db.update(warehouseBalances)
        .set({ value: value.toString() })
        .where(eq(warehouseBalances.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(warehouseBalances)
        .values({ companyId, warehouseType, date, value: value.toString() })
        .returning();
      return created;
    }
  },

  async deleteWarehouseBalance(companyId: string, warehouseType: "VILLA" | "PL" | "EP", date: Date | null): Promise<void> {
    await db.delete(warehouseBalances).where(
      and(
        eq(warehouseBalances.companyId, companyId),
        eq(warehouseBalances.warehouseType, warehouseType),
        date === null ? isNull(warehouseBalances.date) : eq(warehouseBalances.date, date)
      )
    );
  },
};
