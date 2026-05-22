import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardCheck, ExternalLink, CheckCircle2, FileCheck, Ban } from "lucide-react";
import type { Quote } from "@shared/schema";

interface Props {
  opportunityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WO_STATUSES = ["ACCEPTED", "WORK_ORDER_DRAFT", "WORK_ORDER_SENT", "WORK_ORDER_CONFIRMED"] as const;

const statusConfig: Record<string, { label: string; cls: string; description: string }> = {
  ACCEPTED: {
    label: "Preventivo accettato",
    cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    description: "Il preventivo è stato accettato. Avvia la nota lavori per iniziare il cantiere.",
  },
  WORK_ORDER_DRAFT: {
    label: "Nota lavori in bozza",
    cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    description: "La nota lavori è in bozza. Aprila per modificare le voci, aggiungerne di nuove o eliminarle, poi scarica il PDF e inviala al cliente.",
  },
  WORK_ORDER_SENT: {
    label: "Nota lavori inviata",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    description: "La nota lavori è stata inviata al cliente. Quando è confermata, premi il pulsante qui sotto.",
  },
  WORK_ORDER_CONFIRMED: {
    label: "Pronta per fatturazione",
    cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    description: "La nota lavori è confermata. L'opportunità è passata in «Da Fatturare».",
  },
};

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

export function NotaLavoriModal({ opportunityId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ["/api/opportunities", opportunityId, "quotes"],
    enabled: open,
  });

  // Priorità: preventivo in stato WO > ACCEPTED > qualsiasi altro
  const quote =
    quotes.find((q) => WO_STATUSES.includes(q.status as any)) ??
    quotes.find((q) => q.status === "DRAFT" || q.status === "SENT") ??
    quotes[0];
  const status = quote?.status ?? "";
  const cfg = statusConfig[status];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "quotes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
  };

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${quote!.id}/work-order/start`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Nota lavori avviata", description: "Ora puoi aprire l'editor per modificare le voci." });
    },
    onError: () => toast({ title: "Errore", description: "Impossibile avviare la nota lavori", variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${quote!.id}/work-order/confirm`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Nota lavori confermata", description: "L'opportunità è passata in «Da Fatturare»." });
    },
    onError: () => toast({ title: "Errore", description: "Impossibile confermare", variant: "destructive" }),
  });

  function openEditor() {
    onOpenChange(false);
    navigate(`/quotes/${quote!.id}?nl=true`);
  }

  const isPending = startMutation.isPending || confirmMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileCheck className="w-4 h-4 text-indigo-500" />
            Nota Lavori
            {quote && (
              <span className="font-normal text-muted-foreground text-sm">— {quote.number}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !quote && (
          <p className="text-sm text-muted-foreground py-4">
            Nessun preventivo trovato per questa opportunità. Crea prima un preventivo.
          </p>
        )}

        {/* Preventivo esiste ma non è ancora accettato */}
        {!isLoading && quote && !cfg && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 p-3">
              <Ban className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <div className="text-sm text-yellow-800 dark:text-yellow-300">
                <p className="font-medium">Preventivo non ancora accettato</p>
                <p className="text-xs mt-1">Il preventivo <strong>{quote.number}</strong> è in stato «{quote.status === "DRAFT" ? "Bozza" : "Inviato"}». Per avviare la nota lavori devi prima accettarlo dall'editor del preventivo.</p>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => { onOpenChange(false); window.location.href = `/quotes/${quote.id}`; }}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Apri preventivo {quote.number}
            </Button>
          </div>
        )}

        {!isLoading && quote && cfg && (
          <div className="space-y-4 py-2">
            {/* Badge stato */}
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>
              {cfg.label}
            </span>

            {/* Descrizione contestuale */}
            <p className="text-sm text-muted-foreground leading-relaxed">{cfg.description}</p>

            {/* Date */}
            {quote.workOrderSentAt && (
              <p className="text-xs text-muted-foreground">
                📤 Inviata il {fmtDate(quote.workOrderSentAt)}
              </p>
            )}
            {quote.workOrderConfirmedAt && (
              <p className="text-xs text-muted-foreground">
                ✅ Confermata il {fmtDate(quote.workOrderConfirmedAt)}
              </p>
            )}

            {/* Totale */}
            {quote.totalAmount && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
                <span className="text-xs text-muted-foreground">Importo preventivo</span>
                <span className="text-sm font-semibold">
                  € {parseFloat(quote.totalAmount).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">
            Chiudi
          </Button>

          {/* ACCEPTED → Avvia NL */}
          {status === "ACCEPTED" && (
            <Button onClick={() => startMutation.mutate()} disabled={isPending} data-testid="button-nl-start">
              {startMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
              Avvia Nota Lavori
            </Button>
          )}

          {/* DRAFT → Apri editor (pagina intera, con tutto) */}
          {status === "WORK_ORDER_DRAFT" && (
            <Button onClick={openEditor} data-testid="button-nl-open-editor">
              <ExternalLink className="w-4 h-4 mr-2" />
              Apri editor Nota Lavori
            </Button>
          )}

          {/* SENT → Apri editor (sola lettura utile) + Conferma */}
          {status === "WORK_ORDER_SENT" && (
            <>
              <Button variant="outline" onClick={openEditor} data-testid="button-nl-view">
                <ExternalLink className="w-4 h-4 mr-2" />
                Visualizza / PDF
              </Button>
              <Button onClick={() => confirmMutation.mutate()} disabled={isPending} data-testid="button-nl-confirm">
                {confirmMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Conferma Nota Lavori
              </Button>
            </>
          )}

          {/* CONFIRMED → solo visualizzazione */}
          {status === "WORK_ORDER_CONFIRMED" && (
            <Button variant="outline" onClick={openEditor} data-testid="button-nl-view-confirmed">
              <ExternalLink className="w-4 h-4 mr-2" />
              Visualizza PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
