import {
  contactReferents,
  type ContactReferent, type InsertContactReferent,
} from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export const contactReferentsStorage = {
  async getReferentsByContact(contactId: string): Promise<ContactReferent[]> {
    return db
      .select()
      .from(contactReferents)
      .where(eq(contactReferents.contactId, contactId))
      .orderBy(contactReferents.createdAt);
  },

  async getReferent(id: string): Promise<ContactReferent | undefined> {
    const [r] = await db.select().from(contactReferents).where(eq(contactReferents.id, id));
    return r || undefined;
  },

  async createReferent(data: InsertContactReferent): Promise<ContactReferent> {
    const [r] = await db.insert(contactReferents).values(data).returning();
    return r;
  },

  async updateReferent(id: string, data: Partial<InsertContactReferent>): Promise<ContactReferent | undefined> {
    const [r] = await db
      .update(contactReferents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contactReferents.id, id))
      .returning();
    return r || undefined;
  },

  async deleteReferent(id: string): Promise<boolean> {
    const result = await db.delete(contactReferents).where(eq(contactReferents.id, id)).returning();
    return result.length > 0;
  },
};
