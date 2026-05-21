import {
  notifications, notificationPreferences, userCompanies, users,
  type AppNotification, type InsertNotification,
  type NotificationPreference,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

export const notificationsStorage = {
  async getNotifications(userId: string): Promise<AppNotification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  },

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result?.count || 0;
  },

  async createNotification(data: InsertNotification): Promise<AppNotification> {
    const [notif] = await db.insert(notifications).values(data).returning();
    return notif;
  },

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  },

  async createNotificationsForCompanyRoles(companyId: string, roles: string[], data: Omit<InsertNotification, 'userId' | 'companyId'>): Promise<void> {
    const companyUsers = await db
      .select({ userId: userCompanies.userId })
      .from(userCompanies)
      .where(eq(userCompanies.companyId, companyId));

    const userIds = companyUsers.map(uc => uc.userId);
    if (userIds.length === 0) return;

    const matchingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, userIds), inArray(users.role, roles)));

    if (matchingUsers.length === 0) return;

    const matchingUserIds = matchingUsers.map(u => u.id);
    const prefs = await db
      .select()
      .from(notificationPreferences)
      .where(and(
        inArray(notificationPreferences.userId, matchingUserIds),
        eq(notificationPreferences.notificationType, data.type)
      ));
    const disabledUserIds = new Set(prefs.filter(p => !p.enabled).map(p => p.userId));
    const filteredUsers = matchingUsers.filter(u => !disabledUserIds.has(u.id));

    if (filteredUsers.length === 0) return;

    const notifValues = filteredUsers.map(u => ({ ...data, userId: u.id, companyId }));
    await db.insert(notifications).values(notifValues);
  },

  async createNotificationsBulk(data: InsertNotification[]): Promise<void> {
    if (data.length === 0) return;
    await db.insert(notifications).values(data);
  },

  // ============ Notification Preferences ============

  async getNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
    return db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  },

  async setNotificationPreference(userId: string, notificationType: string, enabled: boolean): Promise<void> {
    const existing = await db.select().from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.notificationType, notificationType)
      ));

    if (existing.length > 0) {
      await db.update(notificationPreferences)
        .set({ enabled })
        .where(and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.notificationType, notificationType)
        ));
    } else {
      await db.insert(notificationPreferences).values({ userId, notificationType, enabled });
    }
  },
};
