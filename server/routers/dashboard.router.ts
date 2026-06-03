import { Router } from "express";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import { sql } from "drizzle-orm";

export const dashboardRouter = Router();

// La soglia regime forfettario 2026.
const FORFETTARIO_THRESHOLD = 100_000;

// GET /api/dashboard — KPI principale EMME
// Tutti gli importi sono in € e calcolati per anno solare corrente.
dashboardRouter.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const now = new Date();
    const year = req.query.year ? parseInt(req.query.year as string, 10) : now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // ============ KPI MILESTONE ============
    // Fatturato anno: somma milestone con invoice_date nell'anno e status invoiced o paid
    const invoicedYTD = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total
      FROM opportunity_milestones
      WHERE status IN ('invoiced', 'paid')
        AND invoice_date >= ${startOfYear}
        AND invoice_date <= ${endOfYear}
    `);

    // Incassato anno: milestone con payment_date nell'anno e status paid
    const paidYTD = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total
      FROM opportunity_milestones
      WHERE status = 'paid'
        AND payment_date >= ${startOfYear}
        AND payment_date <= ${endOfYear}
    `);

    // Da fatturare: milestone pending su opportunità in stadi post-firma o chiusi
    const toInvoice = await db.execute(sql`
      SELECT COALESCE(SUM(om.amount), 0)::numeric AS total
      FROM opportunity_milestones om
      JOIN opportunities o ON o.id = om.opportunity_id
      LEFT JOIN pipeline_stages ps ON ps.id = o.stage_id
      WHERE om.status = 'pending'
        AND ps.name IN ('Contratto firmato', 'In sviluppo', 'Completato')
    `);

    // Da incassare: milestone invoiced ma non paid (a prescindere dallo stadio)
    const toCollect = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total
      FROM opportunity_milestones
      WHERE status = 'invoiced'
    `);

    // ============ VALORE PIPELINE PER STADIO ============
    // Per ogni stadio, somma valore e conteggio delle opportunità che ci stanno dentro
    // (coerente con la pipeline UI: nessun filtro su wonAt/lostAt).
    const pipelineByStage = await db.execute(sql`
      SELECT ps.id, ps.name, ps."order", ps.color,
             COUNT(o.id)::int AS opportunity_count,
             COALESCE(SUM(o.value), 0)::numeric AS total_value
      FROM pipeline_stages ps
      LEFT JOIN opportunities o ON o.stage_id = ps.id
      GROUP BY ps.id, ps.name, ps."order", ps.color
      ORDER BY ps."order"
    `);

    // ============ SCADENZE IMMINENTI ============
    // Milestone con invoice_date o payment_date nei prossimi 60 giorni.
    const upcomingDeadlines = await db.execute(sql`
      SELECT om.id, om.opportunity_id, om.amount, om.description,
             om.invoice_date, om.payment_date, om.status,
             o.title AS opportunity_title,
             l.id AS lead_id, l.name AS lead_name, l.first_name, l.last_name, l.entity_type
      FROM opportunity_milestones om
      JOIN opportunities o ON o.id = om.opportunity_id
      LEFT JOIN leads l ON l.id = o.lead_id
      WHERE om.status != 'paid'
        AND (
          (om.invoice_date >= ${now} AND om.invoice_date <= ${in60Days} AND om.status = 'pending')
          OR
          (om.payment_date >= ${now} AND om.payment_date <= ${in60Days} AND om.status IN ('pending', 'invoiced'))
        )
      ORDER BY
        LEAST(
          COALESCE(om.invoice_date, om.payment_date),
          COALESCE(om.payment_date, om.invoice_date)
        )
      LIMIT 50
    `);

    // ============ COUNT CLIENTI/OPPORTUNITÀ ============
    // I conteggi usano lo stadio corrente (coerente con la pipeline UI), non i flag wonAt/lostAt.
    const counts = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM leads)::int AS leads_total,
        (SELECT COUNT(*)
         FROM opportunities o
         LEFT JOIN pipeline_stages ps ON ps.id = o.stage_id
         WHERE ps.name IS NULL OR ps.name NOT IN ('Completato', 'Persa'))::int AS opportunities_open,
        (SELECT COUNT(*)
         FROM opportunities o
         JOIN pipeline_stages ps ON ps.id = o.stage_id
         WHERE ps.name = 'Completato')::int AS opportunities_won
    `);

    const num = (v: unknown) => parseFloat(String(v ?? "0"));

    const invoicedTotal = num(invoicedYTD.rows[0]?.total);
    const paidTotal = num(paidYTD.rows[0]?.total);
    const toInvoiceTotal = num(toInvoice.rows[0]?.total);
    const toCollectTotal = num(toCollect.rows[0]?.total);
    const forfettarioPercent = Math.min(100, Math.round((invoicedTotal / FORFETTARIO_THRESHOLD) * 100));

    res.json({
      year,
      invoicedYTD: invoicedTotal,
      paidYTD: paidTotal,
      toInvoice: toInvoiceTotal,
      toCollect: toCollectTotal,
      forfettario: {
        threshold: FORFETTARIO_THRESHOLD,
        used: invoicedTotal,
        remaining: Math.max(0, FORFETTARIO_THRESHOLD - invoicedTotal),
        percent: forfettarioPercent,
        alert: forfettarioPercent >= 80,
      },
      pipelineByStage: pipelineByStage.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        order: r.order,
        color: r.color,
        opportunityCount: r.opportunity_count,
        totalValue: num(r.total_value),
      })),
      upcomingDeadlines: upcomingDeadlines.rows.map((r: any) => {
        const leadName = r.entity_type === "COMPANY"
          ? r.lead_name || ""
          : `${r.first_name || ""} ${r.last_name || ""}`.trim();
        return {
          id: r.id,
          opportunityId: r.opportunity_id,
          opportunityTitle: r.opportunity_title,
          leadId: r.lead_id,
          leadName,
          amount: num(r.amount),
          description: r.description,
          invoiceDate: r.invoice_date,
          paymentDate: r.payment_date,
          status: r.status,
        };
      }),
      counts: {
        leadsTotal: (counts.rows[0] as any).leads_total,
        opportunitiesOpen: (counts.rows[0] as any).opportunities_open,
        opportunitiesWon: (counts.rows[0] as any).opportunities_won,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    res.status(500).json({ message: "Errore nel recupero della dashboard" });
  }
});
