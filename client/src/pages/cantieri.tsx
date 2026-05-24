import { useState } from "react";
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
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkOrderWithItems } from "@shared/schema";

type SiteStatus = "ACTIVE" | "INVOICING_PENDING" | "COMPLETED";

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

interface CantiereRowProps {
  opp: WonOpportunity;
  wos: WorkOrderWithItems[];
  onInvoice: (workOrderId: string, defaultAmount: string) => void;
}

function CantiereRow({ opp, wos, onInvoice }: CantiereRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  function renderAction() {
    if (wos.length === 0) {
      return (
        <Button size="sm" variant="outline" disabled title="Disponibile presto">
          Crea Nota Lavori
        </Button>
      );
    }

    if (lastWo && lastWo.status === "DRAFT") {
      return (
        <Button size="sm" variant="outline" onClick={() => window.location.href = `/quotes/${lastWo.quoteId || ""}`}>
          Apri NL
        </Button>
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
        <Button size="sm" variant="outline" disabled title="Disponibile presto">
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
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">{opp.leadName || "—"}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{opp.title}</td>
      <td className="px-4 py-3 text-right text-sm">
        {quoteTotal > 0 ? formatEuro(quoteTotal) : "—"}
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

  const invoicingOpps = wonOpps.filter((o) => o.siteStatus === "INVOICING_PENDING");
  const activeOpps = wonOpps.filter((o) => o.siteStatus === "ACTIVE");
  const completedOpps = wonOpps.filter((o) => o.siteStatus === "COMPLETED");

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Cantieri</h1>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
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
          <section className="rounded-lg border border-green-200 bg-green-50/20">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-3 border-b border-green-200 w-full text-left hover:bg-green-50/30 transition-colors">
                {completedOpen ? (
                  <ChevronDown className="h-4 w-4 text-green-700" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-green-700" />
                )}
                <span className="text-base font-semibold text-green-700">✅ Completati</span>
                <Badge variant="outline" className="text-xs border-green-400 text-green-700">{completedOpps.length}</Badge>
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
