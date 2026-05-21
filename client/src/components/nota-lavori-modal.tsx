import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ClipboardCheck, Send, CheckCircle2, FileCheck } from "lucide-react";
import type { Quote, QuoteItem } from "@shared/schema";

interface Props {
  opportunityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  ACCEPTED:             { label: "Preventivo accettato",    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  WORK_ORDER_DRAFT:     { label: "Nota lavori in bozza",    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  WORK_ORDER_SENT:      { label: "Nota lavori inviata",     color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  WORK_ORDER_CONFIRMED: { label: "Pronta per fatturazione", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
};

function fmtQty(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? val : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

function fmtCurrency(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function NotaLavoriModal({ opportunityId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [quantityOverrides, setQuantityOverrides] = useState<Record<string, string>>({});

  const { data: quotes = [], isLoading: isLoadingList } = useQuery<Quote[]>({
    queryKey: ["/api/opportunities", opportunityId, "quotes"],
    enabled: open,
  });

  // Prendi il primo preventivo rilevante (ACCEPTED o in stato WO)
  const quoteRef = quotes.find(q =>
    q.status === "ACCEPTED" ||
    q.status === "WORK_ORDER_DRAFT" ||
    q.status === "WORK_ORDER_SENT" ||
    q.status === "WORK_ORDER_CONFIRMED"
  ) ?? quotes[0];

  // Fetch completo con items
  const { data: quoteDetail, isLoading: isLoadingDetail } = useQuery<Quote & { items: QuoteItem[] }>({
    queryKey: ["/api/quotes", quoteRef?.id],
    enabled: !!quoteRef?.id && open,
  });

  const isLoading = isLoadingList || isLoadingDetail;
  const quote = quoteDetail ?? quoteRef;
  const items: QuoteItem[] = (quoteDetail as any)?.items ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "quotes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
  };

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${quote!.id}/work-order/start`),
    onSuccess: () => { invalidate(); toast({ title: "Nota lavori avviata" }); },
    onError: () => toast({ title: "Errore", description: "Impossibile avviare la nota lavori", variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Prima salva le quantità override
      await Promise.all(
        Object.entries(quantityOverrides).map(([itemId, qty]) =>
          apiRequest("PATCH", `/api/quote-items/${itemId}/work-order-quantity`, {
            quantity: qty === "" ? null : parseFloat(qty),
          })
        )
      );
      return apiRequest("POST", `/api/quotes/${quote!.id}/work-order/send`, { notes });
    },
    onSuccess: () => { invalidate(); toast({ title: "Nota lavori segnata come inviata" }); },
    onError: () => toast({ title: "Errore", description: "Impossibile inviare la nota lavori", variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${quote!.id}/work-order/confirm`),
    onSuccess: () => { invalidate(); toast({ title: "Nota lavori confermata — pronta per fatturazione" }); },
    onError: () => toast({ title: "Errore", description: "Impossibile confermare la nota lavori", variant: "destructive" }),
  });

  const isPending = startMutation.isPending || sendMutation.isPending || confirmMutation.isPending;

  const statusInfo = quote ? statusConfig[quote.status] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileCheck className="w-4 h-4" />
            Nota Lavori
            {quote && <span className="font-normal text-muted-foreground">— {quote.number}</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !quote && (
          <p className="text-sm text-muted-foreground py-4">
            Nessun preventivo accettato trovato per questa opportunità.
          </p>
        )}

        {!isLoading && quote && (
          <div className="space-y-4">
            {statusInfo && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            )}

            {/* Tabella voci */}
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left p-2.5 font-medium text-xs">Descrizione</th>
                    <th className="text-right p-2.5 font-medium text-xs w-24">Qtà orig.</th>
                    {quote.status === "WORK_ORDER_DRAFT" && (
                      <th className="text-right p-2.5 font-medium text-xs w-28">Qtà NL</th>
                    )}
                    <th className="text-right p-2.5 font-medium text-xs w-20">U.M.</th>
                    <th className="text-right p-2.5 font-medium text-xs w-24">Totale</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => {
                    const override = quantityOverrides[item.id];
                    const displayQty = item.workOrderQuantityOverride ?? item.quantity;
                    return (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="p-2.5 text-xs">
                          {item.description || "—"}
                        </td>
                        <td className="p-2.5 text-xs text-right text-muted-foreground">
                          {fmtQty(item.quantity)}
                        </td>
                        {quote.status === "WORK_ORDER_DRAFT" && (
                          <td className="p-2.5 text-right">
                            <Input
                              type="number"
                              step="any"
                              className="h-7 text-xs text-right w-24 ml-auto"
                              placeholder={fmtQty(item.quantity)}
                              value={override ?? (item.workOrderQuantityOverride ?? "")}
                              onChange={(e) =>
                                setQuantityOverrides((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                            />
                          </td>
                        )}
                        <td className="p-2.5 text-xs text-right text-muted-foreground">
                          {item.unitOfMeasure || "—"}
                        </td>
                        <td className="p-2.5 text-xs text-right font-medium">
                          {fmtCurrency(item.totalRow)}
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                        Nessuna voce
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Note (editabili solo in bozza) */}
            {(quote.status === "WORK_ORDER_DRAFT" || quote.status === "WORK_ORDER_SENT" || quote.status === "WORK_ORDER_CONFIRMED") && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Note nota lavori
                </label>
                {quote.status === "WORK_ORDER_DRAFT" ? (
                  <Textarea
                    className="text-sm min-h-[80px]"
                    placeholder="Aggiungi note per il cliente..."
                    value={notes || quote.workOrderNotes || ""}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted/40 rounded p-2">
                    {quote.workOrderNotes || "—"}
                  </p>
                )}
              </div>
            )}

            {/* Date conferma */}
            {quote.workOrderSentAt && (
              <p className="text-xs text-muted-foreground">
                Inviata il {new Date(quote.workOrderSentAt).toLocaleDateString("it-IT")}
              </p>
            )}
            {quote.workOrderConfirmedAt && (
              <p className="text-xs text-muted-foreground">
                Confermata il {new Date(quote.workOrderConfirmedAt).toLocaleDateString("it-IT")}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>

          {quote?.status === "ACCEPTED" && (
            <Button
              onClick={() => startMutation.mutate()}
              disabled={isPending}
              data-testid="button-work-order-start"
            >
              {startMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
              Avvia Nota Lavori
            </Button>
          )}

          {quote?.status === "WORK_ORDER_DRAFT" && (
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={isPending}
              data-testid="button-work-order-send"
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Segna come Inviata
            </Button>
          )}

          {quote?.status === "WORK_ORDER_SENT" && (
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={isPending}
              data-testid="button-work-order-confirm"
            >
              {confirmMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Conferma Nota Lavori
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
