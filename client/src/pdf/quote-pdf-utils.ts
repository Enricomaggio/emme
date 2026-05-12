import type { QuoteItemType } from "@shared/schema";

export interface PdfQuoteItem {
  id: string;
  type: QuoteItemType | null;
  description: string | null;
  unitOfMeasure: string | null;
  developmentMm: string | null;
  quantity: string;
  unitPriceApplied: string;
  totalRow: string;
  displayOrder: number;
  // Discount / override pricing
  discountPercent?: string | null;
  overrideTotal?: string | null;
  baseTotal?: string | null;
  // Snapshot names from related catalog data (resolved at PDF time)
  resolvedName?: string;
}

export interface PdfQuote {
  id: string;
  number: string;
  subject: string | null;
  notes: string | null;
  totalAmount: string;
  createdAt: string | Date;
  items: PdfQuoteItem[];
}

export interface PdfCustomer {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  address?: string | null;
  city?: string | null;
  zipCode?: string | null;
  province?: string | null;
  vatNumber?: string | null;
  fiscalCode?: string | null;
  email?: string | null;
  phone?: string | null;
  entityType?: string | null;
  firstReferentName?: string | null;
  firstReferentEmail?: string | null;
  firstReferentPhone?: string | null;
}

export function fmt(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  if (!isFinite(v as number)) return "0,00";
  return (v as number).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function customerDisplayName(c: PdfCustomer | null | undefined): string {
  if (!c) return "—";
  if (c.entityType === "PRIVATE") {
    const fn = (c.firstName || "").trim();
    const ln = (c.lastName || "").trim();
    const full = `${fn} ${ln}`.trim();
    return full || c.name || "—";
  }
  return c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "—";
}

export function customerAddressLine(c: PdfCustomer | null | undefined): string {
  if (!c) return "";
  const parts: string[] = [];
  if (c.address) parts.push(c.address);
  const cap = [c.zipCode, c.city].filter(Boolean).join(" ").trim();
  if (cap) parts.push(cap);
  if (c.province) parts.push(`(${c.province})`);
  return parts.join(", ");
}

function fmtMeasure(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  if (!isFinite(v as number)) return "0";
  return (v as number).toLocaleString("it-IT", { maximumFractionDigits: 4 });
}

export function buildItemDescription(it: PdfQuoteItem): string {
  const base = it.resolvedName || it.description || "";
  if (it.type === "LATTONERIA" && it.developmentMm) {
    const dev = parseFloat(it.developmentMm);
    if (isFinite(dev) && dev > 0) {
      return `${base}${base ? " — " : ""}sviluppo ${fmtMeasure(dev)} mm`;
    }
  }
  return base || "—";
}

export function formatQty(it: PdfQuoteItem): string {
  const q = parseFloat(it.quantity) || 0;
  const unit = it.unitOfMeasure || (it.type === "LATTONERIA" ? "ml" : it.type === "GIORNATE" ? "gg" : "pz");
  return `${q.toLocaleString("it-IT", { maximumFractionDigits: 4 })} ${unit}`;
}

export function computeTotals(quote: PdfQuote, vatPercent = 22) {
  const persisted = parseFloat(quote.totalAmount || "0");
  const fromItems = quote.items.reduce((s, it) => s + (parseFloat(it.totalRow) || 0), 0);
  const subtotale =
    Number.isFinite(persisted) && persisted > 0 ? persisted : fromItems;
  const iva = (subtotale * vatPercent) / 100;
  const totale = subtotale + iva;
  return { subtotale, iva, totale, vatPercent };
}

export function applyTemplate(
  template: string | null | undefined,
  vars: Record<string, string | number | null | undefined>,
): string {
  let out = template || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v == null ? "" : String(v));
  }
  return out;
}
