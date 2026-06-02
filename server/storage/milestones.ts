import {
  opportunityMilestones, opportunities,
  type OpportunityMilestone, type InsertOpportunityMilestone,
} from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";

export const milestonesStorage = {
  async getMilestonesByOpportunity(opportunityId: string): Promise<OpportunityMilestone[]> {
    return db
      .select()
      .from(opportunityMilestones)
      .where(eq(opportunityMilestones.opportunityId, opportunityId))
      .orderBy(opportunityMilestones.invoiceDate);
  },

  async getMilestone(id: string): Promise<OpportunityMilestone | undefined> {
    const [m] = await db
      .select()
      .from(opportunityMilestones)
      .where(eq(opportunityMilestones.id, id));
    return m || undefined;
  },

  async createMilestone(data: InsertOpportunityMilestone): Promise<OpportunityMilestone> {
    const [m] = await db.insert(opportunityMilestones).values(data as any).returning();
    await milestonesStorage.recalcInvoicedAmount(m.opportunityId);
    return m;
  },

  async updateMilestone(
    id: string,
    data: Partial<InsertOpportunityMilestone>,
  ): Promise<OpportunityMilestone | undefined> {
    const [m] = await db
      .update(opportunityMilestones)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(opportunityMilestones.id, id))
      .returning();
    if (m) {
      await milestonesStorage.recalcInvoicedAmount(m.opportunityId);
    }
    return m || undefined;
  },

  async deleteMilestone(id: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(opportunityMilestones)
      .where(eq(opportunityMilestones.id, id));
    if (!existing) return false;
    await db.delete(opportunityMilestones).where(eq(opportunityMilestones.id, id));
    await milestonesStorage.recalcInvoicedAmount(existing.opportunityId);
    return true;
  },

  // Ricalcola invoicedAmount sull'opportunità sommando milestone in stato invoiced o paid.
  async recalcInvoicedAmount(opportunityId: string): Promise<string> {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total
      FROM opportunity_milestones
      WHERE opportunity_id = ${opportunityId}
        AND status IN ('invoiced', 'paid')
    `);
    const total = String(result.rows[0]?.total ?? "0");
    await db
      .update(opportunities)
      .set({ invoicedAmount: total, updatedAt: new Date() })
      .where(eq(opportunities.id, opportunityId));
    return total;
  },
};
