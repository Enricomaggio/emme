import {
  projectStages, projects, projectTasks, externalEngineers, quotes, dailyAssignments,
  type ProjectStage, type InsertProjectStage,
  type Project, type InsertProject,
  type ProjectTask, type InsertProjectTask,
  type ExternalEngineer, type InsertExternalEngineer,
  type Quote,
  type DailyAssignment,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, inArray } from "drizzle-orm";

export const projectsStorage = {
  // ============ Project Stages ============

  async getProjectStagesByCompany(companyId: string): Promise<ProjectStage[]> {
    return db.select().from(projectStages)
      .where(eq(projectStages.companyId, companyId))
      .orderBy(projectStages.order);
  },

  async createProjectStage(data: InsertProjectStage): Promise<ProjectStage> {
    const [stage] = await db.insert(projectStages).values(data).returning();
    return stage;
  },

  async updateProjectStage(id: string, companyId: string, data: Partial<InsertProjectStage>): Promise<ProjectStage | undefined> {
    const [stage] = await db.update(projectStages).set(data)
      .where(and(eq(projectStages.id, id), eq(projectStages.companyId, companyId)))
      .returning();
    return stage || undefined;
  },

  async deleteProjectStage(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(projectStages)
      .where(and(eq(projectStages.id, id), eq(projectStages.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  async reorderProjectStages(companyId: string, stageIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < stageIds.length; i++) {
        await tx.update(projectStages).set({ order: i + 1 })
          .where(and(eq(projectStages.id, stageIds[i]), eq(projectStages.companyId, companyId)));
      }
    });
  },

  // ============ External Engineers ============

  async getExternalEngineersByCompany(companyId: string): Promise<ExternalEngineer[]> {
    return db.select().from(externalEngineers)
      .where(eq(externalEngineers.companyId, companyId))
      .orderBy(externalEngineers.name);
  },

  async getExternalEngineer(id: string, companyId: string): Promise<ExternalEngineer | undefined> {
    const [engineer] = await db.select().from(externalEngineers)
      .where(and(eq(externalEngineers.id, id), eq(externalEngineers.companyId, companyId)));
    return engineer || undefined;
  },

  async createExternalEngineer(data: InsertExternalEngineer): Promise<ExternalEngineer> {
    const [engineer] = await db.insert(externalEngineers).values(data).returning();
    return engineer;
  },

  async updateExternalEngineer(id: string, companyId: string, data: Partial<InsertExternalEngineer>): Promise<ExternalEngineer | undefined> {
    const [engineer] = await db.update(externalEngineers).set(data)
      .where(and(eq(externalEngineers.id, id), eq(externalEngineers.companyId, companyId)))
      .returning();
    return engineer || undefined;
  },

  async deleteExternalEngineer(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(externalEngineers)
      .where(and(eq(externalEngineers.id, id), eq(externalEngineers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Projects ============

  async getProjectsByCompany(companyId: string): Promise<Project[]> {
    return db.select().from(projects)
      .where(eq(projects.companyId, companyId))
      .orderBy(desc(projects.createdAt));
  },

  async getProject(id: string, companyId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.companyId, companyId)));
    return project || undefined;
  },

  async getProjectByOpportunity(opportunityId: string, companyId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.opportunityId, opportunityId), eq(projects.companyId, companyId)));
    return project || undefined;
  },

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data as any).returning();
    return project;
  },

  async updateProject(id: string, companyId: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [project] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
      .returning();
    return project || undefined;
  },

  async deleteProject(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(projects)
      .where(and(eq(projects.id, id), eq(projects.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  async getQuotesByOpportunityIds(opportunityIds: string[], companyId: string): Promise<Quote[]> {
    if (opportunityIds.length === 0) return [];
    return db.select().from(quotes)
      .where(and(inArray(quotes.opportunityId, opportunityIds), eq(quotes.companyId, companyId)))
      .orderBy(desc(quotes.createdAt));
  },

  async getDailyAssignmentsByProjectIds(projectIds: string[], companyId: string): Promise<DailyAssignment[]> {
    if (projectIds.length === 0) return [];
    return db.select().from(dailyAssignments)
      .where(and(inArray(dailyAssignments.projectId, projectIds), eq(dailyAssignments.companyId, companyId)))
      .orderBy(dailyAssignments.date);
  },

  // ============ Project Tasks ============

  async getProjectTasksByProject(projectId: string, companyId: string): Promise<ProjectTask[]> {
    return db.select().from(projectTasks)
      .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.companyId, companyId)))
      .orderBy(projectTasks.sortOrder);
  },

  async getProjectTask(id: string, companyId: string): Promise<ProjectTask | undefined> {
    const [task] = await db.select().from(projectTasks)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.companyId, companyId)));
    return task || undefined;
  },

  async createProjectTask(data: InsertProjectTask): Promise<ProjectTask> {
    const [task] = await db.insert(projectTasks).values(data as any).returning();
    return task;
  },

  async updateProjectTask(id: string, companyId: string, data: Partial<InsertProjectTask>): Promise<ProjectTask | undefined> {
    const [task] = await db.update(projectTasks)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.companyId, companyId)))
      .returning();
    return task || undefined;
  },

  async deleteProjectTask(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(projectTasks)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },
};
