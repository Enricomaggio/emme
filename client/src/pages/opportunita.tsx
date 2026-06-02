import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Target } from "lucide-react";
import type { Opportunity, PipelineStage, OpportunityMilestone, Lead } from "@shared/schema";

type OpportunityWithExtras = Opportunity & {
  referentName?: string | null;
  leadName?: string | null;
};

export default function OpportunitaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const oppId = params.get("open");
    if (oppId) setOpenId(oppId);
  }, [search]);

  const { data: stages = [] } = useQuery<PipelineStage[]>({ queryKey: ["/api/stages"] });
  const { data: opps = [] } = useQuery<OpportunityWithExtras[]>({ queryKey: ["/api/opportunities"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });

  const oppsByStage = useMemo(() => {
    const map = new Map<string, OpportunityWithExtras[]>();
    for (const s of stages) map.set(s.id, []);
    for (const o of opps) {
      if (o.stageId && map.has(o.stageId)) map.get(o.stageId)!.push(o);
    }
    return map;
  }, [stages, opps]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const move = useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string }) => {
      await apiRequest("PUT", `/api/opportunities/${id}/move`, { stageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const oppId = e.active.id as string;
    const stageId = e.over?.id as string | undefined;
    if (!stageId) return;
    const opp = opps.find((o) => o.id === oppId);
    if (!opp || opp.stageId === stageId) return;
    move.mutate({ id: oppId, stageId });
  }

  function leadNameOf(leadId: string): string {
    const l = leadsById.get(leadId);
    if (!l) return "—";
    return l.entityType === "COMPANY"
      ? l.name || "Senza nome"
      : `${l.firstName || ""} ${l.lastName || ""}`.trim() || "Senza nome";
  }

  const activeOpp = activeId ? opps.find((o) => o.id === activeId) : null;

  return (
    <DashboardLayout user={user || undefined} fullWidth>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="w-6 h-6" /> Pipeline
            </h1>
            <p className="text-sm text-muted-foreground">{opps.length} opportunità</p>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuova opportunità
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                opps={oppsByStage.get(stage.id) || []}
                leadNameOf={leadNameOf}
                onCardClick={(id) => setOpenId(id)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeOpp ? (
              <OppCard
                opp={activeOpp}
                leadName={leadNameOf(activeOpp.leadId)}
                stageColor=""
                onClick={() => {}}
                dragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {openCreate && (
        <NewOpportunityDialog
          stages={stages}
          leads={leads}
          onClose={() => setOpenCreate(false)}
        />
      )}

      {openId && (
        <OpportunityDialog
          opportunityId={openId}
          onClose={() => {
            setOpenId(null);
            const params = new URLSearchParams(search);
            params.delete("open");
            navigate(`/pipeline${params.toString() ? `?${params}` : ""}`);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function Column({
  stage,
  opps,
  leadNameOf,
  onCardClick,
}: {
  stage: PipelineStage;
  opps: OpportunityWithExtras[];
  leadNameOf: (id: string) => string;
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = opps.reduce((sum, o) => sum + (o.value ? parseFloat(o.value) : 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "shrink-0 w-72 bg-muted/40 rounded-lg p-2 flex flex-col gap-2",
        isOver && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
          <span className="font-medium text-sm">{stage.name}</span>
          <Badge variant="secondary" className="text-xs">{opps.length}</Badge>
        </div>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">€ {formatCurrency(total)}</span>
        )}
      </div>
      <div className="space-y-2 min-h-[100px]">
        {opps.map((o) => (
          <OppCard
            key={o.id}
            opp={o}
            leadName={leadNameOf(o.leadId)}
            stageColor={stage.color}
            onClick={() => onCardClick(o.id)}
          />
        ))}
      </div>
    </div>
  );
}

function OppCard({
  opp,
  leadName,
  stageColor,
  onClick,
  dragging,
}: {
  opp: OpportunityWithExtras;
  leadName: string;
  stageColor: string;
  onClick: () => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer hover:bg-accent",
        (isDragging || dragging) && "opacity-60 ring-2 ring-primary shadow-lg",
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm leading-tight">{opp.title}</p>
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground touch-none cursor-grab"
            aria-label="Trascina"
          >
            ⋮⋮
          </button>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{leadName}</p>
        {opp.value && (
          <p className="text-sm font-semibold">€ {formatCurrency(parseFloat(opp.value))}</p>
        )}
        {parseFloat(opp.invoicedAmount || "0") > 0 && (
          <p className="text-xs text-emerald-600">
            Fatturato: € {formatCurrency(parseFloat(opp.invoicedAmount))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function NewOpportunityDialog({
  stages,
  leads,
  onClose,
}: {
  stages: PipelineStage[];
  leads: Lead[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [leadId, setLeadId] = useState("");
  const [stageId, setStageId] = useState(stages[0]?.id || "");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!stageId && stages[0]) setStageId(stages[0].id);
  }, [stages, stageId]);

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/opportunities", {
        title,
        leadId,
        stageId,
        value: value || null,
        description: description || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      toast({ title: "Opportunità creata" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova opportunità</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Titolo</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cliente</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona cliente" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((l) => {
                  const name =
                    l.entityType === "COMPANY"
                      ? l.name || "Senza nome"
                      : `${l.firstName || ""} ${l.lastName || ""}`.trim() || "Senza nome";
                  return (
                    <SelectItem key={l.id} value={l.id}>{name}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Stadio</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Valore stimato (€)</Label>
              <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrizione</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => create.mutate()} disabled={!title || !leadId || create.isPending}>
            {create.isPending ? "Creazione..." : "Crea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpportunityDialog({
  opportunityId,
  onClose,
}: {
  opportunityId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: opp } = useQuery<Opportunity & { leadName?: string; leadNotes?: string | null }>({
    queryKey: [`/api/opportunities/${opportunityId}`],
  });
  const { data: stages = [] } = useQuery<PipelineStage[]>({ queryKey: ["/api/stages"] });

  const update = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/opportunities/${opportunityId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/opportunities/${opportunityId}`);
    },
    onSuccess: () => {
      toast({ title: "Opportunità eliminata" });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{opp?.title || "Opportunità"}</DialogTitle>
        </DialogHeader>
        {!opp ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : (
          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">Dettagli</TabsTrigger>
              <TabsTrigger value="milestones">Milestone</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-3 pt-3">
              <OpportunityInfo opp={opp} stages={stages} update={update.mutate} updating={update.isPending} />
              <div className="pt-3 border-t">
                <Button variant="destructive" size="sm" onClick={() => {
                  if (confirm("Eliminare l'opportunità? Anche le milestone collegate verranno rimosse.")) {
                    remove.mutate();
                  }
                }}>
                  <Trash2 className="w-4 h-4 mr-1" /> Elimina opportunità
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="milestones" className="pt-3">
              <MilestonesSection opportunityId={opportunityId} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OpportunityInfo({
  opp,
  stages,
  update,
  updating,
}: {
  opp: Opportunity & { leadName?: string; leadNotes?: string | null };
  stages: PipelineStage[];
  update: (data: any) => void;
  updating: boolean;
}) {
  const [title, setTitle] = useState(opp.title);
  const [description, setDescription] = useState(opp.description || "");
  const [value, setValue] = useState(opp.value || "");
  const [contractTotal, setContractTotal] = useState(opp.contractTotal || "");
  const [stageId, setStageId] = useState(opp.stageId || "");
  const [expectedClose, setExpectedClose] = useState(
    opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toISOString().slice(0, 10) : "",
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Cliente</Label>
        <Input value={opp.leadName || ""} disabled />
      </div>
      <div className="space-y-1">
        <Label>Titolo</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Stadio</Label>
        <Select value={stageId} onValueChange={setStageId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Valore stimato (€)</Label>
          <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Valore contratto (€)</Label>
          <Input type="number" step="0.01" value={contractTotal} onChange={(e) => setContractTotal(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Chiusura prevista</Label>
        <Input type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Descrizione</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Fatturato</p>
          <p className="font-semibold text-emerald-600">€ {formatCurrency(parseFloat(opp.invoicedAmount || "0"))}</p>
        </div>
        {opp.wonAt && <div><Badge>Completata</Badge></div>}
      </div>
      <Button
        onClick={() =>
          update({
            title,
            description: description || null,
            value: value || null,
            contractTotal: contractTotal || null,
            stageId: stageId || null,
            expectedCloseDate: expectedClose ? new Date(expectedClose).toISOString() : null,
          })
        }
        disabled={updating}
      >
        {updating ? "Salvataggio..." : "Salva"}
      </Button>
    </div>
  );
}

function MilestonesSection({ opportunityId }: { opportunityId: string }) {
  const { toast } = useToast();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<OpportunityMilestone | null>(null);

  const { data: milestones = [] } = useQuery<OpportunityMilestone[]>({
    queryKey: [`/api/opportunities/${opportunityId}/milestones`],
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/milestones/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/milestones`] });
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Rata eliminata" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/milestones/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/milestones`] });
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  const total = milestones.reduce((s, m) => s + parseFloat(m.amount), 0);
  const invoiced = milestones
    .filter((m) => m.status === "invoiced" || m.status === "paid")
    .reduce((s, m) => s + parseFloat(m.amount), 0);
  const paid = milestones
    .filter((m) => m.status === "paid")
    .reduce((s, m) => s + parseFloat(m.amount), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Totale rate</p>
            <p className="font-bold">€ {formatCurrency(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Fatturato</p>
            <p className="font-bold text-amber-600">€ {formatCurrency(invoiced)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Incassato</p>
            <p className="font-bold text-emerald-600">€ {formatCurrency(paid)}</p>
          </CardContent>
        </Card>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => { setEditing(null); setOpenForm(true); }}
      >
        <Plus className="w-4 h-4 mr-1" /> Nuova rata
      </Button>

      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna rata configurata.</p>
      ) : (
        <div className="space-y-2">
          {milestones.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">€ {formatCurrency(parseFloat(m.amount))}</p>
                    <StatusBadge status={m.status} />
                  </div>
                  {m.description && (
                    <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Fattura: {m.invoiceDate ? new Date(m.invoiceDate).toLocaleDateString("it-IT") : "—"}
                    {" · "}
                    Incasso: {m.paymentDate ? new Date(m.paymentDate).toLocaleDateString("it-IT") : "—"}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Select
                    value={m.status}
                    onValueChange={(v) => updateStatus.mutate({ id: m.id, status: v })}
                  >
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">In attesa</SelectItem>
                      <SelectItem value="invoiced">Fatturata</SelectItem>
                      <SelectItem value="paid">Pagata</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditing(m); setOpenForm(true); }}
                      className="text-xs"
                    >
                      Modifica
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Eliminare la rata?")) remove.mutate(m.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {openForm && (
        <MilestoneFormDialog
          opportunityId={opportunityId}
          milestone={editing}
          onClose={() => { setOpenForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <Badge className="bg-emerald-600 hover:bg-emerald-700">Pagata</Badge>;
  if (status === "invoiced")
    return <Badge className="bg-amber-500 hover:bg-amber-600">Fatturata</Badge>;
  return <Badge variant="secondary">In attesa</Badge>;
}

function MilestoneFormDialog({
  opportunityId,
  milestone,
  onClose,
}: {
  opportunityId: string;
  milestone: OpportunityMilestone | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(milestone?.amount || "");
  const [description, setDescription] = useState(milestone?.description || "");
  const [status, setStatus] = useState<string>(milestone?.status || "pending");
  const [invoiceDate, setInvoiceDate] = useState(
    milestone?.invoiceDate ? new Date(milestone.invoiceDate).toISOString().slice(0, 10) : "",
  );
  const [paymentDate, setPaymentDate] = useState(
    milestone?.paymentDate ? new Date(milestone.paymentDate).toISOString().slice(0, 10) : "",
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        amount,
        description: description || null,
        status,
        invoiceDate: invoiceDate ? new Date(invoiceDate).toISOString() : null,
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : null,
      };
      if (milestone) {
        await apiRequest("PATCH", `/api/milestones/${milestone.id}`, payload);
      } else {
        await apiRequest("POST", `/api/opportunities/${opportunityId}/milestones`, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/milestones`] });
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: milestone ? "Rata aggiornata" : "Rata creata" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{milestone ? "Modifica rata" : "Nuova rata"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Importo (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Data fatturazione</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data incasso</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrizione</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="es. Acconto 30%" />
          </div>
          <div className="space-y-1">
            <Label>Stato</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">In attesa</SelectItem>
                <SelectItem value="invoiced">Fatturata</SelectItem>
                <SelectItem value="paid">Pagata</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => save.mutate()} disabled={!amount || save.isPending}>
            {save.isPending ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
