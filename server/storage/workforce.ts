import {
  workers, teams, teamMembers, drivers, vehicles, dailyAssignments,
  type Worker, type InsertWorker,
  type Team, type InsertTeam,
  type TeamMember, type InsertTeamMember,
  type Driver, type InsertDriver,
  type Vehicle, type InsertVehicle,
  type DailyAssignment, type InsertDailyAssignment,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, gte, lte, not } from "drizzle-orm";

export const workforceStorage = {
  // ============ Workers ============

  async getWorkersByCompany(companyId: string): Promise<Worker[]> {
    return db.select().from(workers).where(eq(workers.companyId, companyId)).orderBy(workers.sortOrder, workers.name);
  },

  async getWorker(id: string, companyId: string): Promise<Worker | undefined> {
    const [worker] = await db.select().from(workers).where(and(eq(workers.id, id), eq(workers.companyId, companyId)));
    return worker || undefined;
  },

  async createWorker(data: InsertWorker): Promise<Worker> {
    const [worker] = await db.insert(workers).values(data as any).returning();
    return worker;
  },

  async updateWorker(id: string, companyId: string, data: Partial<InsertWorker>): Promise<Worker | undefined> {
    const [worker] = await db.update(workers).set(data as any).where(and(eq(workers.id, id), eq(workers.companyId, companyId))).returning();
    return worker || undefined;
  },

  async deleteWorker(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(workers).where(and(eq(workers.id, id), eq(workers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Teams ============

  async getTeamsByCompany(companyId: string): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.companyId, companyId)).orderBy(teams.name);
  },

  async getTeam(id: string, companyId: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(and(eq(teams.id, id), eq(teams.companyId, companyId)));
    return team || undefined;
  },

  async createTeam(data: InsertTeam): Promise<Team> {
    const [team] = await db.insert(teams).values(data as any).returning();
    return team;
  },

  async updateTeam(id: string, companyId: string, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [team] = await db.update(teams).set(data as any).where(and(eq(teams.id, id), eq(teams.companyId, companyId))).returning();
    return team || undefined;
  },

  async deleteTeam(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(teams).where(and(eq(teams.id, id), eq(teams.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Team Members ============

  async getTeamMembersByTeam(teamId: string, companyId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.companyId, companyId))).orderBy(teamMembers.name);
  },

  async getTeamMembersByCompany(companyId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.companyId, companyId)).orderBy(teamMembers.name);
  },

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data as any).returning();
    return member;
  },

  async updateTeamMember(id: string, companyId: string, data: Pick<Partial<InsertTeamMember>, "name" | "isActive">): Promise<TeamMember | undefined> {
    const safeFields: Partial<{ name: string; isActive: boolean }> = {};
    if (data.name !== undefined) safeFields.name = data.name;
    if (data.isActive !== undefined) safeFields.isActive = data.isActive;
    if (Object.keys(safeFields).length === 0) return undefined;
    const [member] = await db.update(teamMembers).set(safeFields).where(and(eq(teamMembers.id, id), eq(teamMembers.companyId, companyId))).returning();
    return member || undefined;
  },

  async deleteTeamMember(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Drivers ============

  async getDriversByCompany(companyId: string): Promise<Driver[]> {
    return db.select().from(drivers).where(eq(drivers.companyId, companyId)).orderBy(drivers.name);
  },

  async getDriver(id: string, companyId: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(and(eq(drivers.id, id), eq(drivers.companyId, companyId)));
    return driver || undefined;
  },

  async createDriver(data: InsertDriver): Promise<Driver> {
    const [driver] = await db.insert(drivers).values(data as any).returning();
    return driver;
  },

  async updateDriver(id: string, companyId: string, data: Partial<InsertDriver>): Promise<Driver | undefined> {
    const [driver] = await db.update(drivers).set(data as any).where(and(eq(drivers.id, id), eq(drivers.companyId, companyId))).returning();
    return driver || undefined;
  },

  async deleteDriver(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(drivers).where(and(eq(drivers.id, id), eq(drivers.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Vehicles ============

  async getVehiclesByCompany(companyId: string): Promise<Vehicle[]> {
    return db.select().from(vehicles).where(eq(vehicles.companyId, companyId)).orderBy(vehicles.name);
  },

  async getVehicle(id: string, companyId: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
    return vehicle || undefined;
  },

  async createVehicle(data: InsertVehicle): Promise<Vehicle> {
    const [vehicle] = await db.insert(vehicles).values(data as any).returning();
    return vehicle;
  },

  async updateVehicle(id: string, companyId: string, data: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const [vehicle] = await db.update(vehicles).set(data as any).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId))).returning();
    return vehicle || undefined;
  },

  async deleteVehicle(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ============ Daily Assignments ============

  async getDailyAssignmentsByDateRange(companyId: string, startDate: Date, endDate: Date): Promise<DailyAssignment[]> {
    const { isNull, or } = await import("drizzle-orm");
    return db.select().from(dailyAssignments)
      .where(and(
        eq(dailyAssignments.companyId, companyId),
        lte(dailyAssignments.date, endDate),
        or(
          and(isNull(dailyAssignments.endDate), gte(dailyAssignments.date, startDate)),
          gte(dailyAssignments.endDate, startDate)
        )
      ))
      .orderBy(dailyAssignments.date, dailyAssignments.sortOrder, dailyAssignments.createdAt);
  },

  async getDailyAssignmentsByProjectId(projectId: string, companyId: string): Promise<DailyAssignment[]> {
    return db.select().from(dailyAssignments)
      .where(and(eq(dailyAssignments.companyId, companyId), eq(dailyAssignments.projectId, projectId)))
      .orderBy(dailyAssignments.date);
  },

  async getDailyAssignment(id: string, companyId: string): Promise<DailyAssignment | undefined> {
    const [assignment] = await db.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)));
    return assignment || undefined;
  },

  async createDailyAssignment(data: InsertDailyAssignment): Promise<DailyAssignment> {
    const [assignment] = await db.insert(dailyAssignments).values(data as any).returning();
    return assignment;
  },

  async updateDailyAssignment(id: string, companyId: string, data: Partial<InsertDailyAssignment>): Promise<DailyAssignment | undefined> {
    const [assignment] = await db.update(dailyAssignments).set({ ...data, updatedAt: new Date() } as any).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId))).returning();
    return assignment || undefined;
  },

  async deleteDailyAssignment(id: string, companyId: string): Promise<boolean> {
    const result = await db.delete(dailyAssignments).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  async reorderDailyAssignments(companyId: string, idA: string, idB: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [a, b] = await Promise.all([
        tx.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, idA), eq(dailyAssignments.companyId, companyId))).then(r => r[0]),
        tx.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, idB), eq(dailyAssignments.companyId, companyId))).then(r => r[0]),
      ]);
      if (!a || !b) return false;
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      const sameDay =
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate();
      if (!sameDay) return false;
      const sortA = a.sortOrder;
      const sortB = b.sortOrder;
      await tx.update(dailyAssignments).set({ sortOrder: sortB, updatedAt: new Date() }).where(eq(dailyAssignments.id, idA));
      await tx.update(dailyAssignments).set({ sortOrder: sortA, updatedAt: new Date() }).where(eq(dailyAssignments.id, idB));
      return true;
    });
  },

  async moveDailyAssignmentToIndex(companyId: string, id: string, toIndex: number, prePadding?: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const target = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)))
        .then(r => r[0]);
      if (!target) return false;

      const targetDate = new Date(target.date);
      const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

      const dayRows = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, dayStart), lte(dailyAssignments.date, dayEnd)))
        .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt);

      const filtered = dayRows.filter(r => r.id !== id);
      const clampedIndex = Math.max(0, Math.min(toIndex, filtered.length));
      filtered.splice(clampedIndex, 0, target);

      for (let i = 0; i < filtered.length; i++) {
        const updates: Record<string, any> = { sortOrder: i, updatedAt: new Date() };
        if (filtered[i].id === id && prePadding !== undefined) {
          updates.prePadding = Math.max(0, prePadding);
        }
        await tx.update(dailyAssignments).set(updates).where(eq(dailyAssignments.id, filtered[i].id));
      }
      return true;
    });
  },

  async moveDailyAssignmentToDay(companyId: string, id: string, targetDate: Date, toIndex: number, prePadding?: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const target = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)))
        .then(r => r[0]);
      if (!target) return false;

      const oldDate = new Date(target.date);
      const dayDiff = Math.round((targetDate.getTime() - new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate()).getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff === 0) {
        const filtered = (await tx.select().from(dailyAssignments)
          .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0, 0)), lte(dailyAssignments.date, new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 23, 59, 59, 999))))
          .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt)).filter(r => r.id !== id);
        const ci = Math.max(0, Math.min(toIndex, filtered.length));
        filtered.splice(ci, 0, target);
        for (let i = 0; i < filtered.length; i++) {
          const updates: Record<string, any> = { sortOrder: i, updatedAt: new Date() };
          if (filtered[i].id === id && prePadding !== undefined) {
            updates.prePadding = Math.max(0, prePadding);
          }
          await tx.update(dailyAssignments).set(updates).where(eq(dailyAssignments.id, filtered[i].id));
        }
        return true;
      }

      const newDate = new Date(targetDate);
      newDate.setHours(12, 0, 0, 0);
      let newEndDate: Date | null = null;
      if (target.endDate) {
        const endD = new Date(target.endDate);
        newEndDate = new Date(endD.getTime() + dayDiff * 24 * 60 * 60 * 1000);
        newEndDate.setHours(12, 0, 0, 0);
      }

      await tx.update(dailyAssignments)
        .set({ date: newDate, endDate: newEndDate, sortOrder: 0, prePadding: prePadding !== undefined ? Math.max(0, prePadding) : 0, updatedAt: new Date() })
        .where(eq(dailyAssignments.id, id));

      const oldDayStart = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 0, 0, 0, 0);
      const oldDayEnd = new Date(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate(), 23, 59, 59, 999);
      const oldDayRows = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, oldDayStart), lte(dailyAssignments.date, oldDayEnd), not(eq(dailyAssignments.id, id))))
        .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt);
      for (let i = 0; i < oldDayRows.length; i++) {
        await tx.update(dailyAssignments).set({ sortOrder: i, updatedAt: new Date() }).where(eq(dailyAssignments.id, oldDayRows[i].id));
      }

      const newDayStart = new Date(targetDate);
      newDayStart.setHours(0, 0, 0, 0);
      const newDayEnd = new Date(targetDate);
      newDayEnd.setHours(23, 59, 59, 999);
      const newDayRows = await tx.select().from(dailyAssignments)
        .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, newDayStart), lte(dailyAssignments.date, newDayEnd)))
        .orderBy(dailyAssignments.sortOrder, dailyAssignments.createdAt);
      const filtered = newDayRows.filter(r => r.id !== id);
      const ci = Math.max(0, Math.min(toIndex, filtered.length));
      filtered.splice(ci, 0, { ...target, date: newDate, endDate: newEndDate, sortOrder: 0 } as any);
      for (let i = 0; i < filtered.length; i++) {
        await tx.update(dailyAssignments).set({ sortOrder: i, updatedAt: new Date() }).where(eq(dailyAssignments.id, filtered[i].id));
      }

      return true;
    });
  },

  async getNextSortOrderForDay(companyId: string, date: Date): Promise<number> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const rows = await db.select({ sortOrder: dailyAssignments.sortOrder })
      .from(dailyAssignments)
      .where(and(eq(dailyAssignments.companyId, companyId), gte(dailyAssignments.date, dayStart), lte(dailyAssignments.date, dayEnd)));
    if (rows.length === 0) return 0;
    return Math.max(...rows.map(r => r.sortOrder)) + 1;
  },

  async updateDailyAssignmentPrePadding(companyId: string, id: string, delta: number): Promise<DailyAssignment | undefined> {
    const [existing] = await db.select().from(dailyAssignments).where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)));
    if (!existing) return undefined;
    const newPrePadding = Math.max(0, existing.prePadding + delta);
    const [updated] = await db.update(dailyAssignments)
      .set({ prePadding: newPrePadding, updatedAt: new Date() })
      .where(and(eq(dailyAssignments.id, id), eq(dailyAssignments.companyId, companyId)))
      .returning();
    return updated || undefined;
  },
};
