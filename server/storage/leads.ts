import {
  leads, opportunities,
  type Lead, type InsertLead,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, inArray } from "drizzle-orm";

export const leadsStorage = {
  async getLeads(): Promise<Lead[]> {
    return db.select().from(leads).orderBy(desc(leads.createdAt));
  },

  async getLead(id: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead || undefined;
  },

  async getLeadsByIds(ids: string[]): Promise<Lead[]> {
    if (ids.length === 0) return [];
    return db.select().from(leads).where(inArray(leads.id, ids));
  },

  async createLead(data: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(data as any).returning();
    return lead;
  },

  async updateLead(id: string, data: Partial<InsertLead>): Promise<Lead | undefined> {
    const [lead] = await db
      .update(leads)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(leads.id, id))
      .returning();
    return lead || undefined;
  },

  async deleteLead(id: string): Promise<boolean> {
    // Le opportunità (e a cascata milestones/reminders) si eliminano via ON DELETE CASCADE
    const result = await db.delete(leads).where(eq(leads.id, id)).returning();
    return result.length > 0;
  },

  async getOpportunitiesByLeadIds(
    leadIds: string[],
  ): Promise<Array<{ leadId: string; stageId: string | null }>> {
    if (leadIds.length === 0) return [];
    return db
      .select({ leadId: opportunities.leadId, stageId: opportunities.stageId })
      .from(opportunities)
      .where(inArray(opportunities.leadId, leadIds));
  },
};
