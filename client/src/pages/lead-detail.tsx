import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import type { Lead, ContactReferent, Opportunity } from "@shared/schema";

interface LeadDetail extends Lead {
  firstReferentName: string | null;
  firstReferentEmail: string | null;
  firstReferentPhone: string | null;
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openNewOpp, setOpenNewOpp] = useState(false);

  const { data: lead, isLoading } = useQuery<LeadDetail>({
    queryKey: [`/api/leads/${params.id}`],
  });

  const { data: opportunities = [] } = useQuery<Opportunity[]>({
    queryKey: [`/api/leads/${params.id}/opportunities`],
    enabled: !!params.id,
  });

  const { data: referents = [] } = useQuery<ContactReferent[]>({
    queryKey: [`/api/leads/${params.id}/referents`],
    enabled: !!params.id && lead?.entityType === "COMPANY",
  });

  const deleteLead = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/leads/${params.id}`);
    },
    onSuccess: () => {
      toast({ title: "Cliente eliminato" });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      navigate("/clienti");
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <DashboardLayout user={user || undefined}>
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      </DashboardLayout>
    );
  }

  if (!lead) {
    return (
      <DashboardLayout user={user || undefined}>
        <p className="text-sm text-destructive">Cliente non trovato.</p>
      </DashboardLayout>
    );
  }

  const displayName =
    lead.entityType === "COMPANY"
      ? lead.name || "Senza nome"
      : `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Senza nome";

  return (
    <DashboardLayout user={user || undefined}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{displayName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={lead.type === "cliente" ? "default" : "secondary"}>
                  {lead.type === "cliente" ? "Cliente" : "Lead"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {lead.entityType === "COMPANY" ? "Azienda" : "Privato"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpenEdit(true)}>
              <Pencil className="w-4 h-4 mr-1" /> Modifica
            </Button>
            <Button variant="destructive" onClick={() => setOpenDelete(true)}>
              <Trash2 className="w-4 h-4 mr-1" /> Elimina
            </Button>
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Anagrafica</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunità ({opportunities.length})</TabsTrigger>
            {lead.entityType === "COMPANY" && (
              <TabsTrigger value="referents">Referenti ({referents.length})</TabsTrigger>
            )}
            <TabsTrigger value="notes">Note</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3 pt-3">
            <Card>
              <CardContent className="p-4 space-y-2">
                <InfoRow label="Email" value={lead.email} />
                <InfoRow label="Telefono" value={lead.phone} />
                <InfoRow label="Indirizzo" value={[lead.address, lead.zipCode, lead.city, lead.province].filter(Boolean).join(", ") || null} />
                <InfoRow label="Fonte" value={lead.source} />
                {lead.entityType === "COMPANY" && (
                  <>
                    <InfoRow label="P.IVA" value={lead.vatNumber} />
                    <InfoRow label="Codice SDI" value={lead.sdiCode} />
                    <InfoRow label="PEC" value={lead.pecEmail} />
                  </>
                )}
                <InfoRow label="Codice fiscale" value={lead.fiscalCode} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="opportunities" className="space-y-3 pt-3">
            <Button variant="outline" size="sm" onClick={() => setOpenNewOpp(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nuova opportunità
            </Button>
            {opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna opportunità ancora.</p>
            ) : (
              <div className="space-y-2">
                {opportunities.map((opp) => (
                  <Link key={opp.id} href={`/pipeline?open=${opp.id}`}>
                    <Card className="cursor-pointer hover:bg-accent">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{opp.title}</p>
                          {opp.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{opp.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{opp.value ? `€ ${formatCurrency(parseFloat(opp.value))}` : "—"}</p>
                          {opp.wonAt && <Badge variant="default" className="mt-1">Vinta</Badge>}
                          {opp.lostAt && <Badge variant="destructive" className="mt-1">Persa</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {lead.entityType === "COMPANY" && (
            <TabsContent value="referents" className="space-y-3 pt-3">
              <ReferentsTab leadId={lead.id} referents={referents} />
            </TabsContent>
          )}

          <TabsContent value="notes" className="space-y-3 pt-3">
            <NotesEditor lead={lead} />
          </TabsContent>
        </Tabs>
      </div>

      <EditLeadDialog lead={lead} open={openEdit} onClose={() => setOpenEdit(false)} />
      <NewOpportunityDialog leadId={lead.id} open={openNewOpp} onClose={() => setOpenNewOpp(false)} />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminate anche tutte le opportunità, le milestone e i referenti collegati. Azione non reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteLead.mutate()}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

function EditLeadDialog({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: lead.name || "",
    firstName: lead.firstName || "",
    lastName: lead.lastName || "",
    type: lead.type,
    email: lead.email || "",
    phone: lead.phone || "",
    address: lead.address || "",
    city: lead.city || "",
    zipCode: lead.zipCode || "",
    province: lead.province || "",
    vatNumber: lead.vatNumber || "",
    fiscalCode: lead.fiscalCode || "",
    sdiCode: lead.sdiCode || "",
    pecEmail: lead.pecEmail || "",
    source: lead.source || "",
  });

  const update = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      for (const [k, v] of Object.entries(form)) {
        payload[k] = v === "" ? null : v;
      }
      const res = await apiRequest("PATCH", `/api/leads/${lead.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cliente aggiornato" });
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${lead.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifica cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {lead.entityType === "COMPANY" ? (
            <div className="space-y-1">
              <Label>Ragione sociale</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Cognome</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Telefono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Indirizzo</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>CAP</Label>
              <Input value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Città</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Prov</Label>
              <Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
            </div>
          </div>
          {lead.entityType === "COMPANY" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>P.IVA</Label>
                <Input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Codice SDI</Label>
                <Input value={form.sdiCode} onChange={(e) => setForm({ ...form, sdiCode: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>PEC</Label>
                <Input value={form.pecEmail} onChange={(e) => setForm({ ...form, pecEmail: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Codice fiscale</Label>
                <Input value={form.fiscalCode} onChange={(e) => setForm({ ...form, fiscalCode: e.target.value })} />
              </div>
            </div>
          )}
          {lead.entityType === "PRIVATE" && (
            <div className="space-y-1">
              <Label>Codice fiscale</Label>
              <Input value={form.fiscalCode} onChange={(e) => setForm({ ...form, fiscalCode: e.target.value })} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Fonte</Label>
            <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="testo libero" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferentsTab({ leadId, referents }: { leadId: string; referents: ContactReferent[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContactReferent | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "" });

  function reset() {
    setForm({ firstName: "", lastName: "", email: "", phone: "", role: "" });
    setEditing(null);
  }

  function openEdit(r: ContactReferent) {
    setEditing(r);
    setForm({
      firstName: r.firstName || "",
      lastName: r.lastName || "",
      email: r.email || "",
      phone: r.phone || "",
      role: r.role || "",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        email: form.email || null,
        phone: form.phone || null,
        role: form.role || null,
      };
      if (editing) {
        await apiRequest("PATCH", `/api/referents/${editing.id}`, payload);
      } else {
        await apiRequest("POST", `/api/leads/${leadId}/referents`, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}/referents`] });
      toast({ title: editing ? "Referente aggiornato" : "Referente creato" });
      reset();
      setOpen(false);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/referents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}/referents`] });
      toast({ title: "Referente eliminato" });
    },
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="w-4 h-4 mr-1" /> Nuovo referente
      </Button>
      {referents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun referente.</p>
      ) : (
        <div className="space-y-2">
          {referents.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{`${r.firstName || ""} ${r.lastName || ""}`.trim()}</p>
                  {r.role && <p className="text-xs text-muted-foreground">{r.role}</p>}
                  <p className="text-xs text-muted-foreground">
                    {[r.email, r.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); setOpen(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica referente" : "Nuovo referente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Cognome</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Ruolo</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Telefono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>Annulla</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotesEditor({ lead }: { lead: Lead }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(lead.notes || "");
  useEffect(() => setNotes(lead.notes || ""), [lead.notes]);

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/leads/${lead.id}`, { notes });
    },
    onSuccess: () => {
      toast({ title: "Note salvate" });
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${lead.id}`] });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          placeholder="Note libere su questo cliente..."
        />
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvataggio..." : "Salva note"}
        </Button>
      </CardContent>
    </Card>
  );
}

function NewOpportunityDialog({ leadId, open, onClose }: { leadId: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const { data: stages = [] } = useQuery<Array<{ id: string; name: string; order: number }>>({
    queryKey: ["/api/stages"],
  });
  const firstStage = stages.sort((a, b) => a.order - b.order)[0];

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/opportunities", {
        title,
        leadId,
        stageId: firstStage?.id,
        value: value ? value : null,
        description: description || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Opportunità creata" });
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}/opportunities`] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      setTitle("");
      setValue("");
      setDescription("");
      onClose();
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
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
            <Label>Valore stimato (€)</Label>
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Descrizione</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => create.mutate()} disabled={!title || create.isPending}>
            {create.isPending ? "Creazione..." : "Crea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
