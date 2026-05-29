import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Company } from "@shared/schema";
import { fmt } from "./quote-pdf-utils";

const COLORS = {
  text: "#1a1a1a",
  muted: "#6b6b6b",
  border: "#dcdcdc",
  rowAlt: "#f6f6f6",
  headerBg: "#1f2937",
  headerText: "#ffffff",
  accent: "#d97706",
  cardBg: "#fafafa",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.text,
    paddingTop: 110,
    paddingBottom: 70,
    paddingLeft: 36,
    paddingRight: 36,
  },
  header: {
    position: "absolute",
    top: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: "contain",
    marginRight: 14,
  },
  logoFallback: {
    width: 60,
    height: 60,
    backgroundColor: COLORS.headerBg,
    color: COLORS.headerText,
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 18,
    marginRight: 14,
  },
  companyInfo: { flex: 1 },
  companyName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  companyMeta: {
    fontSize: 8,
    color: COLORS.muted,
    lineHeight: 1.4,
  },
  titleBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: COLORS.text,
  },
  titleMeta: {
    fontSize: 9,
    color: COLORS.muted,
    textAlign: "right",
    lineHeight: 1.4,
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
    padding: 10,
    marginBottom: 10,
    borderRadius: 3,
  },
  cardTitle: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  cardLine: { marginBottom: 1 },
  itemsTable: {
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 3,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.headerBg,
    color: COLORS.headerText,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tableRowAlt: { backgroundColor: COLORS.rowAlt },
  col: { paddingHorizontal: 2 },
  colDesc: { flex: 3 },
  colQty: { flex: 1.5, textAlign: "right" },
  colUnit: { flex: 1.5, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totalsBlock: {
    alignSelf: "flex-end",
    width: "55%",
    marginBottom: 10,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsLabel: { color: COLORS.muted },
  totalsValue: { textAlign: "right" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 8,
    backgroundColor: COLORS.headerBg,
    color: COLORS.headerText,
  },
  grandTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  disclaimer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    fontSize: 7.5,
    color: COLORS.muted,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    fontSize: 7.5,
    color: COLORS.muted,
    lineHeight: 1.4,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export const DEFAULT_WO_DISCLAIMER =
  "Salvo contestazioni scritte entro 10 giorni dal ricevimento, la presente nota lavori si intende accettata e sarà emessa regolare fattura.";

function safeDate(d: string | Date | undefined | null): string {
  if (!d) return format(new Date(), "dd MMMM yyyy", { locale: it });
  try {
    const dd = typeof d === "string" ? new Date(d) : d;
    return format(dd, "dd MMMM yyyy", { locale: it });
  } catch {
    return "";
  }
}

export interface WorkOrderPdfItem {
  id: string;
  description: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  totalRow: string;
  displayOrder: number;
}

export interface WorkOrderPdfData {
  number: string;
  subject?: string | null;
  notes?: string | null;
  createdAt?: string | Date | null;
  items: WorkOrderPdfItem[];
}

interface WorkOrderPdfProps {
  company: Company;
  workOrder: WorkOrderPdfData;
  opportunityTitle?: string | null;
  customerName?: string | null;
  disclaimerText?: string | null;
}

export const WorkOrderPdfDocument = ({
  company,
  workOrder,
  opportunityTitle,
  customerName,
  disclaimerText,
}: WorkOrderPdfProps) => {
  const companyInitial = (company.name || "G").charAt(0).toUpperCase();
  const subtotale = workOrder.items.reduce(
    (s, it) => s + (parseFloat(it.totalRow) || 0),
    0
  );
  const vatPercent = 22;
  const iva = (subtotale * vatPercent) / 100;
  const totale = subtotale + iva;

  // When explicitly passed: use it (even if empty string = no disclaimer).
  // Otherwise fall back to the company's setting, then to the hard-coded default.
  const effectiveDisclaimer =
    disclaimerText !== undefined
      ? disclaimerText
      : (company.workOrderDisclaimerText ?? DEFAULT_WO_DISCLAIMER);

  return (
    <Document title={`Nota Lavori ${workOrder.number}`} author={company.name || "GDM"}>
      <Page size="A4" style={styles.page} wrap>
        {/* Header fisso */}
        <View fixed style={styles.header}>
          {company.logoUrl ? (
            <Image src={company.logoUrl} style={styles.logo} />
          ) : (
            <Text style={styles.logoFallback}>{companyInitial}</Text>
          )}
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companyMeta}>
              {[company.address].filter(Boolean).join(" · ")}
            </Text>
            <Text style={styles.companyMeta}>
              {[
                company.vatNumber ? `P.IVA ${company.vatNumber}` : null,
                company.fiscalCode ? `CF ${company.fiscalCode}` : null,
                company.rea ? `REA ${company.rea}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text style={styles.companyMeta}>
              {[
                company.phone ? `Tel ${company.phone}` : null,
                company.email,
                company.pecEmail ? `PEC ${company.pecEmail}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>

        {/* Titolo */}
        <View style={styles.titleBlock}>
          <View>
            <Text style={styles.title}>NOTA LAVORI N. {workOrder.number}</Text>
            {(opportunityTitle || customerName) && (
              <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                {[customerName, opportunityTitle].filter(Boolean).join(" — ")}
              </Text>
            )}
          </View>
          <Text style={styles.titleMeta}>
            Data: {safeDate(workOrder.createdAt)}
          </Text>
        </View>

        {/* Oggetto */}
        {workOrder.subject && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Oggetto</Text>
            <Text style={styles.cardLine}>{workOrder.subject}</Text>
          </View>
        )}

        {/* Tabella voci */}
        <View style={styles.itemsTable}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.col, styles.colDesc]}>Descrizione</Text>
            <Text style={[styles.col, styles.colQty]}>Quantità</Text>
            <Text style={[styles.col, styles.colUnit]}>Prezzo unit.</Text>
            <Text style={[styles.col, styles.colTotal]}>Totale</Text>
          </View>
          {workOrder.items.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.col, styles.colDesc, { color: COLORS.muted }]}>
                Nessuna voce inserita
              </Text>
              <Text style={[styles.col, styles.colQty]}>—</Text>
              <Text style={[styles.col, styles.colUnit]}>—</Text>
              <Text style={[styles.col, styles.colTotal]}>—</Text>
            </View>
          ) : (
            workOrder.items.map((item, i) => (
              <View
                key={item.id}
                style={[styles.tableRow, i % 2 === 0 ? styles.tableRowAlt : {}]}
                wrap={false}
              >
                <Text style={[styles.col, styles.colDesc]}>
                  {item.description || "—"}
                </Text>
                <Text style={[styles.col, styles.colQty]}>
                  {parseFloat(item.quantity || "0").toLocaleString("it-IT", {
                    maximumFractionDigits: 4,
                  })}{" "}
                  {item.unitOfMeasure || ""}
                </Text>
                <Text style={[styles.col, styles.colUnit]}>
                  € {fmt(item.unitPrice)}
                </Text>
                <Text style={[styles.col, styles.colTotal]}>
                  € {fmt(item.totalRow)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Totali */}
        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Imponibile</Text>
            <Text style={styles.totalsValue}>€ {fmt(subtotale)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>IVA {vatPercent}%</Text>
            <Text style={styles.totalsValue}>€ {fmt(iva)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTALE</Text>
            <Text style={styles.grandTotalValue}>€ {fmt(totale)}</Text>
          </View>
        </View>

        {/* Note */}
        {workOrder.notes && (
          <View style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>Note</Text>
            <Text style={styles.cardLine}>{workOrder.notes}</Text>
          </View>
        )}

        {/* Disclaimer */}
        {effectiveDisclaimer ? (
          <Text style={styles.disclaimer} wrap={false}>
            {effectiveDisclaimer}
          </Text>
        ) : null}

        {/* Footer fisso */}
        <View fixed style={styles.footer}>
          <View style={styles.footerRow}>
            <Text>
              {[
                company.name,
                company.address,
                company.vatNumber ? `P.IVA ${company.vatNumber}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Pagina ${pageNumber} di ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  );
};
