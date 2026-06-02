import {
  reminders,
  type Reminder, type InsertReminder,
} from "@shared/schema";
import { db } from "../db";
import { and, eq, desc, lte, gte } from "drizzle-orm";

export const remindersStorage = {
  async getReminders(): Promise<Reminder[]> {
    return db.select().from(reminders).orderBy(desc(reminders.dueDate));
  },

  async getRemindersByLead(leadId: string): Promise<Reminder[]> {
    return db.select().from(reminders).where(eq(reminders.leadId, leadId)).orderBy(desc(reminders.dueDate));
  },

  async getRemindersByOpportunity(opportunityId: string): Promise<Reminder[]> {
    return db
      .select()
      .from(reminders)
      .where(eq(reminders.opportunityId, opportunityId))
      .orderBy(desc(reminders.dueDate));
  },

  async getUpcomingReminders(fromDate: Date, toDate: Date): Promise<Reminder[]> {
    return db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.completed, false),
          gte(reminders.dueDate, fromDate),
          lte(reminders.dueDate, toDate),
        ),
      )
      .orderBy(reminders.dueDate);
  },

  async createReminder(data: InsertReminder): Promise<Reminder> {
    const [r] = await db.insert(reminders).values(data).returning();
    return r;
  },

  async updateReminder(id: string, data: Partial<InsertReminder>): Promise<Reminder | undefined> {
    const [r] = await db.update(reminders).set(data).where(eq(reminders.id, id)).returning();
    return r || undefined;
  },

  async toggleReminderCompleted(id: string, completed: boolean): Promise<Reminder | undefined> {
    const [r] = await db
      .update(reminders)
      .set({ completed, completedAt: completed ? new Date() : null })
      .where(eq(reminders.id, id))
      .returning();
    return r || undefined;
  },

  async deleteReminder(id: string): Promise<boolean> {
    const result = await db.delete(reminders).where(eq(reminders.id, id)).returning();
    return result.length > 0;
  },
};
