import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ChevronLeft, Eye, Download, Mail, X } from "lucide-react";
import { pdf, PDFViewer } from "@react-pdf/renderer";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";
import { WorkOrderPdfDocument, DEFAULT_WO_DISCLAIMER } from "@/pdf/WorkOrderPdfDocument";
import { WorkOrderPdfActions } from "@/pdf/WorkOrderPdfActions";

// ── Types ──────────────────────────────────────────────────────────────────

interface OpportunityDetail {
  id: string;
  title: string;
  leadId: string;
  leadName: string | null;
}

interface CreatedWorkOrder {
  id: string;
  number: string;
  status: string;
  opportunityId: string;
  subject: string | null;
  notes: string | null;
  createdAt: Date | string;
  items: Array<{
    id: string;
    description: string;
    unitOfMeasure: string;
    quantity: string;
    unitPrice: string;
    totalRow: string;
    displayOrder: number;
  }>;
}

interface QuoteListItem {
  id: string;
  number: string;
  status: string;
  totalAmount: string;
  subject: string | null;
}

interface SalRow {
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
}

interface SalResponse {
  opportunityId: string;
  quoteId: string | null;
  rows: SalRow[];
  totals: {
    totalPreventivo: string;
    totalFatturato: string;
    totalResiduo: string;
    percentualeFatturata: string;
  };
}

interface RowState {
  included: boolean;
  qty: string;
  amount: string;
}

// ── Utils ──────────────────────────────────────────────────────────────────

function formatEuro(value: string | number | null | undefined): string {
  const n = parseFloat(String(value ?? "0"));
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function typeLabel(type: string): string {
  switch (type) {
    case "LATTONERIA": return "Lattoneria";
    case "ARTICOLO": return "Articolo";
    case "GIORNATE": return "Giornate";
    case "MANUALE": return "Manuale";
    default: return type;
  }
}

function typeBadgeVariant(type: string): "default" | "secondary" | "outline" {
  switch (type) {
    case "LATTONERIA": return "default";
    case "ARTICOLO": return "secondary";
    case "GIORNATE": return "outline";
    default: return "outline";
  }
}

const MANUALE_TYPES = new Set(["MANUALE"]);

// ── Component ──────────────────────────────────────────────────────────────

export default function CreateWorkOrderPage() {
  const [, params] = useRoute("/cantieri/:opportunityId/nuova-nl");
  const opportunityId = params?.opportunityId ?? "";

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Step logic: 1 = quote selection, 2 = row selection
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [createdWo, setCreatedWo] = useState<CreatedWorkOrder | null>(null);

  // Row wizard states keyed by quoteItemId
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [rowsInitialized, setRowsInitialized] = useState(false);

  // Data fetching
  const { data: opportunity } = useQuery<OpportunityDetail>({
    queryKey: ["/api/opportunities", opportunityId],
  });

  const { data: quotes = [], isSuccess: quotesLoaded } = useQuery<QuoteListItem[]>({
    queryKey: ["/api/opportunities", opportunityId, "quotes"],
    enabled: !!opportunityId,
  });

  const { data: sal, isLoading: salLoading } = useQuery<SalResponse>({
    queryKey: ["/api/opportunities", opportunityId, "sal"],
    enabled: !!opportunityId,
  });

  const { data: company } = useQuery<Company>({
    queryKey: ["/api/company"],
  });

  const isLoading = salLoading || !quotesLoaded;

  // Initialize state once SAL arrives
  useEffect(() => {
    if (sal && !rowsInitialized) {
      const initialStates: Record<string, RowState> = {};
      for (const row of sal.rows) {
        const hasResiduo = parseFloat(row.totalResiduo) > 0;
        initialStates[row.quoteItemId] = {
          included: hasResiduo,
          qty: row.quantityResiduo,
          amount: row.totalResiduo,
        };
      }
      setRowStates(initialStates);
      if (sal.quoteId && !selectedQuoteId) {
        setSelectedQuoteId(sal.quoteId);
      }
      setRowsInitialized(true);
    }
  }, [sal, rowsInitialized, selectedQuoteId]);

  // Auto-skip step 1 once quotes have loaded if there's only one
  useEffect(() => {
    if (quotesLoaded && quotes.length <= 1) setStep(2);
  }, [quotes, quotesLoaded]);

  // Mutation
  const mutation = useMutation({
    mutationFn: (payload: { quoteId: string; items: unknown[] }) =>
      apiRequest("POST", `/api/opportunities/${opportunityId}/work-orders/from-quote`, payload)
        .then((r) => r.json() as Promise<CreatedWorkOrder>),
    onSuccess: (data: CreatedWorkOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities?won=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders?companyScope=all"] });
      toast({ title: "Nota Lavori creata" });
      setCreatedWo(data);
    },
    onError: (err: Error) => {
      toast({ title: "Errore nella creazione", description: err.message, variant: "destructive" });
    },
  });

  // Handlers
  function handleQtyChange(id: string, newQty: string, unitPrice: string) {
    const computed = (parseFloat(newQty || "0") * parseFloat(unitPrice || "0")).toFixed(2);
    setRowStates(prev => ({
      ...prev,
      [id]: { ...prev[id], qty: newQty, amount: computed },
    }));
  }

  function handleAmountChange(id: string, newAmount: string) {
    setRowStates(prev => ({
      ...prev,
      [id]: { ...prev[id], amount: newAmount },
    }));
  }

  function handleIncludedChange(id: string, checked: boolean) {
    setRowStates(prev => ({
      ...prev,
      [id]: { ...prev[id], included: checked },
    }));
  }

  function buildPreviewItems() {
    if (!sal) return [];
    return sal.rows
      .filter(row => rowStates[row.quoteItemId]?.included)
      .map((row, i) => ({
        id: row.quoteItemId,
        description: row.description,
        unitOfMeasure: row.unitOfMeasure,
        quantity: rowStates[row.quoteItemId]?.qty ?? "0",
        unitPrice: row.unitPrice,
        totalRow: rowStates[row.quoteItemId]?.amount ?? "0",
        displayOrder: i,
      }));
  }

  function buildPreviewWorkOrder() {
    return {
      number: "BOZZA",
      subject: opportunity?.title ?? null,
      notes: null,
      createdAt: new Date(),
      items: buildPreviewItems(),
    };
  }

  async function handleDownloadPreview() {
    if (!company) return;
    try {
      setDownloading(true);
      const resolvedCompany = { ...company, logoUrl: company.logoUrl || `${window.location.origin}/gdm-logo.png` };
      const blob = await pdf(
        <WorkOrderPdfDocument
          company={resolvedCompany}
          workOrder={buildPreviewWorkOrder()}
          opportunityTitle={opportunity?.title ?? null}
          customerName={opportunity?.leadName ?? null}
          disclaimerText={company.workOrderDisclaimerText || DEFAULT_WO_DISCLAIMER}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NotaLavori-${opportunity?.title ?? "bozza"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast({ title: "Errore generazione PDF", description: String(err), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  function handleOpenEmail() {
    const disclaimer = company?.workOrderDisclaimerText || DEFAULT_WO_DISCLAIMER;
    const items = buildPreviewItems();
    const itemsText = items
      .map(it => `- ${it.description} (${it.unitOfMeasure}): ${formatEuro(it.totalRow)}`)
      .join("\n");
    const subject = encodeURIComponent(`Nota Lavori — ${opportunity?.title ?? ""}`);
    const body = encodeURIComponent(
      `Gentile Cliente,\n\nIn allegato trovate la Nota Lavori relativa a:\n${opportunity?.title ?? ""}\n\n` +
      (itemsText ? `Voci:\n${itemsText}\n\n` : "") +
      `Totale: ${formatEuro(totalNL)}\n\n${disclaimer}\n\nCordiali saluti,\n${company?.name ?? ""}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function handleSubmit() {
    if (!sal || !selectedQuoteId) return;
    const includedRows = sal.rows.filter(row => rowStates[row.quoteItemId]?.included);
    const items = includedRows.map(row => {
      const state = rowStates[row.quoteItemId] ?? { qty: "0", amount: "0", included: true };
      return {
        sourceQuoteItemId: row.quoteItemId,
        description: row.description,
        unitOfMeasure: row.unitOfMeasure,
        quantity: state.qty,
        unitPrice: row.unitPrice,
        totalRow: state.amount,
      };
    });
    mutation.mutate({ quoteId: selectedQuoteId, items });
  }

  // Computed totals
  const totalNL = sal
    ? sal.rows.reduce((sum, row) => {
        if (!rowStates[row.quoteItemId]?.included) return sum;
        return sum + parseFloat(rowStates[row.quoteItemId]?.amount || "0");
      }, 0)
    : 0;

  const includedCount = sal
    ? sal.rows.filter(row => rowStates[row.quoteItemId]?.included).length
    : 0;

  // Render
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Cantieri
          </button>
          <span>/</span>
          <span className="text-foreground">{opportunity?.title || "..."}</span>
          <span>/</span>
          <span className="text-foreground font-medium">Nuova Nota Lavori</span>
        </div>

        <h1 className="text-2xl font-semibold">
          Nuova Nota Lavori{opportunity?.title ? ` — ${opportunity.title}` : ""}
        </h1>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Caricamento dati...</span>
          </div>
        )}

        {/* Step 3: NL created — show Invia / Vai ai cantieri */}
        {createdWo && (
          <div className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Nota Lavori {createdWo.number} creata</p>
                <p className="text-sm text-muted-foreground">
                  Puoi inviarla ora oppure farlo in seguito dalla pagina Cantieri.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => { window.location.href = "/cantieri"; }}
              >
                Vai ai Cantieri
              </Button>
              <WorkOrderPdfActions
                workOrderId={createdWo.id}
                workOrder={createdWo}
                status={createdWo.status}
                opportunityId={opportunityId}
                onSent={() => { window.location.href = "/cantieri"; }}
              />
            </div>
          </div>
        )}

        {/* Step 1: Quote selection (only if multiple quotes) */}
        {!createdWo && !isLoading && step === 1 && quotes.length > 1 && (
          <div className="rounded-lg border p-5 space-y-4">
            <h2 className="text-base font-semibold">Seleziona il preventivo di riferimento</h2>
            <RadioGroup
              value={selectedQuoteId}
              onValueChange={setSelectedQuoteId}
              className="space-y-2"
            >
              {quotes.map(q => (
                <div key={q.id} className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/30 cursor-pointer">
                  <RadioGroupItem value={q.id} id={`quote-${q.id}`} />
                  <Label htmlFor={`quote-${q.id}`} className="cursor-pointer flex-1">
                    <span className="font-medium">{q.number}</span>
                    {q.subject && <span className="text-muted-foreground ml-2">— {q.subject}</span>}
                    <span className="ml-auto text-sm text-muted-foreground float-right">
                      {formatEuro(q.totalAmount)}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <Button onClick={() => setStep(2)} disabled={!selectedQuoteId}>
              Avanti
            </Button>
          </div>
        )}

        {/* Step 2: Row selection */}
        {!createdWo && !isLoading && step === 2 && sal && (
          <>
            {sal.rows.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-muted-foreground">
                Nessun preventivo collegato a questo cantiere.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-left font-medium">Descrizione</th>
                        <th className="px-3 py-2 text-right font-medium">Tot. prev.</th>
                        <th className="px-3 py-2 text-right font-medium">Già fatt.</th>
                        <th className="px-3 py-2 text-right font-medium">Residuo</th>
                        <th className="px-3 py-2 text-center font-medium">Qtà questa NL</th>
                        <th className="px-3 py-2 text-right font-medium">Importo NL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sal.rows.map(row => {
                        const state = rowStates[row.quoteItemId];
                        const isFullyInvoiced = parseFloat(row.totalResiduo) <= 0;
                        const isManuale = MANUALE_TYPES.has(row.type);

                        return (
                          <tr
                            key={row.quoteItemId}
                            className={`border-b last:border-0 ${isFullyInvoiced ? "opacity-40" : "hover:bg-muted/20"}`}
                          >
                            <td className="px-3 py-3 text-center">
                              <Checkbox
                                checked={state?.included ?? false}
                                onCheckedChange={(checked) => handleIncludedChange(row.quoteItemId, !!checked)}
                                disabled={isFullyInvoiced}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant={typeBadgeVariant(row.type)} className="text-xs">
                                {typeLabel(row.type)}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 max-w-xs">
                              <span className="line-clamp-2">{row.description || "—"}</span>
                              {row.unitOfMeasure && (
                                <span className="text-xs text-muted-foreground ml-1">({row.unitOfMeasure})</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              {parseFloat(row.quantityPreventivo) > 0 && !isManuale && (
                                <span className="text-xs text-muted-foreground block">
                                  {parseFloat(row.quantityPreventivo)} {row.unitOfMeasure}
                                </span>
                              )}
                              {formatEuro(row.totalPreventivo)}
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              {parseFloat(row.totalFatturato) > 0 ? (
                                <>
                                  {parseFloat(row.quantityFatturata) > 0 && !isManuale && (
                                    <span className="text-xs text-muted-foreground block">
                                      {parseFloat(row.quantityFatturata)} {row.unitOfMeasure}
                                    </span>
                                  )}
                                  {formatEuro(row.totalFatturato)}
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              {parseFloat(row.quantityResiduo) > 0 && !isManuale && (
                                <span className="text-xs text-muted-foreground block">
                                  {parseFloat(row.quantityResiduo)} {row.unitOfMeasure}
                                </span>
                              )}
                              {parseFloat(row.totalResiduo) > 0 ? formatEuro(row.totalResiduo) : "—"}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {isManuale ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={state?.qty ?? "0"}
                                  onChange={e => handleQtyChange(row.quoteItemId, e.target.value, row.unitPrice)}
                                  disabled={!state?.included || isFullyInvoiced}
                                  className="w-24 text-right h-8 text-sm"
                                />
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={state?.amount ?? "0"}
                                onChange={e => handleAmountChange(row.quoteItemId, e.target.value)}
                                disabled={!state?.included || isFullyInvoiced}
                                className="w-28 text-right h-8 text-sm ml-auto"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer with totals */}
                <div className="border-t bg-muted/10 px-4 py-4 flex items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    {includedCount} {includedCount === 1 ? "voce selezionata" : "voci selezionate"}
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-lg font-semibold">
                      Totale NL: {formatEuro(totalNL)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Residuo dopo questa NL:{" "}
                      {formatEuro(Math.max(0, parseFloat(sal.totals.totalResiduo) - totalNL))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => window.history.back()}>
                Annulla
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                  disabled={includedCount === 0 || !company}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Anteprima PDF
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={includedCount === 0 || totalNL <= 0 || mutation.isPending || !selectedQuoteId}
                >
                  {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crea Nota Lavori
                </Button>
              </div>
            </div>

            {/* PDF preview dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DialogContent className="max-w-6xl w-[95vw] h-[92vh] flex flex-col p-0">
                <DialogHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
                  <DialogTitle>Anteprima Nota Lavori (bozza)</DialogTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadPreview}
                      disabled={downloading}
                    >
                      {downloading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Scarica
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleOpenEmail}>
                      <Mail className="h-4 w-4 mr-2" />
                      Invia email
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
                      <X className="h-4 w-4 mr-2" />
                      Chiudi
                    </Button>
                  </div>
                </DialogHeader>
                <div className="flex-1 px-4 pb-4">
                  {company ? (
                    <PDFViewer style={{ width: "100%", height: "100%", border: "none" }}>
                      <WorkOrderPdfDocument
                        company={{ ...company, logoUrl: company.logoUrl || `${window.location.origin}/gdm-logo.png` }}
                        workOrder={buildPreviewWorkOrder()}
                        opportunityTitle={opportunity?.title ?? null}
                        customerName={opportunity?.leadName ?? null}
                        disclaimerText={company.workOrderDisclaimerText || DEFAULT_WO_DISCLAIMER}
                      />
                    </PDFViewer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
