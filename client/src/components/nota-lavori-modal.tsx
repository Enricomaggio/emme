import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  FileCheck,
  Plus,
  Trash2,
  Save,
  ClipboardList,
} from "lucide-react";
import type { WorkOrderWithItems, Quote } from "@shared/schema";
import { WorkOrderPdfActions } from "@/pdf/WorkOrderPdfActions";

interface Props {
  opportunityId: string;
  opportunityTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LocalItem {
  _key: string; // local-only key for React list rendering
  description: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  totalRow: string;
  displayOrder: number;
}

function newKey() {
  return Math.random().toString(36).slice(2);
}

function computeTotal(qty: string, price: string): string {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  return (q * p).toFixed(2);
}

function fmtEuro(n: string | number | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  if (!isFinite(v as number)) return "0,00";
  return (v as number).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function woToLocalItems(wo: WorkOrderWithItems): LocalItem[] {
  // Guardia difensiva: items potrebbe essere undefined se il dato in cache
  // è stale o in un formato inatteso (es. array legacy).
  if (!wo?.items) return [];
  return wo.items.map((it, i) => ({
    _key: newKey(),
    description: it.description,
    unitOfMeasure: it.unitOfMeasure,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    totalRow: it.totalRow,
    displayOrder: i,
  }));
}

export function NotaLavoriModal({
  opportunityId,
  opportunityTitle,
  open,
  onOpenChange,
}: Props) {
  const { toast } = useToast();

  // ── Remote data ─────────────────────────────────────────────────────────────
  const { data: wo, isLoading: woLoading } = useQuery<WorkOrderWithItems | null>({
    queryKey: ["/api/work-orders", { opportunityId }],
    queryFn: () =>
      apiRequest("GET", `/api/work-orders?opportunityId=${opportunityId}`).then(
        async (r) => {
          const data = await r.json();
          // Il backend restituisce un singolo WO o null.
          // Se per qualsiasi motivo arrivasse un array (cache stale),
          // prendiamo l'ultimo elemento o null.
          if (Array.isArray(data)) return data.length > 0 ? data[data.length - 1] : null;
          return data as WorkOrderWithItems | null;
        }
      ),
    enabled: open,
  });

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/opportunities", opportunityId, "quotes"],
    enabled: open && wo === null,
  });

  // ── Local editable state ─────────────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LocalItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local state when WO loads or modal opens
  useEffect(() => {
    if (wo) {
      setSubject(wo.subject ?? "");
      setNotes(wo.notes ?? "");
      setItems(woToLocalItems(wo));
      setIsDirty(false);
    }
  }, [wo]);

  // Reset dirty when modal closes
  useEffect(() => {
    if (!open) {
      setIsDirty(false);
    }
  }, [open]);

  const woQueryKey = ["/api/work-orders", { opportunityId }];

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload: { opportunityId: string; quoteId?: string }) =>
      apiRequest("POST", "/api/work-orders", payload).then((r) => r.json()),
    onSuccess: (created: WorkOrderWithItems) => {
      // Update cache directly — avoids flash back to "create" screen during re-fetch
      queryClient.setQueryData(woQueryKey, created);
      setSubject(created.subject ?? "");
      setNotes(created.notes ?? "");
      setItems(woToLocalItems(created));
      setIsDirty(false);
      toast({ title: "Nota lavori creata" });
    },
    onError: () =>
      toast({
        title: "Errore",
        description: "Impossibile creare la nota lavori",
        variant: "destructive",
      }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      subject: string | null;
      notes: string | null;
      totalAmount: string;
      items: Omit<LocalItem, "_key">[];
    }) =>
      apiRequest("PUT", `/api/work-orders/${payload.id}`, {
        subject: payload.subject,
        notes: payload.notes,
        totalAmount: payload.totalAmount,
        items: payload.items,
      }).then((r) => r.json()),
    onSuccess: (saved: WorkOrderWithItems) => {
      queryClient.setQueryData(woQueryKey, saved);
      setItems(woToLocalItems(saved));
      setIsDirty(false);
      toast({ title: "Nota lavori salvata" });
    },
    onError: () =>
      toast({
        title: "Errore",
        description: "Impossibile salvare",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/work-orders/${id}`),
    onSuccess: () => {
      queryClient.setQueryData(woQueryKey, null);
      setSubject("");
      setNotes("");
      setItems([]);
      setIsDirty(false);
      toast({ title: "Nota lavori eliminata" });
    },
    onError: () =>
      toast({
        title: "Errore",
        description: "Impossibile eliminare",
        variant: "destructive",
      }),
  });

  // ── Items handlers ────────────────────────────────────────────────────────────
  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        _key: newKey(),
        description: "",
        unitOfMeasure: "ml",
        quantity: "1",
        unitPrice: "0",
        totalRow: "0",
        displayOrder: prev.length,
      },
    ]);
    setIsDirty(true);
  };

  const removeRow = (key: string) => {
    setItems((prev) => prev.filter((it) => it._key !== key));
    setIsDirty(true);
  };

  const updateRow = useCallback(
    (key: string, field: keyof Omit<LocalItem, "_key" | "displayOrder">, value: string) => {
      setItems((prev) =>
        prev.map((it) => {
          if (it._key !== key) return it;
          const updated = { ...it, [field]: value };
          // Auto-compute total when qty or price changes
          if (field === "quantity" || field === "unitPrice") {
            updated.totalRow = computeTotal(
              field === "quantity" ? value : it.quantity,
              field === "unitPrice" ? value : it.unitPrice
            );
          }
          return updated;
        })
      );
      setIsDirty(true);
    },
    []
  );

  // ── Computed totals ──────────────────────────────────────────────────────────
  const subtotale = items.reduce((s, it) => s + (parseFloat(it.totalRow) || 0), 0);
  const iva = subtotale * 0.22;
  const totale = subtotale + iva;

  // ── Save handler ─────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!wo) return;
    saveMutation.mutate({
      id: wo.id,
      subject: subject || null,
      notes: notes || null,
      totalAmount: subtotale.toFixed(2),
      items: items.map(({ _key, ...rest }, i) => ({ ...rest, displayOrder: i })),
    });
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const acceptedQuote = quotes.find(
    (q) => q.status === "ACCEPTED" || q.status?.startsWith("WORK_ORDER")
  );
  const isPending =
    createMutation.isPending || saveMutation.isPending || deleteMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileCheck className="w-4 h-4 text-indigo-500" />
            Nota Lavori
            {wo && (
              <span className="font-normal text-muted-foreground text-sm">
                — {wo.number}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Loading */}
        {woLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Nessuna NL esistente → schermata creazione */}
        {!woLoading && wo === null && (
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Non esiste ancora una nota lavori per questa opportunità.
            </p>
            <div className="flex flex-col gap-2">
              {acceptedQuote && (
                <Button
                  onClick={() =>
                    createMutation.mutate({
                      opportunityId,
                      quoteId: acceptedQuote.id,
                    })
                  }
                  disabled={isPending}
                  className="w-full justify-start"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ClipboardList className="w-4 h-4 mr-2" />
                  )}
                  Crea dal preventivo {acceptedQuote.number}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => createMutation.mutate({ opportunityId })}
                disabled={isPending}
                className="w-full justify-start"
              >
                {createMutation.isPending && !acceptedQuote ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Crea vuota
              </Button>
            </div>
          </div>
        )}

        {/* NL esistente → editor */}
        {!woLoading && wo !== null && wo !== undefined && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Oggetto */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Oggetto
              </label>
              <Input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="es. Rifacimento grondaie — Via Roma 12, Treviso"
              />
            </div>

            {/* Tabella righe */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Voci
              </label>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-[40%]">
                        Descrizione
                      </th>
                      <th className="text-right px-3 py-2 font-medium w-[12%]">
                        Quantità
                      </th>
                      <th className="text-right px-3 py-2 font-medium w-[10%]">
                        U.M.
                      </th>
                      <th className="text-right px-3 py-2 font-medium w-[15%]">
                        Prezzo unit.
                      </th>
                      <th className="text-right px-3 py-2 font-medium w-[15%]">
                        Totale
                      </th>
                      <th className="w-[8%]" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center text-muted-foreground py-6 text-sm"
                        >
                          Nessuna voce. Clicca «Aggiungi riga» per iniziare.
                        </td>
                      </tr>
                    )}
                    {items.map((item) => (
                      <tr
                        key={item._key}
                        className="border-t hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-2 py-1">
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              updateRow(item._key, "description", e.target.value)
                            }
                            placeholder="Descrizione"
                            className="h-8 text-sm border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(e) =>
                              updateRow(item._key, "quantity", e.target.value)
                            }
                            className="h-8 text-sm text-right border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            value={item.unitOfMeasure}
                            onChange={(e) =>
                              updateRow(item._key, "unitOfMeasure", e.target.value)
                            }
                            className="h-8 text-sm text-right border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40"
                            list="um-options"
                          />
                          <datalist id="um-options">
                            <option value="ml" />
                            <option value="mq" />
                            <option value="pz" />
                            <option value="cad" />
                            <option value="gg" />
                            <option value="h" />
                            <option value="kg" />
                          </datalist>
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateRow(item._key, "unitPrice", e.target.value)
                            }
                            className="h-8 text-sm text-right border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40"
                          />
                        </td>
                        <td className="px-3 py-1 text-right font-medium">
                          € {fmtEuro(item.totalRow)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(item._key)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addRow}
                className="mt-1"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Aggiungi riga
              </Button>
            </div>

            {/* Riepilogo totali */}
            <div className="flex justify-end">
              <div className="space-y-1 text-sm min-w-[220px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Imponibile</span>
                  <span>€ {fmtEuro(subtotale)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA 22%</span>
                  <span>€ {fmtEuro(iva)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Totale</span>
                  <span>€ {fmtEuro(totale)}</span>
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Note
              </label>
              <Textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Note aggiuntive per la nota lavori..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 flex-col gap-2 sm:flex-row sm:gap-2 pt-2 border-t">
          {/* Elimina (solo se WO esiste) */}
          {wo && (
            <Button
              variant="ghost"
              size="sm"
              className="sm:mr-auto text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("Eliminare la nota lavori? L'operazione non è reversibile.")) {
                  deleteMutation.mutate(wo.id);
                }
              }}
              disabled={isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Elimina
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Chiudi
          </Button>

          {wo && (
            <>
              <WorkOrderPdfActions
                workOrderId={wo.id}
                workOrder={wo}
                status={wo.status}
                opportunityId={wo.opportunityId}
                onSent={() => {
                  queryClient.invalidateQueries({ queryKey: woQueryKey });
                }}
              />

              <Button
                onClick={handleSave}
                disabled={isPending || !isDirty}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salva
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
