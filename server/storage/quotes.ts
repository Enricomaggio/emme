import {
  quotes, quoteItems,
  type Quote, type InsertQuote,
  type QuoteItem, type InsertQuoteItem,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { applyDiscountOrOverride, round2 } from "../utils/quoteCalc";

export const quotesStorage = {
  async getQuotesByOpportunity(opportunityId: string, companyId: string): Promise<Quote[]> {
    return db.select().from(quotes)
      .where(and(eq(quotes.opportunityId, opportunityId), eq(quotes.companyId, companyId)))
      .orderBy(desc(quotes.createdAt));
  },

  async getQuote(id: string, companyId: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)));
    return quote || undefined;
  },

  async getQuoteNumbersByCompany(companyId: string): Promise<string[]> {
    const rows = await db.select({ number: quotes.number }).from(quotes)
      .where(eq(quotes.companyId, companyId));
    return rows.map((r) => r.number).filter((n): n is string => Boolean(n));
  },

  async createQuote(data: InsertQuote): Promise<Quote> {
    const [quote] = await db.insert(quotes).values(data).returning();
    return quote;
  },

  /**
   * Crea un preventivo con numero auto-generato in modo atomico e sicuro contro race condition.
   * Calcola il prossimo numero disponibile e inserisce il preventivo nella stessa transazione
   * con un advisory lock per-company, garantendo unicità anche con richieste concorrenti.
   * Se viene passato un customNumber, lo usa direttamente (la validazione avviene nel route).
   */
  async createQuoteWithNextNumber(data: Omit<InsertQuote, 'number'>, customNumber?: string): Promise<Quote> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.companyId}))`);

      let quoteNumber: string;
      if (customNumber) {
        quoteNumber = customNumber;
      } else {
        const year = new Date().getFullYear();
        const allQuotes = await tx.execute(
          sql`SELECT number FROM quotes WHERE company_id = ${data.companyId}`
        );
        let maxNum = 299;
        for (const q of allQuotes.rows as Array<{ number: string }>) {
          if (!q.number) continue;
          if (!q.number.endsWith(`-${year}`) && !q.number.startsWith(`PREV-${year}`)) continue;
          const match = q.number.match(/^(?:PREV-\d{4}-)?(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
        quoteNumber = `${String(maxNum + 1).padStart(3, '0')}-${year}`;
      }
      const [quote] = await tx.insert(quotes).values({ ...data, number: quoteNumber }).returning();
      return quote;
    });
  },

  async updateQuote(id: string, companyId: string, data: Partial<InsertQuote>): Promise<Quote | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [quote] = await db.update(quotes).set(updateData)
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))
      .returning();
    return quote || undefined;
  },

  async deleteQuote(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  async getQuotesByOpportunityIds(opportunityIds: string[], companyId: string): Promise<Quote[]> {
    if (opportunityIds.length === 0) return [];
    return db.select().from(quotes)
      .where(and(inArray(quotes.opportunityId, opportunityIds), eq(quotes.companyId, companyId)))
      .orderBy(desc(quotes.createdAt));
  },

  // ============ Quote Items ============

  async getQuoteItems(quoteId: string): Promise<QuoteItem[]> {
    return db.select().from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId))
      .orderBy(quoteItems.displayOrder, quoteItems.phase);
  },

  async getQuoteItem(id: string, quoteId: string): Promise<QuoteItem | undefined> {
    const [item] = await db.select().from(quoteItems)
      .where(and(eq(quoteItems.id, id), eq(quoteItems.quoteId, quoteId)));
    return item || undefined;
  },

  async createQuoteItem(data: InsertQuoteItem): Promise<QuoteItem> {
    const [item] = await db.insert(quoteItems).values(data).returning();
    return item;
  },

  async createQuoteItems(data: InsertQuoteItem[]): Promise<QuoteItem[]> {
    if (data.length === 0) return [];
    return db.insert(quoteItems).values(data).returning();
  },

  async updateQuoteItem(
    id: string,
    quoteId: string,
    data: { unitPriceApplied?: string; quantity?: string; totalRow?: string; baseTotal?: string }
  ): Promise<QuoteItem | undefined> {
    const { baseTotal, ...rest } = data;

    if (baseTotal !== undefined) {
      const existing = await quotesStorage.getQuoteItem(id, quoteId);
      if (!existing) return undefined;

      const newBase = parseFloat(baseTotal);
      const existingDiscount = existing.discountPercent != null ? parseFloat(existing.discountPercent) : 0;
      const existingOverride = existing.overrideTotal != null ? parseFloat(existing.overrideTotal) : null;

      const { totalRow, discountPercent, overrideTotal } = applyDiscountOrOverride(
        newBase,
        existingDiscount,
        existingOverride,
      );

      const [item] = await db.update(quoteItems)
        .set({
          ...rest,
          baseTotal: String(round2(newBase)),
          totalRow: String(round2(totalRow)),
          discountPercent: String(round2(discountPercent)),
          overrideTotal: overrideTotal != null ? String(round2(overrideTotal)) : null,
        })
        .where(and(eq(quoteItems.id, id), eq(quoteItems.quoteId, quoteId)))
        .returning();
      return item || undefined;
    }

    const [item] = await db.update(quoteItems).set(rest)
      .where(and(eq(quoteItems.id, id), eq(quoteItems.quoteId, quoteId)))
      .returning();
    return item || undefined;
  },

  async deleteQuoteItems(quoteId: string): Promise<boolean> {
    const result = await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    return (result.rowCount ?? 0) >= 0;
  },

  async updateQuoteItemWorkOrderQuantity(
    id: string,
    companyId: string,
    quantity: number | null
  ): Promise<QuoteItem | undefined> {
    // Verifica che la riga appartenga all'azienda tramite il preventivo
    const [item] = await db.select().from(quoteItems)
      .innerJoin(quotes, and(eq(quoteItems.quoteId, quotes.id), eq(quotes.companyId, companyId)))
      .where(eq(quoteItems.id, id));
    if (!item) return undefined;

    const [updated] = await db.update(quoteItems)
      .set({ workOrderQuantityOverride: quantity !== null ? String(quantity) : null })
      .where(eq(quoteItems.id, id))
      .returning();
    return updated || undefined;
  },
};
