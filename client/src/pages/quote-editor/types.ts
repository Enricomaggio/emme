import type { QuoteItemType } from "@shared/schema";

export interface QuoteItemDraft {
  uid: string; // local id (for list ops)
  type: QuoteItemType;
  description: string;
  // LATTONERIA
  materialId?: string;
  materialThicknessId?: string;
  materialFinishId?: string;
  developmentCm?: string;
  // ARTICOLO
  catalogArticleId?: string;
  // GIORNATE
  laborRateId?: string;
  // MANUALE
  unitCost?: string;
  quantity: string;
  marginPercent?: string; // optional override
  // Sconto riga
  discountPercent?: string;
  overrideTotal?: string | null;
  // For display only — frozen on saved items
  unitOfMeasure?: string | null;
  baseTotal?: string | null; // prezzo calcolato prima di sconto/override
  totalRow?: string | null;
  // Cost/margin data for live summary panel
  costRow?: string | null;
  effectiveMargin?: string | null;
  // LATTONERIA: cost per kg stored at save time (€/kg)
  unitCostPerKg?: string | null;
}

export type QuoteItemPayload =
  | {
      type: "LATTONERIA";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
      materialId: string;
      materialThicknessId: string;
      materialFinishId?: string;
      developmentCm: string;
    }
  | {
      type: "ARTICOLO";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
      catalogArticleId: string;
    }
  | {
      type: "GIORNATE";
      description: string | null;
      quantity: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
      laborRateId: string;
    }
  | {
      type: "MANUALE";
      description: string;
      unitOfMeasure: string;
      quantity: string;
      unitCost: string;
      marginPercent?: string;
      discountPercent?: string;
      overrideTotal?: string | null;
    };

export interface QuoteSavePayload {
  subject: string | null;
  notes: string | null;
  number?: string;
  items: QuoteItemPayload[];
  globalDiscount?: { mode: "percent" | "euro"; value: number } | undefined;
}

export interface QuoteResponse {
  id: string;
  number: string;
  opportunityId: string;
  status: string;
  totalAmount: string;
  subject: string | null;
  notes: string | null;
  createdAt: string;
  discounts?: {
    globalDiscountMode?: "percent" | "euro";
    globalDiscountPercent?: number;
    globalDiscountAmount?: number;
  } | null;
  items: Array<{
    id: string;
    type: QuoteItemType | null;
    materialId: string | null;
    materialThicknessId: string | null;
    materialFinishId: string | null;
    catalogArticleId: string | null;
    laborRateId: string | null;
    description: string | null;
    unitOfMeasure: string | null;
    developmentCm: string | null;
    quantity: string;
    unitCost: string | null;
    weightKg: string | null;
    marginPercent: string | null;
    discountPercent: string | null;
    overrideTotal: string | null;
    baseTotal: string | null;
    unitPriceApplied: string;
    totalRow: string;
    displayOrder: number;
  }>;
}
