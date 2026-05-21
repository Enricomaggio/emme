import {
  paymentMethods, leadSources, reminders, billingProfiles, clauseOverrides, leads,
  type PaymentMethod, type InsertPaymentMethod,
  type LeadSource, type InsertLeadSource,
  type Reminder, type InsertReminder,
  type BillingProfile, type InsertBillingProfile,
  type ClauseOverride,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, gte, lte, isNull, or } from "drizzle-orm";

export const settingsStorage = {
  // ============ Payment Methods ============

  async getPaymentMethodsByCompany(companyId: string): Promise<PaymentMethod[]> {
    return db.select().from(paymentMethods)
      .where(eq(paymentMethods.companyId, companyId))
      .orderBy(paymentMethods.sortOrder);
  },

  async getPaymentMethod(id: string, companyId: string): Promise<PaymentMethod | undefined> {
    const [method] = await db.select().from(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.companyId, companyId)));
    return method || undefined;
  },

  async createPaymentMethod(data: InsertPaymentMethod): Promise<PaymentMethod> {
    const [method] = await db.insert(paymentMethods).values(data as any).returning();
    return method;
  },

  async updatePaymentMethod(id: string, companyId: string, data: Partial<InsertPaymentMethod>): Promise<PaymentMethod | undefined> {
    const [method] = await db.update(paymentMethods).set(data as any)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.companyId, companyId)))
      .returning();
    return method || undefined;
  },

  async deletePaymentMethod(id: string, companyId: string): Promise<boolean> {
    await db.update(leads).set({ paymentMethodId: null } as any)
      .where(and(eq(leads.paymentMethodId, id), eq(leads.companyId, companyId)));
    const result = await db.delete(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Lead Sources ============

  async getLeadSourcesByCompany(companyId: string): Promise<LeadSource[]> {
    return db.select().from(leadSources)
      .where(eq(leadSources.companyId, companyId))
      .orderBy(leadSources.sortOrder);
  },

  async createLeadSource(data: InsertLeadSource): Promise<LeadSource> {
    const [source] = await db.insert(leadSources).values(data as any).returning();
    return source;
  },

  async updateLeadSource(id: string, companyId: string, data: Partial<InsertLeadSource>): Promise<LeadSource | undefined> {
    const [source] = await db.update(leadSources).set(data as any)
      .where(and(eq(leadSources.id, id), eq(leadSources.companyId, companyId)))
      .returning();
    return source || undefined;
  },

  async deleteLeadSource(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(leadSources)
      .where(and(eq(leadSources.id, id), eq(leadSources.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Reminders ============

  async getRemindersByUser(userId: string, companyId: string, filters?: { dueBefore?: Date; dueAfter?: Date; completed?: boolean }): Promise<Reminder[]> {
    const conditions = [eq(reminders.userId, userId), eq(reminders.companyId, companyId)];
    if (filters?.dueBefore) conditions.push(lte(reminders.dueDate, filters.dueBefore));
    if (filters?.dueAfter) conditions.push(gte(reminders.dueDate, filters.dueAfter));
    if (filters?.completed !== undefined) conditions.push(eq(reminders.completed, filters.completed));
    return db.select().from(reminders).where(and(...conditions)).orderBy(reminders.dueDate);
  },

  async getRemindersByLead(leadId: string, companyId: string): Promise<Reminder[]> {
    return db.select().from(reminders)
      .where(and(eq(reminders.leadId, leadId), eq(reminders.companyId, companyId)))
      .orderBy(reminders.dueDate);
  },

  async getRemindersByOpportunity(opportunityId: string, companyId: string): Promise<Reminder[]> {
    return db.select().from(reminders)
      .where(and(eq(reminders.opportunityId, opportunityId), eq(reminders.companyId, companyId)))
      .orderBy(reminders.dueDate);
  },

  async getOpportunitiesWithActiveManualReminders(companyId: string): Promise<string[]> {
    const results = await db
      .selectDistinct({ opportunityId: reminders.opportunityId })
      .from(reminders)
      .where(and(
        eq(reminders.companyId, companyId),
        or(eq(reminders.isAutomatic, false), isNull(reminders.isAutomatic)),
        eq(reminders.completed, false),
      ));
    return results.map(r => r.opportunityId).filter((id): id is string => id !== null);
  },

  async getReminder(id: string, companyId: string): Promise<Reminder | undefined> {
    const [reminder] = await db.select().from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)));
    return reminder || undefined;
  },

  async createReminder(data: InsertReminder): Promise<Reminder> {
    const [reminder] = await db.insert(reminders).values(data).returning();
    return reminder;
  },

  async updateReminder(id: string, companyId: string, data: Partial<InsertReminder & { completedAt: Date | null }>): Promise<Reminder | undefined> {
    const [reminder] = await db.update(reminders).set(data as any)
      .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)))
      .returning();
    return reminder || undefined;
  },

  async deleteReminder(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Billing Profiles ============

  async getBillingProfilesByCompany(companyId: string): Promise<BillingProfile[]> {
    return db.select().from(billingProfiles)
      .where(eq(billingProfiles.companyId, companyId))
      .orderBy(billingProfiles.profileType);
  },

  async getBillingProfileByType(companyId: string, profileType: "PRIVATE" | "PUBLIC"): Promise<BillingProfile | undefined> {
    const [profile] = await db.select().from(billingProfiles)
      .where(and(eq(billingProfiles.companyId, companyId), eq(billingProfiles.profileType, profileType)));
    return profile || undefined;
  },

  async getBillingProfile(id: string, companyId: string): Promise<BillingProfile | undefined> {
    const [profile] = await db.select().from(billingProfiles)
      .where(and(eq(billingProfiles.id, id), eq(billingProfiles.companyId, companyId)));
    return profile || undefined;
  },

  async createBillingProfile(data: InsertBillingProfile): Promise<BillingProfile> {
    const [profile] = await db.insert(billingProfiles).values(data).returning();
    return profile;
  },

  async updateBillingProfile(id: string, companyId: string, data: Partial<InsertBillingProfile>): Promise<BillingProfile | undefined> {
    const [profile] = await db.update(billingProfiles)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(billingProfiles.id, id), eq(billingProfiles.companyId, companyId)))
      .returning();
    return profile || undefined;
  },

  async deleteBillingProfile(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(billingProfiles)
      .where(and(eq(billingProfiles.id, id), eq(billingProfiles.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Clause Overrides ============

  async getClauseOverridesByCompany(companyId: string): Promise<ClauseOverride[]> {
    try {
      return await db.select().from(clauseOverrides).where(eq(clauseOverrides.companyId, companyId));
    } catch (error: any) {
      console.error(`[storage] getClauseOverridesByCompany companyId=${companyId} error: ${error?.message} code=${error?.code}`);
      throw error;
    }
  },

  async upsertClauseOverride(companyId: string, clauseId: string, text: string): Promise<ClauseOverride> {
    try {
      const [result] = await db.insert(clauseOverrides)
        .values({ companyId, clauseId, text })
        .onConflictDoUpdate({
          target: [clauseOverrides.companyId, clauseOverrides.clauseId],
          set: { text, updatedAt: new Date() },
        })
        .returning();
      return result;
    } catch (error: any) {
      console.error(`[storage] upsertClauseOverride companyId=${companyId} clauseId=${clauseId} error: ${error?.message} code=${error?.code}`);
      throw error;
    }
  },

  async deleteClauseOverride(companyId: string, clauseId: string): Promise<boolean> {
    const result = await db.delete(clauseOverrides)
      .where(and(eq(clauseOverrides.companyId, companyId), eq(clauseOverrides.clauseId, clauseId)))
      .returning();
    return result.length > 0;
  },
};
