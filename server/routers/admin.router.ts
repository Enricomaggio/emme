import { Router } from "express";
import { storage } from "../storage";
import { resolveUserCompany } from "../utils/accessContext";
import { isAuthenticated, requireRole } from "../auth";
import { db } from "../db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import {
  opportunities,
  leads as leadsTable,
  quotes,
  articles as articlesTable,
} from "@shared/schema";

export const adminRouter = Router();

// ============ SALES TARGETS (Obiettivi mensili per venditore) ============

// GET /sales-targets?month=&year=
// Restituisce tutti i target del mese con totali reali calcolati da quotes e opportunities
// Solo admin può vedere i target di tutti i venditori
adminRouter.get("/sales-targets", isAuthenticated, async (req, res) => {
  try {
    // Solo admin può accedere ai target di tutti i venditori
    if (req.user!.role !== "COMPANY_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono vedere gli obiettivi del team" });
    }

    const userCompany = await storage.getUserCompany(req.user!.id);
    if (!userCompany?.companyId) {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }
    const companyId = userCompany.companyId;

    const monthParam = parseInt(req.query.month as string);
    const yearParam = parseInt(req.query.year as string);
    const startDateParam = req.query.startDate as string | undefined;
    const endDateParam = req.query.endDate as string | undefined;
    const proportionalParam = req.query.proportional === "true";
    const now = new Date();
    const month = isNaN(monthParam) ? now.getMonth() + 1 : monthParam;
    const year = isNaN(yearParam) ? now.getFullYear() : yearParam;

    // Recupera tutti i venditori (SALES_AGENT) dell'azienda
    const teamUsers = await storage.getUsersByCompanyId(companyId);
    const salesAgents = teamUsers.filter(u => u.role === "SALES_AGENT");

    // Calcola inizio e fine del mese (default per filtri mese singolo)
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const today = new Date();
    const monthDays = new Date(year, month, 0).getDate();
    const daysTotal = monthDays;
    const daysElapsed = today < startOfMonth
      ? 0
      : today > endOfMonth
        ? daysTotal
        : today.getDate();

    // Se startDate/endDate sono forniti, usarli per il calcolo degli effettivi
    let periodStart = startOfMonth;
    let periodEnd = endOfMonth;
    let periodDays = monthDays;

    if (startDateParam && endDateParam) {
      periodStart = new Date(startDateParam);
      periodEnd = new Date(endDateParam);
      // Normalize to midnight to avoid time-of-day skew
      const startMidnight = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
      const endMidnight = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
      const msPerDay = 1000 * 60 * 60 * 24;
      periodDays = Math.floor((endMidnight.getTime() - startMidnight.getTime()) / msPerDay) + 1;
    }

    // Recupera i target:
    // - proportional=true (quarter/year/custom): somma i target di tutti i mesi coperti,
    //   con proporzione per mesi parziali (giorni sovrapposti / giorni del mese).
    //   Questo include custom su singolo mese parziale.
    // - last-week / last-month: startDate/endDate presenti ma proportional=false;
    //   il backend restituisce il target mensile intero; il frontend scala per last-week.
    // - Altrimenti: usa getSalesTargets per il mese/anno selezionato (single-month exact).
    let targetsByUser: Map<string, { quoteTarget: number; wonTarget: number }>;

    if (proportionalParam && startDateParam && endDateParam) {
      const allRangeTargets = await storage.getSalesTargetsForRange(companyId, periodStart, periodEnd);
      targetsByUser = new Map();

      // For each month in the range, compute proportional contribution
      const cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
      const rangeEndMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
      while (cursor <= rangeEndMonth) {
        const curYear = cursor.getFullYear();
        const curMonth = cursor.getMonth() + 1;
        const daysInMonth = new Date(curYear, curMonth, 0).getDate();
        // Compute overlap between this calendar month and the requested period
        const monthStart = new Date(curYear, curMonth - 1, 1);
        const monthEnd = new Date(curYear, curMonth, 0, 23, 59, 59, 999);
        const overlapStart = periodStart > monthStart ? periodStart : monthStart;
        const overlapEnd = periodEnd < monthEnd ? periodEnd : monthEnd;
        // Compute overlap in whole days
        const overlapStartMidnight = new Date(overlapStart.getFullYear(), overlapStart.getMonth(), overlapStart.getDate());
        const overlapEndMidnight = new Date(overlapEnd.getFullYear(), overlapEnd.getMonth(), overlapEnd.getDate());
        const overlapDays = Math.floor((overlapEndMidnight.getTime() - overlapStartMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const proportion = daysInMonth > 0 ? Math.min(overlapDays, daysInMonth) / daysInMonth : 0;

        const monthTargets = allRangeTargets.filter(t => t.month === curMonth && t.year === curYear);
        for (const t of monthTargets) {
          const existing = targetsByUser.get(t.userId) ?? { quoteTarget: 0, wonTarget: 0 };
          existing.quoteTarget += parseFloat(t.quoteTarget ?? "0") * proportion;
          existing.wonTarget += parseFloat(t.wonTarget ?? "0") * proportion;
          targetsByUser.set(t.userId, existing);
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      // Single-month: recupera i target salvati per questo mese/anno
      const targets = await storage.getSalesTargets(companyId, month, year);
      targetsByUser = new Map(targets.map(t => ({
        [t.userId]: {
          quoteTarget: parseFloat(t.quoteTarget ?? "0"),
          wonTarget: parseFloat(t.wonTarget ?? "0"),
        }
      })).flatMap(o => Object.entries(o)) as [string, { quoteTarget: number; wonTarget: number }][]);
    }

    // Recupera tutte le opportunità dell'azienda per il calcolo dei totali
    const allOpportunities = await db
      .select({
        id: opportunities.id,
        value: opportunities.value,
        assignedToUserId: opportunities.assignedToUserId,
        stageId: opportunities.stageId,
        wonAt: opportunities.wonAt,
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .where(eq(opportunities.companyId, companyId));

    // Recupera gli stage per identificare "Vinto"
    const stages = await storage.getStagesByCompany(companyId);
    const vintoStage = stages.find(s => s.name.toLowerCase() === "vinto");

    // Recupera preventivi creati nel periodo per venditore
    const monthQuotes = await db
      .select({
        id: quotes.id,
        totalAmount: quotes.totalAmount,
        opportunityId: quotes.opportunityId,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(and(
        eq(quotes.companyId, companyId),
        gte(quotes.createdAt, periodStart),
        lte(quotes.createdAt, periodEnd)
      ));

    // Mappa opportunità per id per lookup veloce
    const oppMap = new Map(allOpportunities.map(o => [o.id, o]));

    // Calcola totali per venditore
    const sellerResults = salesAgents.map(agent => {
      const agentTargets = targetsByUser.get(agent.id) ?? { quoteTarget: 0, wonTarget: 0 };

      // Totale preventivi fatti (sum totalAmount dei quotes creati nel periodo per questo venditore)
      const agentQuotes = monthQuotes.filter(q => {
        const opp = oppMap.get(q.opportunityId);
        return opp?.assignedToUserId === agent.id;
      });
      const quotesTotal = agentQuotes.reduce((sum, q) => sum + parseFloat(q.totalAmount ?? "0"), 0);

      // Totale acquisiti (sum value delle opportunità vinte nel periodo per questo venditore)
      const wonTotal = allOpportunities
        .filter(o => {
          if (o.assignedToUserId !== agent.id) return false;
          if (!vintoStage || o.stageId !== vintoStage.id) return false;
          if (!o.wonAt) return false;
          const wonDate = new Date(o.wonAt);
          return wonDate >= periodStart && wonDate <= periodEnd;
        })
        .reduce((sum, o) => sum + parseFloat(o.value ?? "0"), 0);

      return {
        userId: agent.id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        displayName: agent.displayName,
        quoteTarget: Math.round(agentTargets.quoteTarget),
        wonTarget: Math.round(agentTargets.wonTarget),
        quotesTotal,
        wonTotal,
      };
    });

    res.json({
      month,
      year,
      daysElapsed,
      daysTotal,
      periodDays,
      monthDays,
      sellers: sellerResults,
    });
  } catch (error: any) {
    console.error("[sales-targets] GET error:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET /sales-targets/my - Target del venditore corrente per il mese corrente
adminRouter.get("/sales-targets/my", isAuthenticated, async (req, res) => {
  try {
    const userCompany = await storage.getUserCompany(req.user!.id);
    if (!userCompany?.companyId) {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }
    const companyId = userCompany.companyId;
    const userId = req.user!.id;

    const now = new Date();

    const parseLocalDate = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const customStart = req.query.startDate ? parseLocalDate(req.query.startDate as string) : null;
    const _endBase = req.query.endDate ? parseLocalDate(req.query.endDate as string) : null;
    const customEnd = _endBase ? new Date(_endBase.getFullYear(), _endBase.getMonth(), _endBase.getDate(), 23, 59, 59, 999) : null;

    const rangeStart = customStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = customEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // For multi-month ranges (quarter, year), use the current month if today
    // falls within the range; otherwise use the last month of the range.
    const targetRef = (now >= rangeStart && now <= rangeEnd) ? now : rangeEnd;
    const month = targetRef.getMonth() + 1;
    const year = targetRef.getFullYear();

    const startOfMonth = rangeStart;
    const endOfMonth = rangeEnd;
    const daysTotal = customStart && customEnd
      ? Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24))
      : new Date(year, month, 0).getDate();
    const daysElapsed = customStart && customEnd
      ? Math.min(daysTotal, Math.ceil((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)))
      : now.getDate();

    const target = await storage.getSalesTarget(companyId, userId, month, year);

    // Recupera stages per trovare "Vinto"
    const stages = await storage.getStagesByCompany(companyId);
    const vintoStage = stages.find(s => s.name.toLowerCase() === "vinto");

    // Quotes dell'utente nel mese corrente
    const userOpportunities = await db
      .select({ id: opportunities.id, value: opportunities.value, stageId: opportunities.stageId, wonAt: opportunities.wonAt })
      .from(opportunities)
      .where(and(eq(opportunities.companyId, companyId), eq(opportunities.assignedToUserId, userId)));

    const userOppIds = new Set(userOpportunities.map(o => o.id));

    const monthQuotes = await db
      .select({ id: quotes.id, totalAmount: quotes.totalAmount, opportunityId: quotes.opportunityId })
      .from(quotes)
      .where(and(
        eq(quotes.companyId, companyId),
        gte(quotes.createdAt, startOfMonth),
        lte(quotes.createdAt, endOfMonth)
      ));

    const quotesTotal = monthQuotes
      .filter(q => userOppIds.has(q.opportunityId))
      .reduce((sum, q) => sum + parseFloat(q.totalAmount ?? "0"), 0);

    const wonTotal = userOpportunities
      .filter(o => {
        if (!vintoStage || o.stageId !== vintoStage.id) return false;
        if (!o.wonAt) return false;
        const wonDate = new Date(o.wonAt);
        return wonDate >= startOfMonth && wonDate <= endOfMonth;
      })
      .reduce((sum, o) => sum + parseFloat(o.value ?? "0"), 0);

    res.json({
      month,
      year,
      daysElapsed,
      daysTotal,
      quoteTarget: parseFloat(target?.quoteTarget ?? "0"),
      wonTarget: parseFloat(target?.wonTarget ?? "0"),
      quotesTotal,
      wonTotal,
    });
  } catch (error: any) {
    console.error("[sales-targets] GET /my error:", error);
    res.status(500).json({ message: error.message });
  }
});

// Shared handler for POST and PUT /sales-targets - Imposta o aggiorna un obiettivo (solo admin)
const upsertSalesTargetHandler = async (req: any, res: any) => {
  try {
    // Solo admin può scrivere
    if (req.user!.role !== "COMPANY_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Solo gli amministratori possono impostare gli obiettivi" });
    }

    const userCompany = await storage.getUserCompany(req.user!.id);
    if (!userCompany?.companyId) {
      return res.status(403).json({ message: "Nessuna azienda associata" });
    }

    const companyId = userCompany.companyId;
    const { userId, month, year, quoteTarget, wonTarget } = req.body;

    if (!userId || !month || !year) {
      return res.status(400).json({ message: "userId, month e year sono obbligatori" });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: "month deve essere un numero tra 1 e 12" });
    }
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({ message: "year non valido" });
    }

    // Verifica che userId appartenga alla stessa azienda e sia un venditore
    const teamUsers = await storage.getUsersByCompanyId(companyId);
    const targetUser = teamUsers.find(u => u.id === userId);
    if (!targetUser) {
      return res.status(400).json({ message: "Utente non trovato nell'azienda" });
    }
    if (targetUser.role !== "SALES_AGENT" && targetUser.role !== "COMPANY_ADMIN") {
      return res.status(400).json({ message: "Gli obiettivi possono essere impostati solo per venditori" });
    }

    const target = await storage.upsertSalesTarget({
      companyId,
      userId,
      month: monthNum,
      year: yearNum,
      quoteTarget: String(parseFloat(String(quoteTarget)) || 0),
      wonTarget: String(parseFloat(String(wonTarget)) || 0),
    });

    res.json(target);
  } catch (error: any) {
    console.error("[sales-targets] upsert error:", error);
    res.status(500).json({ message: error.message });
  }
};

adminRouter.post("/sales-targets", isAuthenticated, upsertSalesTargetHandler);
adminRouter.put("/sales-targets", isAuthenticated, upsertSalesTargetHandler);

