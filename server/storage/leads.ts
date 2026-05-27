import {
  leads, opportunities, quotes, quoteItems, activityLogs,
  type Lead, type InsertLead,
  type ContactType, type EntityType, type ContactSource,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import type { AccessContext } from "./types";

export const leadsStorage = {
  async getLeadsWithAccess(ctx: AccessContext): Promise<Lead[]> {
    const { userId, role, companyId } = ctx;

    if (role === "SUPER_ADMIN") {
      return db.select().from(leads).orderBy(desc(leads.createdAt));
    }
    if (role === "TECHNICIAN") return [];
    if (!companyId) return [];

    if (role === "COMPANY_ADMIN") {
      return db.select().from(leads)
        .where(eq(leads.companyId, companyId))
        .orderBy(desc(leads.createdAt));
    }

    if (role === "SALES_AGENT") {
      return db.select().from(leads)
        .where(and(eq(leads.companyId, companyId), eq(leads.assignedToUserId, userId)))
        .orderBy(desc(leads.createdAt));
    }

    return [];
  },

  async getLeadWithAccess(id: string, ctx: AccessContext): Promise<Lead | undefined> {
    const { userId, role, companyId } = ctx;

    if (role === "SUPER_ADMIN") {
      const [lead] = await db.select().from(leads).where(eq(leads.id, id));
      return lead || undefined;
    }
    if (role === "TECHNICIAN") return undefined;
    if (!companyId) return undefined;

    if (role === "COMPANY_ADMIN") {
      const [lead] = await db.select().from(leads)
        .where(and(eq(leads.id, id), eq(leads.companyId, companyId)));
      return lead || undefined;
    }

    if (role === "SALES_AGENT") {
      const [lead] = await db.select().from(leads)
        .where(and(eq(leads.id, id), eq(leads.companyId, companyId), eq(leads.assignedToUserId, userId)));
      return lead || undefined;
    }

    return undefined;
  },

  async updateLeadWithAccess(id: string, ctx: AccessContext, data: Partial<InsertLead>): Promise<Lead | undefined> {
    const lead = await leadsStorage.getLeadWithAccess(id, ctx);
    if (!lead) return undefined;

    const { companyId: _, ...safeData } = data;
    const updateData: Record<string, unknown> = { ...safeData, updatedAt: new Date() };
    const [updatedLead] = await db.update(leads).set(updateData).where(eq(leads.id, id)).returning();
    return updatedLead || undefined;
  },

  async propagateAssignedUserToOpportunities(leadId: string, assignedToUserId: string): Promise<number> {
    const result = await db.update(opportunities)
      .set({ assignedToUserId, updatedAt: new Date() })
      .where(eq(opportunities.leadId, leadId))
      .returning();
    return result.length;
  },

  async syncOpportunityAssignments(companyId?: string): Promise<number> {
    const opportunityPattern = /^\d+-\d{4}$/;
    const { isNull } = await import("drizzle-orm");

    const conditions = [isNull(opportunities.assignedToUserId)];
    if (companyId) {
      conditions.push(eq(opportunities.companyId, companyId));
    }

    const nullOpps = await db
      .select({ id: opportunities.id, title: opportunities.title, leadId: opportunities.leadId })
      .from(opportunities)
      .where(and(...conditions));

    const toUpdate = nullOpps.filter(o => opportunityPattern.test(o.title ?? ""));
    if (toUpdate.length === 0) return 0;

    const leadIds = Array.from(new Set(toUpdate.map(o => o.leadId)));
    const leadsData = await db
      .select({ id: leads.id, assignedToUserId: leads.assignedToUserId })
      .from(leads)
      .where(inArray(leads.id, leadIds));

    const leadMap = new Map(leadsData.map(l => [l.id, l.assignedToUserId]));

    let updated = 0;
    for (const opp of toUpdate) {
      const assignedUserId = leadMap.get(opp.leadId);
      if (!assignedUserId) continue;
      await db.update(opportunities)
        .set({ assignedToUserId: assignedUserId, updatedAt: new Date() })
        .where(eq(opportunities.id, opp.id));
      updated++;
    }
    return updated;
  },

  async deleteLeadWithAccess(id: string, ctx: AccessContext): Promise<boolean> {
    const lead = await leadsStorage.getLeadWithAccess(id, ctx);
    if (!lead) return false;

    const leadOpportunities = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.leadId, id));
    for (const opp of leadOpportunities) {
      await db.delete(quoteItems).where(
        sql`${quoteItems.quoteId} IN (SELECT id FROM quotes WHERE opportunity_id = ${opp.id})`
      );
      await db.delete(quotes).where(eq(quotes.opportunityId, opp.id));
    }
    await db.delete(opportunities).where(eq(opportunities.leadId, id));
    await db.execute(sql`DELETE FROM creditsafe_reports WHERE lead_id = ${id}`);
    await db.delete(activityLogs).where(
      and(eq(activityLogs.entityType, "lead"), eq(activityLogs.entityId, id))
    );

    const result = await db.delete(leads).where(eq(leads.id, id)).returning();
    return result.length > 0;
  },

  // Legacy methods
  async getLeadsByCompany(companyId: string): Promise<Lead[]> {
    return db.select().from(leads)
      .where(eq(leads.companyId, companyId))
      .orderBy(desc(leads.createdAt));
  },

  async getLead(id: string, companyId: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads)
      .where(and(eq(leads.id, id), eq(leads.companyId, companyId)));
    return lead || undefined;
  },

  async getLeadsByIds(ids: string[]): Promise<Lead[]> {
    if (ids.length === 0) return [];
    return db.select().from(leads).where(inArray(leads.id, ids));
  },

  async createLead(data: InsertLead): Promise<Lead> {
    const insertData = {
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      entityType: (data.entityType || "COMPANY") as EntityType,
      type: (data.type || "lead") as ContactType,
      address: data.address,
      city: data.city,
      zipCode: data.zipCode,
      province: data.province,
      country: data.country || "Italia",
      vatNumber: data.vatNumber,
      fiscalCode: data.fiscalCode,
      sdiCode: data.sdiCode,
      pecEmail: data.pecEmail,
      source: data.source as ContactSource | undefined,
      notes: data.notes,
      companyId: data.companyId,
      assignedToUserId: data.assignedToUserId,
      brochureSent: data.brochureSent ?? false,
    };
    const [lead] = await db.insert(leads).values(insertData).returning();
    return lead;
  },

  async updateLead(id: string, companyId: string, data: Partial<InsertLead>): Promise<Lead | undefined> {
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    const [lead] = await db.update(leads).set(updateData)
      .where(and(eq(leads.id, id), eq(leads.companyId, companyId)))
      .returning();
    return lead || undefined;
  },

  async deleteLead(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(leads)
      .where(and(eq(leads.id, id), eq(leads.companyId, companyId)))
      .returning();
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
