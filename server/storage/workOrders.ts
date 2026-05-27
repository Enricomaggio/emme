import { db } from "../db";
import {
  workOrders,
  workOrderItems,
  quotes,
  quoteItems,
  type WorkOrder,
  type WorkOrderItem,
  type WorkOrderWithItems,
  type WorkOrderStatus,
} from "@shared/schema";
import { eq, and, sql, desc, isNotNull, isNull, inArray, or } from "drizzle-orm";

export const workOrdersStorage = {
  async getWorkOrderByOpportunity(
    opportunityId: string,
    companyId: string
  ): Promise<WorkOrderWithItems | null> {
    const [wo] = await db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.opportunityId, opportunityId),
          eq(workOrders.companyId, companyId)
        )
      );
    if (!wo) return null;
    const items = await db
      .select()
      .from(workOrderItems)
      .where(eq(workOrderItems.workOrderId, wo.id))
      .orderBy(workOrderItems.displayOrder);
    return { ...wo, items };
  },

  async getWorkOrder(
    id: string,
    companyId: string
  ): Promise<WorkOrderWithItems | null> {
    const [wo] = await db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.companyId, companyId)));
    if (!wo) return null;
    const items = await db
      .select()
      .from(workOrderItems)
      .where(eq(workOrderItems.workOrderId, wo.id))
      .orderBy(workOrderItems.displayOrder);
    return { ...wo, items };
  },

  async generateWorkOrderNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `NL-${year}-`;
    const result = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM work_orders WHERE company_id = ${companyId}`
    );
    const count = parseInt((result.rows[0] as any).cnt ?? "0", 10);
    return `${prefix}${String(count + 1).padStart(3, "0")}`;
  },

  async createWorkOrderFromQuote(
    companyId: string,
    opportunityId: string,
    quoteId: string
  ): Promise<WorkOrderWithItems> {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));
    const sourceItems = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId))
      .orderBy(quoteItems.displayOrder);

    const number = await workOrdersStorage.generateWorkOrderNumber(companyId);

    const [wo] = await db
      .insert(workOrders)
      .values({
        companyId,
        opportunityId,
        quoteId,
        number,
        subject: quote?.subject ?? null,
        notes: null,
        totalAmount: quote?.totalAmount ?? "0",
        status: "DRAFT",
      })
      .returning();

    let insertedItems: WorkOrderItem[] = [];
    if (sourceItems.length > 0) {
      // Filtra le righe interne (isInternalOnly) prima di creare le voci NL
      const clientItems = sourceItems.filter(
        item => !item.isInternalOnly
      );
      const woItemPayloads = clientItems.map((item, i) => {
        const qty = parseFloat(item.quantity ?? "0");
        // Usa clientTotal (colonna destra) se disponibile, altrimenti totalRow
        const clientRowTotal = item.clientTotal ?? item.totalRow ?? "0";
        // Prezzo unitario lato cliente
        const clientUnitPrice = (item.clientTotal && qty > 0)
          ? (parseFloat(item.clientTotal) / qty).toFixed(4)
          : (item.unitPriceApplied ?? "0");
        return {
          workOrderId: wo.id,
          description: item.description ?? "",
          unitOfMeasure: item.unitOfMeasure ?? "ml",
          quantity: item.quantity ?? "0",
          unitPrice: clientUnitPrice,
          totalRow: clientRowTotal,
          displayOrder: i,
          // Popola sourceQuoteItemId per il tracking SAL
          sourceQuoteItemId: item.id,
        };
      });
      insertedItems = await db
        .insert(workOrderItems)
        .values(woItemPayloads)
        .returning();
    }

    return { ...wo, items: insertedItems };
  },

  async createEmptyWorkOrder(
    companyId: string,
    opportunityId: string
  ): Promise<WorkOrderWithItems> {
    const number = await workOrdersStorage.generateWorkOrderNumber(companyId);
    const [wo] = await db
      .insert(workOrders)
      .values({
        companyId,
        opportunityId,
        quoteId: null,
        number,
        subject: null,
        notes: null,
        totalAmount: "0",
        status: "DRAFT",
      })
      .returning();
    return { ...wo, items: [] };
  },

  async updateWorkOrder(
    id: string,
    companyId: string,
    header: {
      subject?: string | null;
      notes?: string | null;
      totalAmount?: string;
      status?: WorkOrderStatus;
      sentAt?: Date | null;
      confirmedAt?: Date | null;
    },
    newItems?: Array<{
      description: string;
      unitOfMeasure: string;
      quantity: string;
      unitPrice: string;
      totalRow: string;
      displayOrder: number;
    }>
  ): Promise<WorkOrderWithItems | null> {
    const [wo] = await db
      .update(workOrders)
      .set({ ...header, updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.companyId, companyId)))
      .returning();
    if (!wo) return null;

    let savedItems: WorkOrderItem[];
    if (newItems !== undefined) {
      await db
        .delete(workOrderItems)
        .where(eq(workOrderItems.workOrderId, id));
      if (newItems.length > 0) {
        savedItems = await db
          .insert(workOrderItems)
          .values(
            newItems.map((item, i) => ({
              workOrderId: id,
              description: item.description,
              unitOfMeasure: item.unitOfMeasure,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalRow: item.totalRow,
              displayOrder: i,
            }))
          )
          .returning();
      } else {
        savedItems = [];
      }
    } else {
      savedItems = await db
        .select()
        .from(workOrderItems)
        .where(eq(workOrderItems.workOrderId, id))
        .orderBy(workOrderItems.displayOrder);
    }

    return { ...wo, items: savedItems };
  },

  async deleteWorkOrder(id: string, companyId: string): Promise<boolean> {
    const result = await db
      .delete(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  },

  async getWorkOrdersByOpportunity(
    opportunityId: string,
    companyId: string
  ): Promise<WorkOrderWithItems[]> {
    const woList = await db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.opportunityId, opportunityId), eq(workOrders.companyId, companyId)))
      .orderBy(workOrders.createdAt);
    if (woList.length === 0) return [];

    const woIds = woList.map(wo => wo.id);
    const allItems = await db
      .select()
      .from(workOrderItems)
      .where(inArray(workOrderItems.workOrderId, woIds))
      .orderBy(workOrderItems.displayOrder);

    const itemsByWoId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      if (!itemsByWoId.has(item.workOrderId)) itemsByWoId.set(item.workOrderId, []);
      itemsByWoId.get(item.workOrderId)!.push(item);
    }

    return woList.map(wo => ({ ...wo, items: itemsByWoId.get(wo.id) ?? [] }));
  },

  async getAllWorkOrdersByCompany(companyId: string): Promise<WorkOrderWithItems[]> {
    const woList = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.companyId, companyId))
      .orderBy(workOrders.createdAt);
    if (woList.length === 0) return [];

    const woIds = woList.map(wo => wo.id);
    const allItems = await db
      .select()
      .from(workOrderItems)
      .where(inArray(workOrderItems.workOrderId, woIds))
      .orderBy(workOrderItems.displayOrder);

    const itemsByWoId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      if (!itemsByWoId.has(item.workOrderId)) itemsByWoId.set(item.workOrderId, []);
      itemsByWoId.get(item.workOrderId)!.push(item);
    }

    return woList.map(wo => ({ ...wo, items: itemsByWoId.get(wo.id) ?? [] }));
  },

  async registerInvoice(
    id: string,
    companyId: string,
    invoicedAmount: string,
    invoicedAt: Date
  ): Promise<WorkOrder | null> {
    const [wo] = await db
      .update(workOrders)
      .set({ invoicedAmount, invoicedAt, updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.companyId, companyId)))
      .returning();
    return wo ?? null;
  },

  async getSal(
    opportunityId: string,
    companyId: string
  ): Promise<{
    opportunityId: string;
    quoteId: string | null;
    rows: Array<{
      quoteItemId: string;
      type: string;
      description: string;
      unitOfMeasure: string;
      unitPrice: string;
      quantityPreventivo: string;
      totalPreventivo: string;
      quantityFatturata: string;
      totalFatturato: string;
      quantityResiduo: string;
      totalResiduo: string;
    }>;
    totals: {
      totalPreventivo: string;
      totalFatturato: string;
      totalResiduo: string;
      percentualeFatturata: string;
    };
  }> {
    const emptyResult = {
      opportunityId,
      quoteId: null as string | null,
      rows: [] as Array<{
        quoteItemId: string;
        type: string;
        description: string;
        unitOfMeasure: string;
        unitPrice: string;
        quantityPreventivo: string;
        totalPreventivo: string;
        quantityFatturata: string;
        totalFatturato: string;
        quantityResiduo: string;
        totalResiduo: string;
      }>,
      totals: {
        totalPreventivo: "0",
        totalFatturato: "0",
        totalResiduo: "0",
        percentualeFatturata: "0",
      },
    };

    const allQuotes = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.opportunityId, opportunityId), eq(quotes.companyId, companyId)))
      .orderBy(desc(quotes.createdAt));

    if (allQuotes.length === 0) return emptyResult;

    const woStatuses = new Set(["WORK_ORDER_DRAFT", "WORK_ORDER_SENT", "WORK_ORDER_CONFIRMED"]);
    const mainQuote =
      allQuotes.find(q => q.status === "ACCEPTED") ??
      allQuotes.find(q => !woStatuses.has(q.status)) ??
      allQuotes[0];

    const items = await db
      .select()
      .from(quoteItems)
      .where(
        and(
          eq(quoteItems.quoteId, mainQuote.id),
          or(eq(quoteItems.isInternalOnly, false), isNull(quoteItems.isInternalOnly))
        )
      )
      .orderBy(quoteItems.displayOrder);

    if (items.length === 0) return { ...emptyResult, quoteId: mainQuote.id };

    const itemIds = items.map(i => i.id);
    const itemIdSet = new Set(itemIds);

    // Recupera tutte le righe NL fatturate per questa opportunity (filtro su opportunityId,
    // più robusto di inArray su colonna nullable che può generare SQL problematico).
    // Il filtraggio per sourceQuoteItemId avviene in application code.
    const invoicedWoItems = await db
      .select({
        sourceQuoteItemId: workOrderItems.sourceQuoteItemId,
        quantity: workOrderItems.quantity,
        totalRow: workOrderItems.totalRow,
      })
      .from(workOrderItems)
      .innerJoin(workOrders, eq(workOrderItems.workOrderId, workOrders.id))
      .where(
        and(
          eq(workOrders.opportunityId, opportunityId),
          eq(workOrders.companyId, companyId),
          isNotNull(workOrders.invoicedAt)
        )
      );

    const invoicedByItem = new Map<string, { qty: number; total: number }>();
    for (const woItem of invoicedWoItems) {
      const sid = woItem.sourceQuoteItemId;
      // Considera solo righe NL con sourceQuoteItemId che appartiene al preventivo corrente
      if (!sid || !itemIdSet.has(sid)) continue;
      const existing = invoicedByItem.get(sid) ?? { qty: 0, total: 0 };
      existing.qty += parseFloat(woItem.quantity ?? "0");
      existing.total += parseFloat(woItem.totalRow ?? "0");
      invoicedByItem.set(sid, existing);
    }

    let totalPreventivo = 0;
    let totalFatturato = 0;

    const rows = items.map(item => {
      const qtyPrev = parseFloat(item.quantity ?? "0");
      // Usa clientTotal (colonna destra = manodopera spalmata sul cliente)
      // se disponibile, altrimenti fallback su totalRow (colonna sinistra interna)
      const totalPrev = parseFloat(item.clientTotal ?? item.totalRow ?? "0");
      const inv = invoicedByItem.get(item.id) ?? { qty: 0, total: 0 };
      const qtyFatt = inv.qty;
      const totalFatt = inv.total;
      const qtyRes = Math.max(0, qtyPrev - qtyFatt);
      const totalRes = Math.max(0, totalPrev - totalFatt);

      totalPreventivo += totalPrev;
      totalFatturato += totalFatt;

      // Prezzo unitario effettivo lato cliente:
      // se clientTotal è disponibile si ricava dividendo per la quantità,
      // altrimenti si usa unitPriceApplied (prezzo base senza spalma)
      const clientUnitPrice = (item.clientTotal && qtyPrev > 0)
        ? (parseFloat(item.clientTotal) / qtyPrev).toFixed(4)
        : (item.unitPriceApplied ?? "0");

      return {
        quoteItemId: item.id,
        type: item.type ?? "MANUALE",
        description: item.description ?? "",
        unitOfMeasure: item.unitOfMeasure ?? "",
        unitPrice: clientUnitPrice,
        quantityPreventivo: qtyPrev.toString(),
        totalPreventivo: totalPrev.toFixed(2),
        quantityFatturata: parseFloat(qtyFatt.toFixed(4)).toString(),
        totalFatturato: totalFatt.toFixed(2),
        quantityResiduo: parseFloat(qtyRes.toFixed(4)).toString(),
        totalResiduo: totalRes.toFixed(2),
      };
    });

    const totalResiduo = Math.max(0, totalPreventivo - totalFatturato);
    const percentualeFatturata =
      totalPreventivo > 0
        ? ((totalFatturato / totalPreventivo) * 100).toFixed(1)
        : "0";

    return {
      opportunityId,
      quoteId: mainQuote.id,
      rows,
      totals: {
        totalPreventivo: totalPreventivo.toFixed(2),
        totalFatturato: totalFatturato.toFixed(2),
        totalResiduo: totalResiduo.toFixed(2),
        percentualeFatturata,
      },
    };
  },

  async createWorkOrderFromSelection(
    companyId: string,
    opportunityId: string,
    quoteId: string,
    items: Array<{
      sourceQuoteItemId: string;
      description: string;
      unitOfMeasure: string;
      quantity: string;
      unitPrice: string;
      totalRow: string;
    }>
  ): Promise<WorkOrderWithItems> {
    const number = await workOrdersStorage.generateWorkOrderNumber(companyId);
    const totalAmount = items
      .reduce((sum, item) => sum + parseFloat(item.totalRow || "0"), 0)
      .toFixed(2);

    const [wo] = await db
      .insert(workOrders)
      .values({
        companyId,
        opportunityId,
        quoteId,
        number,
        subject: null,
        notes: null,
        totalAmount,
        status: "DRAFT",
      })
      .returning();

    let insertedItems: WorkOrderItem[] = [];
    if (items.length > 0) {
      insertedItems = await db
        .insert(workOrderItems)
        .values(
          items.map((item, i) => ({
            workOrderId: wo.id,
            description: item.description,
            unitOfMeasure: item.unitOfMeasure,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalRow: item.totalRow,
            displayOrder: i,
            sourceQuoteItemId: item.sourceQuoteItemId,
          }))
        )
        .returning();
    }

    return { ...wo, items: insertedItems };
  },
};
