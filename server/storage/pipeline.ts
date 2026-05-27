import {
  pipelineStages, opportunities, activityLogs, users,
  quotes, quoteItems, reminders,
  type PipelineStage, type InsertPipelineStage,
  type Opportunity, type InsertOpportunity,
  type ActivityLog, type InsertActivityLog,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, isNull, gte, lte, inArray } from "drizzle-orm";
import type { AccessContext } from "./types";

export const pipelineStorage = {
  // ============ Pipeline Stages ============

  async getStagesByCompany(companyId: string): Promise<PipelineStage[]> {
    return db.select().from(pipelineStages)
      .where(eq(pipelineStages.companyId, companyId))
      .orderBy(pipelineStages.order);
  },

  async getStage(id: string, companyId: string): Promise<PipelineStage | undefined> {
    const [stage] = await db.select().from(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.companyId, companyId)));
    return stage || undefined;
  },

  async createStage(data: InsertPipelineStage): Promise<PipelineStage> {
    const [stage] = await db.insert(pipelineStages).values(data).returning();
    return stage;
  },

  async updateStage(id: string, companyId: string, data: Partial<{ name: string; order: number; color: string }>): Promise<PipelineStage | undefined> {
    const [stage] = await db.update(pipelineStages).set(data)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.companyId, companyId)))
      .returning();
    return stage || undefined;
  },

  async deleteStage(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.companyId, companyId)))
      .returning();
    return result.length > 0;
  },

  async reorderStages(companyId: string, stageIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < stageIds.length; i++) {
        await tx.update(pipelineStages).set({ order: i + 1 })
          .where(and(eq(pipelineStages.id, stageIds[i]), eq(pipelineStages.companyId, companyId)));
      }
    });
  },

  // ============ Opportunities ============

  async getOpportunitiesWithAccess(ctx: AccessContext): Promise<Opportunity[]> {
    const { userId, role, companyId } = ctx;

    if (role === "SUPER_ADMIN") {
      return db.select().from(opportunities).orderBy(desc(opportunities.createdAt));
    }
    if (role === "TECHNICIAN") return [];
    if (!companyId) return [];

    if (role === "COMPANY_ADMIN") {
      return db.select().from(opportunities)
        .where(eq(opportunities.companyId, companyId))
        .orderBy(desc(opportunities.createdAt));
    }

    if (role === "SALES_AGENT") {
      return db.select().from(opportunities)
        .where(and(eq(opportunities.companyId, companyId), eq(opportunities.assignedToUserId, userId)))
        .orderBy(desc(opportunities.createdAt));
    }

    return [];
  },

  async getOpportunitiesByCompany(companyId: string): Promise<Opportunity[]> {
    return db.select().from(opportunities)
      .where(eq(opportunities.companyId, companyId))
      .orderBy(desc(opportunities.createdAt));
  },

  async getOpportunitiesByLeadWithAccess(leadId: string, ctx: AccessContext): Promise<Opportunity[]> {
    const { userId, role, companyId } = ctx;

    if (role === "TECHNICIAN" || !companyId) return [];

    if (role === "COMPANY_ADMIN" || role === "SUPER_ADMIN") {
      return db.select().from(opportunities)
        .where(and(eq(opportunities.leadId, leadId), eq(opportunities.companyId, companyId)))
        .orderBy(desc(opportunities.createdAt));
    }

    if (role === "SALES_AGENT") {
      return db.select().from(opportunities)
        .where(and(
          eq(opportunities.leadId, leadId),
          eq(opportunities.companyId, companyId),
          eq(opportunities.assignedToUserId, userId)
        ))
        .orderBy(desc(opportunities.createdAt));
    }

    return [];
  },

  async getOpportunitiesByLead(leadId: string, companyId: string): Promise<Opportunity[]> {
    return db.select().from(opportunities)
      .where(and(eq(opportunities.leadId, leadId), eq(opportunities.companyId, companyId)))
      .orderBy(desc(opportunities.createdAt));
  },

  async getOpportunity(id: string, companyId: string): Promise<Opportunity | undefined> {
    const [opp] = await db.select().from(opportunities)
      .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)));
    return opp || undefined;
  },

  async createOpportunity(data: InsertOpportunity): Promise<Opportunity> {
    const [opp] = await db.insert(opportunities).values(data).returning();
    return opp;
  },

  async updateOpportunity(id: string, companyId: string, data: Partial<InsertOpportunity> & { wonAt?: Date; lostAt?: Date; quoteSentAt?: Date; quoteReminderSnoozedUntil?: Date | null; photoNotificationScheduledAt?: Date | null; photoNotificationSentAt?: Date | null }): Promise<Opportunity | undefined> {
    const { companyId: _, wonAt: _wonAt, lostAt: _lostAt, quoteSentAt: _quoteSentAt, quoteReminderSnoozedUntil: _quoteReminderSnoozedUntil, photoNotificationScheduledAt: _photoNotificationScheduledAt, photoNotificationSentAt: _photoNotificationSentAt, ...safeData } = data;
    const updateData: Record<string, unknown> = { ...safeData, updatedAt: new Date() };
    if (_wonAt !== undefined) updateData.wonAt = _wonAt;
    if (_lostAt !== undefined) updateData.lostAt = _lostAt;
    if (_quoteSentAt !== undefined) updateData.quoteSentAt = _quoteSentAt;
    if (_quoteReminderSnoozedUntil !== undefined) updateData.quoteReminderSnoozedUntil = _quoteReminderSnoozedUntil;
    if (_photoNotificationScheduledAt !== undefined) updateData.photoNotificationScheduledAt = _photoNotificationScheduledAt;
    if (_photoNotificationSentAt !== undefined) updateData.photoNotificationSentAt = _photoNotificationSentAt;
    const [opp] = await db.update(opportunities).set(updateData)
      .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)))
      .returning();
    return opp || undefined;
  },

  async deleteOpportunity(id: string, companyId: string): Promise<boolean> {
    const relatedQuotes = await db.select({ id: quotes.id }).from(quotes)
      .where(and(eq(quotes.opportunityId, id), eq(quotes.companyId, companyId)));

    for (const q of relatedQuotes) {
      await db.delete(quoteItems).where(eq(quoteItems.quoteId, q.id));
    }

    await db.delete(quotes)
      .where(and(eq(quotes.opportunityId, id), eq(quotes.companyId, companyId)));

    await db.delete(reminders)
      .where(and(eq(reminders.opportunityId, id), eq(reminders.companyId, companyId)));

    await db.delete(activityLogs)
      .where(and(eq(activityLogs.entityId, id), eq(activityLogs.entityType, "opportunity"), eq(activityLogs.companyId, companyId)));

    const result = await db.delete(opportunities)
      .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)))
      .returning();
    return result.length > 0;
  },

  async moveOpportunityToStage(opportunityId: string, stageId: string, companyId: string): Promise<Opportunity | undefined> {
    const stage = await pipelineStorage.getStage(stageId, companyId);
    if (!stage) return undefined;

    const now = new Date();
    const updateFields: Record<string, unknown> = { stageId, updatedAt: now };

    if (stage.name === "Vinto") {
      updateFields.wonAt = now;
      updateFields.lostAt = null;
    } else if (stage.name === "Perso") {
      updateFields.lostAt = now;
      updateFields.wonAt = null;
    } else {
      updateFields.wonAt = null;
      updateFields.lostAt = null;
    }

    if (stage.name === "Preventivo Inviato") {
      const existing = await db
        .select({ quoteSentAt: opportunities.quoteSentAt })
        .from(opportunities)
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.companyId, companyId)))
        .limit(1);
      if (!existing[0]?.quoteSentAt) {
        updateFields.quoteSentAt = now;
      }
    }

    const [opp] = await db.update(opportunities).set(updateFields)
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.companyId, companyId)))
      .returning();
    return opp || undefined;
  },

  async getOpportunitiesByIds(ids: string[], companyId: string): Promise<Opportunity[]> {
    if (ids.length === 0) return [];
    return db.select().from(opportunities)
      .where(and(inArray(opportunities.id, ids), eq(opportunities.companyId, companyId)));
  },

  // ============ Activity Logs ============

  async createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db.insert(activityLogs).values(data).returning();
    return log;
  },

  async getActivitiesByEntity(entityType: string, entityId: string, companyId: string): Promise<(ActivityLog & { userName: string | null })[]> {
    const rows = await db
      .select({
        id: activityLogs.id,
        companyId: activityLogs.companyId,
        userId: activityLogs.userId,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        action: activityLogs.action,
        details: activityLogs.details,
        createdAt: activityLogs.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(and(
        eq(activityLogs.entityType, entityType),
        eq(activityLogs.entityId, entityId),
        eq(activityLogs.companyId, companyId)
      ))
      .orderBy(desc(activityLogs.createdAt));

    return rows.map(r => ({
      id: r.id,
      companyId: r.companyId,
      userId: r.userId,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      details: r.details,
      createdAt: r.createdAt,
      userName: r.userFirstName && r.userLastName ? `${r.userFirstName} ${r.userLastName}` : r.userFirstName || null,
    }));
  },

  async getActivitiesByCompany(companyId: string, limit: number = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.companyId, companyId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  },

  async getActivitiesByLead(leadId: string, companyId: string): Promise<(ActivityLog & { userName: string | null })[]> {
    const leadOpportunities = await pipelineStorage.getOpportunitiesByLead(leadId, companyId);
    const opportunityIds = leadOpportunities.map(o => o.id);

    const [leadActivities, opportunityActivities] = await Promise.all([
      pipelineStorage.getActivitiesByEntity("lead", leadId, companyId),
      opportunityIds.length > 0
        ? db.select({
            id: activityLogs.id,
            companyId: activityLogs.companyId,
            userId: activityLogs.userId,
            entityType: activityLogs.entityType,
            entityId: activityLogs.entityId,
            action: activityLogs.action,
            details: activityLogs.details,
            createdAt: activityLogs.createdAt,
            userFirstName: users.firstName,
            userLastName: users.lastName,
          })
          .from(activityLogs)
          .leftJoin(users, eq(activityLogs.userId, users.id))
          .where(and(
            eq(activityLogs.entityType, "opportunity"),
            inArray(activityLogs.entityId, opportunityIds),
            eq(activityLogs.companyId, companyId)
          ))
          .orderBy(desc(activityLogs.createdAt))
          .then(rows => rows.map(r => ({
            id: r.id,
            companyId: r.companyId,
            userId: r.userId,
            entityType: r.entityType,
            entityId: r.entityId,
            action: r.action,
            details: r.details,
            createdAt: r.createdAt,
            userName: r.userFirstName && r.userLastName ? `${r.userFirstName} ${r.userLastName}` : r.userFirstName || null,
          })))
        : Promise.resolve([] as (ActivityLog & { userName: string | null })[]),
    ]);

    const allActivities = [...leadActivities, ...opportunityActivities];
    allActivities.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return allActivities;
  },
};
