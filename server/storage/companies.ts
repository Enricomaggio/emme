import {
  companies, leads, userCompanies, users, pipelineStages, opportunities,
  type Company, type InsertCompany,
  type UserCompany, type InsertUserCompany,
  type User,
} from "@shared/schema";
import type { CompanyWithUserCount } from "./types";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const companiesStorage = {
  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  },

  async getAllCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(companies.name);
  },

  async getAllCompaniesWithUserCount(): Promise<CompanyWithUserCount[]> {
    const allCompanies = await db.select().from(companies).orderBy(desc(companies.createdAt));
    const companiesWithCount = await Promise.all(
      allCompanies.map(async (company) => {
        const userCompanyList = await db
          .select()
          .from(userCompanies)
          .where(eq(userCompanies.companyId, company.id));
        return { ...company, userCount: userCompanyList.length };
      })
    );
    return companiesWithCount;
  },

  async createCompany(data: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(data).returning();
    return company;
  },

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db
      .update(companies)
      .set(data)
      .where(eq(companies.id, id))
      .returning();
    return company || undefined;
  },

  async deleteCompanyWithCascade(id: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const userCompanyList = await tx
        .select({ userId: userCompanies.userId, role: users.role })
        .from(userCompanies)
        .innerJoin(users, eq(userCompanies.userId, users.id))
        .where(eq(userCompanies.companyId, id));

      const userIdsToDelete = userCompanyList
        .filter((uc) => uc.role !== "SUPER_ADMIN")
        .map((uc) => uc.userId);

      await tx.delete(opportunities).where(eq(opportunities.companyId, id));
      await tx.delete(leads).where(eq(leads.companyId, id));
      await tx.delete(userCompanies).where(eq(userCompanies.companyId, id));

      for (const userId of userIdsToDelete) {
        await tx.delete(users).where(eq(users.id, userId));
      }

      const result = await tx.delete(companies).where(eq(companies.id, id)).returning();
      return result.length > 0;
    });
  },

  // User-Company associations
  async getUserCompany(userId: string): Promise<UserCompany | undefined> {
    const [userCompany] = await db
      .select()
      .from(userCompanies)
      .where(eq(userCompanies.userId, userId));
    return userCompany || undefined;
  },

  async getUserCompanyByCompanyId(companyId: string): Promise<UserCompany[]> {
    return db.select().from(userCompanies).where(eq(userCompanies.companyId, companyId));
  },

  async createUserCompany(data: InsertUserCompany): Promise<UserCompany> {
    const [userCompany] = await db
      .insert(userCompanies)
      .values(data)
      .onConflictDoNothing({ target: userCompanies.userId })
      .returning();

    if (!userCompany) {
      const existing = await companiesStorage.getUserCompany(data.userId);
      if (existing) return existing;
      throw new Error("Failed to create or retrieve user company");
    }
    return userCompany;
  },

  async createCompanyWithAdmin(
    companyData: InsertCompany,
    adminData: { firstName: string; lastName: string; email: string; password: string }
  ): Promise<{ company: Company; admin: User }> {
    return await db.transaction(async (tx) => {
      const [company] = await tx.insert(companies).values(companyData).returning();

      const hashedPassword = await bcrypt.hash(adminData.password, 12);
      const [admin] = await tx.insert(users).values({
        email: adminData.email.toLowerCase(),
        password: hashedPassword,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: "COMPANY_ADMIN" as const,
      }).returning();

      await tx.insert(userCompanies).values({ userId: admin.id, companyId: company.id });

      const defaultStages: { name: string; order: number; color: string }[] = [
        { name: "Nuovo Lead", order: 1, color: "#61CE85" },
        { name: "Contattato", order: 2, color: "#4563FF" },
        { name: "Sopralluogo da fare", order: 3, color: "#F59E0B" },
        { name: "Preventivo da Inviare", order: 4, color: "#EC4899" },
        { name: "Preventivo Inviato", order: 5, color: "#8B5CF6" },
        { name: "Vinto", order: 6, color: "#059669" },
        { name: "Perso", order: 7, color: "#EF4444" },
      ];

      await tx.insert(pipelineStages).values(
        defaultStages.map(stage => ({
          name: stage.name,
          order: stage.order,
          color: stage.color,
          companyId: company.id,
        }))
      );

      return { company, admin };
    });
  },
};
