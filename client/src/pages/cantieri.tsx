import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, RefreshCw, Loader2, Eye, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkOrderWithItems, Company } from "@shared/schema";
import { PDFViewer } from "@react-pdf/renderer";
import { QuotePdfDocument } from "@/pdf/QuotePdfDocument";
import type { PdfQuote, PdfCustomer } from "@/pdf/quote-pdf-utils";

type SiteStatus = "ACTIVE" | "INVOICING_PENDING" | "COMPLETED";

interface SalRowData {
  quoteItemId: string;
  type: string;
  description: string;
  unitOfMeasure: string;
  quantityPreventivo: string;
  totalPreventivo: string;
  quantityFatturata: string;
  totalFatturato: string;
  quantityResiduo: string;
  totalResiduo: string;
}

interface SalData {
  opportunityId: string;
  quoteId: string | null;
  rows: SalRowData[];
  totals: {
    totalPreventivo: string;
    totalFatturato: string;
    totalResiduo: string;
    percentualeFatturata: string;
  };
}

function SalPanel({ sal }: { sal: SalData }) {
  const pct = Math.min(100, Math.max(0, parseFloat(sal.totals.percentualeFatturata)));

  return (
    <div className="space-y-3 py-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground uppercase tracking-wide">
            <th className="py-1 text-left font-medium">Voce</th>
            <th className="py-1 text-left font-medium">UdM</th>
            <th className="py-1 text-right font-medium">Preventivato</th>
            <th className="py-1 text-right font-medium">Fatturato</th>
            <th className="py-1 text-right font-medium">Residuo</th>
            <th className="py-1 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {sal.rows.map(row => {
            const rowPct =
              parseFloat(row.totalPreventivo) > 0
                ? ((parseFloat(row.totalFatturato) / parseFloat(row.totalPreventivo)) * 100).toFixed(1)
                : "0";
            const qtyPrev = parseFloat(row.quantityPreventivo);
            const qtyFatt = parseFloat(row.quantityFatturata);
            return (
              <tr key={row.quoteItemId} className="border-b last:border-0">
                <td className="py-1">{row.description || "—"}</td>
                <td className="py-1 text-muted-foreground">{row.unitOfMeasure || "—"}</td>
                <td className="py-1 text-right">
                  {qtyPrev > 0 && <span className="text-muted-foreground mr-1">{qtyPrev}</span>}
                  {formatEuro(row.totalPreventivo)}
                </td>
                <td className="py-1 text-right">
                  {parseFloat(row.totalFatturato) > 0 ? (
                    <>
                      {qtyFatt > 0 && <span className="text-muted-foreground mr-1">{qtyFatt}</span>}
                      {formatEuro(row.totalFatturato)}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  {parseFloat(row.totalResiduo) > 0 ? (
                    <>
                      {parseFloat(row.quantityResiduo) > 0 && (
                        <span className="text-muted-foreground mr-1">{parseFloat(row.quantityResiduo)}</span>
                      )}
                      {formatEuro(row.totalResiduo)}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1 text-right">{rowPct}%</td>
              </tr>
            );
          })}
          <tr className="border-t font-semibold text-xs">
            <td className="py-1" colSpan={2}>TOTALE</td>
            <td className="py-1 text-right">{formatEuro(sal.totals.totalPreventivo)}</td>
            <td className="py-1 text-right">
              {parseFloat(sal.totals.totalFatturato) > 0 ? formatEuro(sal.totals.totalFatturato) : "—"}
            </td>
            <td className="py-1 text-right">{formatEuro(sal.totals.totalResiduo)}</td>
            <td className="py-1 text-right">{sal.totals.percentualeFatturata}%</td>
          </tr>
        </tbody>
      </table>
      <div className="h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className="h-2 bg-blue-500 rounded transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface WonOpportunity {
  id: string;
  title: string;
  leadId: string;
  leadName: string | null;
  companyId: string;
  wonAt: string | null;
  siteStatus: SiteStatus;
  quoteTotal: string;
}

function formatEuro(value: string | number | null | undefined): string {
  const n = parseFloat(String(value ?? "0"));
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function woStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT": return "Bozza";
    case "SENT": return "Inviata";
    case "CONFIRMED": return "Confermata";
    default: return status;
  }
}

function woStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "DRAFT": return "secondary";
    case "SENT": return "default";
    case "CONFIRMED": return "outline";
    default: return "secondary";
  }
}

interface InvoiceModalProps {
  open: boolean;
  workOrderId: string;
  defaultAmount: string;
  onClose: () => void;
}

function InvoiceModal({ open, workOrderId, defaultAmount, onClose }: InvoiceModalProps) {
  const [amount, setAmount] = useState(defaultAmount);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (invoicedAmount: string) =>
      apiRequest("POST", `/api/work-orders/${workOrderId}/invoice`, { invoicedAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities?won=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders?companyScope=all"] });
      toast({ title: "Fattura registrata" });
      onClose();
    },
    onError: () => {
      toast({ title: "Errore nella registrazione", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registra fattura</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="invoiced-amount">Importo fatturato (€)</Label>
            <Input
              id="invoiced-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => mutation.mutate(amount)}
            disabled={mutation.isPending || !amount}
          >
            {mutation.isPending ? "Salvataggio..." : "Conferma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuoteApiResponse {
  id: string;
  number: string;
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
    type: string | null;
    description: string | null;
    unitOfMeasure: string | null;
    developmentCm: string | null;
    quantity: string;
    unitPriceApplied: string;
    totalRow: string;
    displayOrder: number;
    discountPercent: string | null;
    overrideTotal: string | null;
    baseTotal: string | null;
    isInternalOnly: boolean | null;
    clientTotal: string | null;
  }>;
}

interface QuotePreviewModalProps {
  open: boolean;
  onClose: () => void;
  opportunityId: string;
  leadId: string;
  oppTitle: string;
}

function QuotePreviewModal({ open, onClose, opportunityId, leadId, oppTitle }: QuotePreviewModalProps) {
  const quotesListQuery = useQuery<Array<{ id: string }>>({
    queryKey: ["/api/opportunities", opportunityId, "quotes"],
    enabled: open,
  });

  const quoteId = quotesListQuery.data?.[0]?.id ?? null;

  const quoteQuery = useQuery<QuoteApiResponse>({
    queryKey: ["/api/quotes", quoteId],
    enabled: open && !!quoteId,
  });

  const companyQuery = useQuery<Company>({
    queryKey: ["/api/company"],
  });

  const leadQuery = useQuery<PdfCustomer & { id: string; paymentMethodId?: string | null }>({
    queryKey: ["/api/leads", leadId],
    enabled: open,
  });

  const paymentMethodsQuery = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/payment-methods"],
    enabled: open,
  });

  const paymentMethodName = useMemo(() => {
    if (!leadQuery.data?.paymentMethodId || !paymentMethodsQuery.data) return null;
    return paymentMethodsQuery.data.find((pm) => pm.id === leadQuery.data?.paymentMethodId)?.name ?? null;
  }, [leadQuery.data, paymentMethodsQuery.data]);

  const company = useMemo(() => {
    if (!companyQuery.data) return null;
    return {
      ...companyQuery.data,
      logoUrl: companyQuery.data.logoUrl || `${window.location.origin}/gdm-logo.png`,
    };
  }, [companyQuery.data]);

  const mappedQuote = useMemo((): PdfQuote | null => {
    const q = quoteQuery.data;
    if (!q) return null;
    const gdMode = q.discounts?.globalDiscountMode;
    const gdVal = gdMode === "percent" ? q.discounts?.globalDiscountPercent : q.discounts?.globalDiscountAmount;
    const globalDiscount = gdMode && gdVal != null && gdVal > 0 ? { mode: gdMode, value: gdVal } : null;
    return {
      id: q.id,
      number: q.number,
      subject: q.subject,
      notes: q.notes,
      totalAmount: q.totalAmount,
      createdAt: q.createdAt,
      globalDiscount,
      items: q.items
        .filter((it) => !it.isInternalOnly && it.type !== "GIORNATE")
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((it) => {
          const qty = parseFloat(it.quantity) || 1;
          const effectiveTotal = it.clientTotal != null ? it.clientTotal : it.totalRow;
          const effectiveUnit = it.clientTotal != null
            ? String(Math.round(parseFloat(it.clientTotal) / qty * 100) / 100)
            : it.unitPriceApplied;
          return {
            id: it.id,
            type: it.type as PdfQuote["items"][number]["type"],
            description: it.description,
            unitOfMeasure: it.unitOfMeasure,
            developmentCm: it.developmentCm,
            quantity: it.quantity,
            unitPriceApplied: effectiveUnit,
            totalRow: effectiveTotal,
            displayOrder: it.displayOrder,
            discountPercent: it.discountPercent,
            overrideTotal: it.overrideTotal,
            baseTotal: it.baseTotal,
          };
        }),
    };
  }, [quoteQuery.data]);

  const isReady = !!company && !!mappedQuote && !leadQuery.isLoading;
  const noQuote = quotesListQuery.isSuccess && !quoteId;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl w-[95vw] h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Preventivo — {oppTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 px-4 pb-4">
          {isReady && company && mappedQuote ? (
            <PDFViewer style={{ width: "100%", height: "100%", border: "none" }}>
              <QuotePdfDocument
                company={company}
                customer={leadQuery.data ?? null}
                quote={mappedQuote}
                opportunityTitle={oppTitle}
                paymentMethodName={paymentMethodName}
              />
            </PDFViewer>
          ) : noQuote ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Nessun preventivo collegato a questo cantiere.
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CantiereRowProps {
  opp: WonOpportunity;
  wos: WorkOrderWithItems[];
  onInvoice: (workOrderId: string, defaultAmount: string) => void;
}

function CantiereRow({ opp, wos, onInvoice }: CantiereRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [salExpanded, setSalExpanded] = useState(false);
  const [salLoaded, setSalLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: salData, isLoading: salLoading } = useQuery<SalData>({
    queryKey: ["/api/opportunities", opp.id, "sal"],
    enabled: salLoaded,
  });

  function toggleSal() {
    if (!salLoaded) setSalLoaded(true);
    setSalExpanded(prev => !prev);
  }

  const fatturato = wos.reduce((sum, wo) => {
    if (wo.invoicedAt && wo.invoicedAmount) {
      return sum + parseFloat(wo.invoicedAmount);
    }
    return sum;
  }, 0);

  const quoteTotal = parseFloat(opp.quoteTotal || "0");
  const residuo = quoteTotal - fatturato;

  const lastWo = wos.length > 0 ? wos[wos.length - 1] : null;

  const completeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/opportunities/${opp.id}/complete-site`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities?won=true"] });
      toast({ title: "Cantiere chiuso" });
    },
    onError: () => {
      toast({ title: "Errore nella chiusura del cantiere", variant: "destructive" });
    },
  });

  // Invio diretto senza aprire la pagina NL
  const sendWoMutation = useMutation({
    mutationFn: (woId: string) => apiRequest("POST", `/api/work-orders/${woId}/send`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders?companyScope=all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities?won=true"] });
      toast({ title: "Nota Lavori inviata" });
    },
    onError: () => toast({ title: "Errore nell'invio", variant: "destructive" }),
  });

  // Conferma diretta senza aprire la pagina NL
  const confirmWoMutation = useMutation({
    mutationFn: (woId: string) => apiRequest("POST", `/api/work-orders/${woId}/confirm`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders?companyScope=all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities?won=true"] });
      toast({ title: "Nota Lavori confermata" });
    },
    onError: () => toast({ title: "Errore nella conferma", variant: "destructive" }),
  });

  function renderAction() {
    if (wos.length === 0) {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { window.location.href = `/cantieri/${opp.id}/nuova-nl`; }}
        >
          Crea Nota Lavori
        </Button>
      );
    }

    if (lastWo && lastWo.status === "DRAFT") {
      return (
        <div className="flex gap-1.5 items-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { window.location.href = `/work-orders/${lastWo.id}`; }}
          >
            Apri NL
          </Button>
          <Button
            size="sm"
            onClick={() => sendWoMutation.mutate(lastWo.id)}
            disabled={sendWoMutation.isPending}
            title="Invia la Nota Lavori direttamente"
          >
            {sendWoMutation.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : "Invia →"}
          </Button>
        </div>
      );
    }

    if (lastWo && lastWo.status === "SENT") {
      return (
        <div className="flex gap-1.5 items-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { window.location.href = `/work-orders/${lastWo.id}`; }}
          >
            Vedi NL
          </Button>
          <Button
            size="sm"
            onClick={() => confirmWoMutation.mutate(lastWo.id)}
            disabled={confirmWoMutation.isPending}
            title="Conferma ricezione della Nota Lavori"
          >
            {confirmWoMutation.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : "Conferma ✓"}
          </Button>
        </div>
      );
    }

    if (lastWo && lastWo.status === "CONFIRMED" && !lastWo.invoicedAt) {
      return (
        <Button
          size="sm"
          onClick={() => onInvoice(lastWo.id, lastWo.totalAmount)}
        >
          Registra fattura
        </Button>
      );
    }

    if (opp.siteStatus === "ACTIVE" && wos.some((wo) => wo.invoicedAt)) {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { window.location.href = `/cantieri/${opp.id}/nuova-nl`; }}
        >
          Nuova NL
        </Button>
      );
    }

    if (opp.siteStatus === "ACTIVE" && wos.length > 0) {
      return (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
        >
          Chiudi cantiere
        </Button>
      );
    }

    return null;
  }

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/30">
        <td className="px-2 py-3 w-8">
          <button
            onClick={toggleSal}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Mostra SAL"
          >
            {salExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-3 font-medium">{opp.leadName || "—"}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{opp.title}</td>
        <td className="px-4 py-3 text-right text-sm">
          <div className="flex items-center justify-end gap-1.5">
            {quoteTotal > 0 ? formatEuro(quoteTotal) : "—"}
            {quoteTotal > 0 && (
              <button
                onClick={() => setPreviewOpen(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Anteprima preventivo"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right text-sm">
          {fatturato > 0 ? formatEuro(fatturato) : "—"}
        </td>
        <td className="px-4 py-3 text-right text-sm">
          {quoteTotal > 0 ? formatEuro(residuo) : "—"}
        </td>
        <td className="px-4 py-3">
          {lastWo ? (
            <Badge variant={woStatusVariant(lastWo.status)}>{woStatusLabel(lastWo.status)}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3">{renderAction()}</td>
      </tr>
      {salExpanded && (
        <tr className="bg-muted/10">
          <td colSpan={8} className="px-6 py-3 border-b">
            {salLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Caricamento SAL...</span>
              </div>
            ) : salData && salData.rows.length > 0 ? (
              <SalPanel sal={salData} />
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                Nessun preventivo collegato o nessuna riga disponibile.
              </p>
            )}
          </td>
        </tr>
      )}
      {previewOpen && (
        <QuotePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          opportunityId={opp.id}
          leadId={opp.leadId}
          oppTitle={opp.title}
        />
      )}
    </>
  );
}

interface SectionTableProps {
  opportunities: WonOpportunity[];
  wosByOppId: Map<string, WorkOrderWithItems[]>;
  onInvoice: (workOrderId: string, defaultAmount: string) => void;
}

function SectionTable({ opportunities, wosByOppId, onInvoice }: SectionTableProps) {
  if (opportunities.length === 0) {
    return <p className="text-sm text-muted-foreground px-4 py-3">Nessun cantiere in questa sezione.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
            <th className="px-2 py-2 w-8"></th>
            <th className="px-4 py-2 text-left font-medium">Cliente</th>
            <th className="px-4 py-2 text-left font-medium">Cantiere</th>
            <th className="px-4 py-2 text-right font-medium">Tot. preventivo</th>
            <th className="px-4 py-2 text-right font-medium">Fatturato</th>
            <th className="px-4 py-2 text-right font-medium">Residuo</th>
            <th className="px-4 py-2 text-left font-medium">Ultima NL</th>
            <th className="px-4 py-2 text-left font-medium">Azione</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opp) => (
            <CantiereRow
              key={opp.id}
              opp={opp}
              wos={wosByOppId.get(opp.id) ?? []}
              onInvoice={onInvoice}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CantieriPage() {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<{ workOrderId: string; defaultAmount: string } | null>(null);
  const [search, setSearch] = useState("");

  const { data: wonOpps = [], isLoading: oppsLoading, refetch: refetchOpps } = useQuery<WonOpportunity[]>({
    queryKey: ["/api/opportunities?won=true"],
  });

  const { data: allWos = [], isLoading: wosLoading, refetch: refetchWos } = useQuery<WorkOrderWithItems[]>({
    queryKey: ["/api/work-orders?companyScope=all"],
  });

  const isLoading = oppsLoading || wosLoading;

  function handleRefresh() {
    refetchOpps();
    refetchWos();
  }

  const wosByOppId = new Map<string, WorkOrderWithItems[]>();
  for (const wo of allWos) {
    const existing = wosByOppId.get(wo.opportunityId) ?? [];
    wosByOppId.set(wo.opportunityId, [...existing, wo]);
  }

  const filteredOpps = search
    ? wonOpps.filter((o) => (o.leadName ?? "").toLowerCase().includes(search.toLowerCase()))
    : wonOpps;

  const invoicingOpps = filteredOpps.filter((o) => o.siteStatus === "INVOICING_PENDING");
  const activeOpps = filteredOpps.filter((o) => o.siteStatus === "ACTIVE");
  const completedOpps = filteredOpps.filter((o) => o.siteStatus === "COMPLETED");

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Cantieri</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Cerca cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-52"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>
        </div>

        {/* Da fatturare */}
        <section className="rounded-lg border border-red-200 bg-red-50/30">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200">
            <span className="text-base font-semibold text-red-700">🔴 Da fatturare</span>
            <Badge variant="destructive" className="text-xs">{invoicingOpps.length}</Badge>
          </div>
          <SectionTable
            opportunities={invoicingOpps}
            wosByOppId={wosByOppId}
            onInvoice={(id, amt) => setInvoiceModal({ workOrderId: id, defaultAmount: amt })}
          />
        </section>

        {/* In lavorazione */}
        <section className="rounded-lg border">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <span className="text-base font-semibold text-yellow-700">🟡 In lavorazione</span>
            <Badge variant="secondary" className="text-xs">{activeOpps.length}</Badge>
          </div>
          <SectionTable
            opportunities={activeOpps}
            wosByOppId={wosByOppId}
            onInvoice={(id, amt) => setInvoiceModal({ workOrderId: id, defaultAmount: amt })}
          />
        </section>

        {/* Completati — collassabile */}
        <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
          <section className="rounded-lg border border-emerald-200 bg-emerald-50/20">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-3 border-b border-emerald-200 w-full text-left hover:bg-emerald-50/30 transition-colors">
                {completedOpen ? (
                  <ChevronDown className="h-4 w-4 text-emerald-700" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-emerald-700" />
                )}
                <span className="text-base font-semibold text-emerald-700">✅ Completati</span>
                <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700">{completedOpps.length}</Badge>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SectionTable
                opportunities={completedOpps}
                wosByOppId={wosByOppId}
                onInvoice={(id, amt) => setInvoiceModal({ workOrderId: id, defaultAmount: amt })}
              />
            </CollapsibleContent>
          </section>
        </Collapsible>
      </div>

      {invoiceModal && (
        <InvoiceModal
          open={true}
          workOrderId={invoiceModal.workOrderId}
          defaultAmount={invoiceModal.defaultAmount}
          onClose={() => setInvoiceModal(null)}
        />
      )}
    </DashboardLayout>
  );
}
