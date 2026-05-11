import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Company } from "@shared/schema";
import {
  type PdfQuote,
  type PdfCustomer,
  buildItemDescription,
  formatQty,
  fmt,
  computeTotals,
  customerDisplayName,
  customerAddressLine,
} from "./quote-pdf-utils";

const COLORS = {
  text: "#1a1a1a",
  muted: "#6b6b6b",
  border: "#dcdcdc",
  rowAlt: "#f6f6f6",
  headerBg: "#1f2937",
  headerText: "#ffffff",
  accent: "#d97706", // GDM amber/orange
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
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    color: COLORS.text,
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
  customerName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  cardLine: { lineHeight: 1.4 },
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
  tableRowAlt: {
    backgroundColor: COLORS.rowAlt,
  },
  col: { paddingHorizontal: 2 },
  colDesc: { flex: 4 },
  colQty: { flex: 1.2, textAlign: "right" },
  colUnit: { flex: 1.4, textAlign: "right" },
  colTotal: { flex: 1.4, textAlign: "right", fontFamily: "Helvetica-Bold" },
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
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  grandTotalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  notesBlock: {
    marginTop: 4,
    marginBottom: 10,
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

interface QuotePdfProps {
  company: Company;
  customer: PdfCustomer | null;
  quote: PdfQuote;
  opportunityTitle?: string | null;
  paymentMethodName?: string | null;
}

function safeDate(d: string | Date | undefined | null): string {
  if (!d) return format(new Date(), "dd MMMM yyyy", { locale: it });
  try {
    const dd = typeof d === "string" ? new Date(d) : d;
    return format(dd, "dd MMMM yyyy", { locale: it });
  } catch {
    return "";
  }
}

export const QuotePdfDocument = ({ company, customer, quote, opportunityTitle, paymentMethodName }: QuotePdfProps) => {
  const totals = computeTotals(quote, 22);
  const customerInitial = (customerDisplayName(customer) || company.name || "?").charAt(0).toUpperCase();
  const companyInitial = (company.name || "?").charAt(0).toUpperCase();

  return (
    <Document title={`Preventivo ${quote.number}`} author={company.name || "GDM"}>
      <Page size="A4" style={styles.page} wrap>
        {/* Header fisso ripetuto su ogni pagina */}
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
                company.website,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>

        {/* Titolo + numero + data */}
        <View style={styles.titleBlock}>
          <View>
            <Text style={styles.title}>PREVENTIVO N. {quote.number}</Text>
            {opportunityTitle ? (
              <Text style={{ color: COLORS.muted, marginTop: 2 }}>{opportunityTitle}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.titleMeta}>Data: {safeDate(quote.createdAt)}</Text>
            {company.quoteValidityDays ? (
              <Text style={styles.titleMeta}>Validità: {company.quoteValidityDays} giorni</Text>
            ) : null}
          </View>
        </View>

        {/* Card cliente */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spett.le</Text>
          <Text style={styles.customerName}>{customerDisplayName(customer) || customerInitial}</Text>
          {customer ? (
            <>
              <Text style={styles.cardLine}>{customerAddressLine(customer)}</Text>
              <Text style={styles.cardLine}>
                {[
                  customer.vatNumber ? `P.IVA ${customer.vatNumber}` : null,
                  customer.fiscalCode ? `CF ${customer.fiscalCode}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {(customer.email || customer.phone) && (
                <Text style={styles.cardLine}>
                  {[customer.email, customer.phone].filter(Boolean).join(" · ")}
                </Text>
              )}
              {customer.firstReferentName && (
                <Text style={[styles.cardLine, { marginTop: 4 }]}>
                  Rif.: {[
                    customer.firstReferentName,
                    customer.firstReferentEmail,
                    customer.firstReferentPhone,
                  ].filter(Boolean).join(" · ")}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.cardLine}>Cliente non specificato</Text>
          )}
        </View>

        {/* Oggetto */}
        {quote.subject ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Oggetto</Text>
            <Text style={styles.cardLine}>{quote.subject}</Text>
          </View>
        ) : null}

        {/* Tabella voci con header che si ripete su ogni page break */}
        <View style={styles.itemsTable}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.col, styles.colDesc]}>Descrizione</Text>
            <Text style={[styles.col, styles.colQty]}>Quantità</Text>
            <Text style={[styles.col, styles.colUnit]}>Prezzo unit.</Text>
            <Text style={[styles.col, styles.colTotal]}>Totale</Text>
          </View>
          {quote.items.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.col, styles.colDesc, { color: COLORS.muted }]}>
                Nessuna voce inserita
              </Text>
              <Text style={[styles.col, styles.colQty]}>—</Text>
              <Text style={[styles.col, styles.colUnit]}>—</Text>
              <Text style={[styles.col, styles.colTotal]}>—</Text>
            </View>
          ) : (
            quote.items.map((item, i) => (
              <View
                key={item.id}
                style={[styles.tableRow, i % 2 === 0 ? styles.tableRowAlt : {}]}
                wrap={false}
              >
                <Text style={[styles.col, styles.colDesc]}>{buildItemDescription(item)}</Text>
                <Text style={[styles.col, styles.colQty]}>{formatQty(item)}</Text>
                <Text style={[styles.col, styles.colUnit]}>€ {fmt(item.unitPriceApplied)}</Text>
                <Text style={[styles.col, styles.colTotal]}>€ {fmt(item.totalRow)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Riepilogo totali */}
        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Imponibile</Text>
            <Text style={styles.totalsValue}>€ {fmt(totals.subtotale)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>IVA {totals.vatPercent}%</Text>
            <Text style={styles.totalsValue}>€ {fmt(totals.iva)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTALE</Text>
            <Text style={styles.grandTotalValue}>€ {fmt(totals.totale)}</Text>
          </View>
        </View>

        {/* Modalità pagamento */}
        {(paymentMethodName || company.iban || company.bankName || company.bankHolder) && (
          <View style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>Modalità di pagamento</Text>
            {paymentMethodName ? <Text style={styles.cardLine}>{paymentMethodName}</Text> : null}
            {company.iban ? <Text style={styles.cardLine}>IBAN: {company.iban}</Text> : null}
            {company.bankName ? <Text style={styles.cardLine}>Banca: {company.bankName}</Text> : null}
            {company.bankHolder ? <Text style={styles.cardLine}>Intestatario: {company.bankHolder}</Text> : null}
            {company.bankSwift ? <Text style={styles.cardLine}>SWIFT: {company.bankSwift}</Text> : null}
          </View>
        )}

        {/* Note */}
        {quote.notes ? (
          <View style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>Note</Text>
            <Text style={styles.cardLine}>{quote.notes}</Text>
          </View>
        ) : null}

        {/* Footer fisso ripetuto su ogni pagina con paginazione */}
        <View fixed style={styles.footer}>
          <View style={styles.footerRow}>
            <Text>
              {[company.name, company.address, company.vatNumber ? `P.IVA ${company.vatNumber}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`} />
          </View>
          {company.quoteFooterNotes ? <Text>{company.quoteFooterNotes}</Text> : null}
        </View>
      </Page>
    </Document>
  );
};
