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
import { eq, and, sql } from "drizzle-orm";

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
      const woItemPayloads = sourceItems.map((item, i) => ({
        workOrderId: wo.id,
        description: item.description ?? "",
        unitOfMeasure: item.unitOfMeasure ?? "ml",
        quantity: item.quantity ?? "0",
        unitPrice: item.unitPriceApplied ?? "0",
        totalRow: item.totalRow ?? "0",
        displayOrder: i,
      }));
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
    const results: WorkOrderWithItems[] = [];
    for (const wo of woList) {
      const items = await db
        .select()
        .from(workOrderItems)
        .where(eq(workOrderItems.workOrderId, wo.id))
        .orderBy(workOrderItems.displayOrder);
      results.push({ ...wo, items });
    }
    return results;
  },

  async getAllWorkOrdersByCompany(companyId: string): Promise<WorkOrderWithItems[]> {
    const woList = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.companyId, companyId))
      .orderBy(workOrders.createdAt);
    if (woList.length === 0) return [];
    const results: WorkOrderWithItems[] = [];
    for (const wo of woList) {
      const items = await db
        .select()
        .from(workOrderItems)
        .where(eq(workOrderItems.workOrderId, wo.id))
        .orderBy(workOrderItems.displayOrder);
      results.push({ ...wo, items });
    }
    return results;
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
};
