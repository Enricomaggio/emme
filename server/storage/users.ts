import {
  users, passwordResetTokens,
  type User,
} from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export const usersStorage = {
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  },

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  },

  async updateUserProfile(
    userId: string,
    data: {
      displayName?: string;
      contactEmail?: string;
      phone?: string;
      profileImageUrl?: string;
      profileImageData?: string | null;
    },
  ): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  },

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  },

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  },
};
