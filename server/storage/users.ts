import {
  users, userCompanies, invites, contactReferents, articles, passwordResetTokens,
  type User, type UserRole, type UserStatus,
  type Invite, type InsertInvite,
  type ContactReferent, type InsertContactReferent,
  type Article, type InsertArticle,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, or, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const usersStorage = {
  // ============ Team Management ============

  async getUsersByCompanyId(companyId: string): Promise<User[]> {
    const userCompanyList = await db
      .select({ userId: userCompanies.userId })
      .from(userCompanies)
      .where(eq(userCompanies.companyId, companyId));

    if (userCompanyList.length === 0) return [];

    const userIds = userCompanyList.map(uc => uc.userId);
    return db.select().from(users).where(or(...userIds.map(id => eq(users.id, id))));
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  },

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  },

  async getUsersByIds(ids: string[]): Promise<User[]> {
    const { inArray } = await import("drizzle-orm");
    if (ids.length === 0) return [];
    return db.select().from(users).where(inArray(users.id, ids));
  },

  async createUserWithCompany(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  }, companyId: string): Promise<User> {
    return await db.transaction(async (tx) => {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const [user] = await tx.insert(users).values({
        email: userData.email.toLowerCase(),
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
      }).returning();
      await tx.insert(userCompanies).values({ userId: user.id, companyId });
      return user;
    });
  },

  async updateUserRole(userId: string, role: UserRole): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  },

  async updateUserStatus(userId: string, status: UserStatus): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  },

  async updateUserProfile(userId: string, data: { displayName?: string; contactEmail?: string; phone?: string; profileImageUrl?: string; profileImageData?: string | null }): Promise<User | undefined> {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.profileImageUrl !== undefined) updateData.profileImageUrl = data.profileImageUrl;
    if (data.profileImageData !== undefined) updateData.profileImageData = data.profileImageData;
    const [user] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return user || undefined;
  },

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  },

  // ============ Invites ============

  async createInvite(data: InsertInvite): Promise<Invite> {
    const [invite] = await db.insert(invites).values({
      ...data,
      role: data.role as UserRole,
    }).returning();
    return invite;
  },

  async getInviteByToken(token: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites).where(eq(invites.token, token));
    return invite || undefined;
  },

  async getInviteByEmail(email: string, companyId: string): Promise<Invite | undefined> {
    const [invite] = await db.select().from(invites)
      .where(and(eq(invites.email, email.toLowerCase()), eq(invites.companyId, companyId)));
    return invite || undefined;
  },

  async deleteInvite(id: string): Promise<boolean> {
    const result = await db.delete(invites).where(eq(invites.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async deleteExpiredInvites(): Promise<number> {
    const result = await db.delete(invites).where(lte(invites.expiresAt, new Date()));
    return result.rowCount ?? 0;
  },

  // ============ Password Reset ============

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  },

  // ============ Contact Referents ============

  async getReferentsByContactId(contactId: string): Promise<ContactReferent[]> {
    return db.select().from(contactReferents)
      .where(eq(contactReferents.contactId, contactId))
      .orderBy(contactReferents.createdAt);
  },

  async getReferent(id: string): Promise<ContactReferent | undefined> {
    const [referent] = await db.select().from(contactReferents).where(eq(contactReferents.id, id));
    return referent || undefined;
  },

  async createReferent(data: InsertContactReferent): Promise<ContactReferent> {
    const [referent] = await db.insert(contactReferents).values(data).returning();
    return referent;
  },

  async updateReferent(id: string, data: Partial<InsertContactReferent>): Promise<ContactReferent | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [referent] = await db.update(contactReferents).set(updateData)
      .where(eq(contactReferents.id, id))
      .returning();
    return referent || undefined;
  },

  async deleteReferent(id: string): Promise<boolean> {
    const result = await db.delete(contactReferents).where(eq(contactReferents.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Articles (Listino Preventivatore) ============

  async getArticlesByCompany(companyId: string, checklistOnly?: boolean): Promise<Article[]> {
    if (checklistOnly) {
      return db.select().from(articles)
        .where(and(eq(articles.companyId, companyId), eq(articles.isChecklistItem, 1), eq(articles.isActive, 1)))
        .orderBy(articles.checklistOrder);
    }
    return db.select().from(articles)
      .where(and(eq(articles.companyId, companyId), eq(articles.isActive, 1)))
      .orderBy(articles.checklistOrder);
  },

  async getArticle(id: string, companyId: string): Promise<Article | undefined> {
    const [article] = await db.select().from(articles)
      .where(and(eq(articles.id, id), eq(articles.companyId, companyId)));
    return article || undefined;
  },

  async updateArticle(id: string, companyId: string, data: Partial<InsertArticle>): Promise<Article | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [article] = await db.update(articles).set(updateData)
      .where(and(eq(articles.id, id), eq(articles.companyId, companyId)))
      .returning();
    return article || undefined;
  },
};
