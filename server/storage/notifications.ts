import {
  notifications,
  type AppNotification, type InsertNotification,
} from "@shared/schema";
import { db } from "../db";
import { and, eq, desc, sql } from "drizzle-orm";

export const notificationsStorage = {
  async getNotifications(): Promise<AppNotification[]> {
    return db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  },

  async getUnreadCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.isRead, false));
    return result?.count || 0;
  },

  async createNotification(data: InsertNotification): Promise<AppNotification> {
    const [n] = await db.insert(notifications).values(data).returning();
    return n;
  },

  async markRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  },

  async markAllRead(): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false));
  },
};
