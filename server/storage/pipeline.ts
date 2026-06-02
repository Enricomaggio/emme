import {
  pipelineStages, opportunities,
  type PipelineStage,
  type Opportunity, type InsertOpportunity,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, inArray } from "drizzle-orm";

export const pipelineStorage = {
  // ============ Pipeline Stages ============

  async getStages(): Promise<PipelineStage[]> {
    return db.select().from(pipelineStages).orderBy(pipelineStages.order);
  },

  async getStage(id: string): Promise<PipelineStage | undefined> {
    const [stage] = await db.select().from(pipelineStages).where(eq(pipelineStages.id, id));
    return stage || undefined;
  },

  async getStageByName(name: string): Promise<PipelineStage | undefined> {
    const [stage] = await db.select().from(pipelineStages).where(eq(pipelineStages.name, name));
    return stage || undefined;
  },

  // ============ Opportunities ============

  async getOpportunities(): Promise<Opportunity[]> {
    return db.select().from(opportunities).orderBy(desc(opportunities.createdAt));
  },

  async getOpportunitiesByLead(leadId: string): Promise<Opportunity[]> {
    return db
      .select()
      .from(opportunities)
      .where(eq(opportunities.leadId, leadId))
      .orderBy(desc(opportunities.createdAt));
  },

  async getOpportunity(id: string): Promise<Opportunity | undefined> {
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    return opp || undefined;
  },

  async createOpportunity(data: InsertOpportunity): Promise<Opportunity> {
    const [opp] = await db.insert(opportunities).values(data as any).returning();
    return opp;
  },

  async updateOpportunity(
    id: string,
    data: Partial<InsertOpportunity> & {
      wonAt?: Date | null;
      lostAt?: Date | null;
      invoicedAmount?: string;
    },
  ): Promise<Opportunity | undefined> {
    const [opp] = await db
      .update(opportunities)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(opportunities.id, id))
      .returning();
    return opp || undefined;
  },

  async deleteOpportunity(id: string): Promise<boolean> {
    // Milestones e reminders si eliminano via ON DELETE CASCADE
    const result = await db.delete(opportunities).where(eq(opportunities.id, id)).returning();
    return result.length > 0;
  },

  async moveOpportunityToStage(opportunityId: string, stageId: string): Promise<Opportunity | undefined> {
    const stage = await pipelineStorage.getStage(stageId);
    if (!stage) return undefined;

    const now = new Date();
    const updateFields: Record<string, unknown> = { stageId, updatedAt: now };

    // Mappa stadio → timestamp esito
    if (stage.name === "Completato") {
      updateFields.wonAt = now;
      updateFields.lostAt = null;
    } else {
      // Stadio non terminale: lasciamo wonAt/lostAt invariati
    }

    const [opp] = await db
      .update(opportunities)
      .set(updateFields)
      .where(eq(opportunities.id, opportunityId))
      .returning();
    return opp || undefined;
  },

  async getOpportunitiesByIds(ids: string[]): Promise<Opportunity[]> {
    if (ids.length === 0) return [];
    return db.select().from(opportunities).where(inArray(opportunities.id, ids));
  },
};
