import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, ChevronLeft, Send, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkOrderWithItems } from "@shared/schema";

// ── Utils ─────────────────────────────────────────────────────────────────

function formatEuro(value: string | number | null | undefined): string {
  const n = parseFloat(String(value ?? "0"));
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":     return "Bozza";
    case "SENT":      return "Inviata";
    case "CONFIRMED": return "Confermata";
    default:          return status;
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  switch (status) {
    case "DRAFT":     return "secondary";
    case "SENT":      return "default";
    case "CONFIRMED": return "outline";
    default:          return "secondary";
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function WorkOrderDetailPage() {
  const [, params] = useRoute("/work-orders/:id");
  const id = params?.id ?? "";

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wo, isLoading, error } = useQuery<WorkOrderWithItems>({
    queryKey: ["/api/work-orders", id],
    enabled: !!id,
    retry: 1,
  });

  const [subject, setSubject] = useState("");
  const [notes, setNotes]     = useState("");

  // Inizializza form quando la WO arriva dal server
  useEffect(() => {
    if (wo) {
      setSubject(wo.subject ?? "");
      setNotes(wo.notes ?? "");
    }
  }, [wo]);

  const isReadOnly = (wo?.status ?? "") === "CONFIRMED";

  // Salva oggetto + note
  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/work-orders/${id}`, { subject: subject || null, notes: notes || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", id] });
      toast({ title: "Nota Lavori aggiornata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore nel salvataggio", description: err.message, variant: "destructive" });
    },
  });

  // Invia NL (DRAFT → SENT): prima salva poi invia
  const sendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/work-orders/${id}`, { subject: subject || null, notes: notes || null });
      return apiRequest("POST", `/api/work-orders/${id}/send`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders?companyScope=all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities?won=true"] });
      toast({ title: "Nota Lavori inviata" });
      window.location.href = "/cantieri";
    },
    onError: (err: Error) => {
      toast({ title: "Errore nell'invio", description: err.message, variant: "destructive" });
    },
  });

  // Conferma NL (SENT → CONFIRMED)
  const confirmMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/work-orders/${id}/confirm`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders?companyScope=all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities?won=true"] });
      toast({ title: "Nota Lavori confermata" });
      window.location.href = "/cantieri";
    },
    onError: (err: Error) => {
      toast({ title: "Errore nella conferma", description: err.message, variant: "destructive" });
    },
  });

  const anyPending = saveMutation.isPending || sendMutation.isPending || confirmMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={() => window.location.href = "/cantieri"}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Cantieri
          </button>
          <span>/</span>
          <span className="text-foreground font-medium">
            {wo ? wo.number : "..."}
          </span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Caricamento...</span>
          </div>
        )}

        {/* Errore fetch */}
        {!isLoading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-3">
            <p className="font-medium text-destructive">Impossibile caricare la Nota Lavori</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/cantieri"}>
              Torna ai Cantieri
            </Button>
          </div>
        )}

        {/* Non trovata (nessun errore ma wo undefined) */}
        {!isLoading && !error && !wo && (
          <div className="rounded-lg border p-6 text-center space-y-3">
            <p className="text-muted-foreground">Nota Lavori non trovata.</p>
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/cantieri"}>
              Torna ai Cantieri
            </Button>
          </div>
        )}

        {wo && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">{wo.number}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Creata il {formatDate(wo.createdAt)}
                  {wo.sentAt && ` · Inviata il ${formatDate(wo.sentAt)}`}
                  {wo.confirmedAt && ` · Confermata il ${formatDate(wo.confirmedAt)}`}
                </p>
              </div>
              <Badge variant={statusVariant(wo.status)} className="text-sm px-3 py-1 shrink-0">
                {statusLabel(wo.status)}
              </Badge>
            </div>

            {/* Oggetto e Note */}
            <div className="rounded-lg border p-5 space-y-4">
              <h2 className="text-base font-semibold">Intestazione</h2>

              <div className="space-y-1.5">
                <Label htmlFor="wo-subject">Oggetto</Label>
                <Input
                  id="wo-subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Es. Ristrutturazione copertura Via Roma..."
                  disabled={isReadOnly}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wo-notes">Note</Label>
                <Textarea
                  id="wo-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Note aggiuntive per il cliente..."
                  rows={3}
                  disabled={isReadOnly}
                />
              </div>

              {!isReadOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={anyPending}
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salva modifiche
                </Button>
              )}
            </div>

            {/* Tabella voci */}
            <div className="rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
                <h2 className="text-base font-semibold">Voci</h2>
                <span className="text-sm text-muted-foreground">
                  {wo.items.length} {wo.items.length === 1 ? "voce" : "voci"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-4 py-2 text-left font-medium">Descrizione</th>
                      <th className="px-4 py-2 text-center font-medium">UdM</th>
                      <th className="px-4 py-2 text-right font-medium">Qtà</th>
                      <th className="px-4 py-2 text-right font-medium">P. unitario</th>
                      <th className="px-4 py-2 text-right font-medium">Totale riga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wo.items.map((item, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="px-4 py-3 max-w-xs">
                          <span className="line-clamp-2">{item.description || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground">
                          {item.unitOfMeasure || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {parseFloat(item.quantity) > 0 ? parseFloat(item.quantity) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {parseFloat(item.unitPrice) > 0 ? formatEuro(item.unitPrice) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatEuro(item.totalRow)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/10">
                      <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">
                        TOTALE
                      </td>
                      <td className="px-4 py-3 text-right text-base font-semibold">
                        {formatEuro(wo.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Azioni */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => window.location.href = "/cantieri"}
              >
                Torna ai Cantieri
              </Button>

              <div className="flex gap-3">
                {wo.status === "DRAFT" && (
                  <Button
                    onClick={() => sendMutation.mutate()}
                    disabled={anyPending}
                  >
                    {sendMutation.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Send className="h-4 w-4 mr-2" />}
                    Invia Nota Lavori
                  </Button>
                )}

                {wo.status === "SENT" && (
                  <Button
                    onClick={() => confirmMutation.mutate()}
                    disabled={anyPending}
                  >
                    {confirmMutation.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <CheckCircle className="h-4 w-4 mr-2" />}
                    Conferma ricezione
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
