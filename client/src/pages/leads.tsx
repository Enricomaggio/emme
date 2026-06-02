import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Users, Building2, User } from "lucide-react";
import type { Lead, LeadWithSummary } from "@shared/schema";

const ENTITY_LABEL: Record<string, string> = {
  COMPANY: "Azienda",
  PRIVATE: "Privato",
};

export default function LeadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [openCreate, setOpenCreate] = useState(false);

  const { data: leads = [], isLoading } = useQuery<LeadWithSummary[]>({
    queryKey: ["/api/leads"],
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return leads.filter((l) => {
      if (filterType !== "all" && l.type !== filterType) return false;
      if (filterEntity !== "all" && l.entityType !== filterEntity) return false;
      if (s) {
        const haystack = [
          l.name,
          l.firstName,
          l.lastName,
          l.email,
          l.phone,
          l.city,
          l.vatNumber,
          l.fiscalCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
  }, [leads, search, filterType, filterEntity]);

  return (
    <DashboardLayout user={user || undefined}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" /> Clienti
            </h1>
            <p className="text-sm text-muted-foreground">{filtered.length} di {leads.length}</p>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuovo cliente
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome, email, telefono, P.IVA..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="cliente">Cliente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterEntity} onValueChange={setFilterEntity}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="COMPANY">Aziende</SelectItem>
              <SelectItem value="PRIVATE">Privati</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nessun cliente trovato.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {filtered.map((lead) => {
                  const displayName =
                    lead.entityType === "COMPANY"
                      ? lead.name || "Senza nome"
                      : `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Senza nome";
                  return (
                    <Link key={lead.id} href={`/clienti/${lead.id}`}>
                      <div className="p-4 hover:bg-accent cursor-pointer">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {lead.entityType === "COMPANY" ? (
                              <Building2 className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                            ) : (
                              <User className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{displayName}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {lead.email || lead.phone || lead.city || "—"}
                              </p>
                              {lead.firstReferentName && (
                                <p className="text-xs text-muted-foreground">
                                  Ref: {lead.firstReferentName}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={lead.type === "cliente" ? "default" : "secondary"}>
                              {lead.type === "cliente" ? "Cliente" : "Lead"}
                            </Badge>
                            {lead.opportunitySummary.total > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {lead.opportunitySummary.total} opp
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <CreateLeadDialog open={openCreate} onClose={() => setOpenCreate(false)} />
    </DashboardLayout>
  );
}

function CreateLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<"COMPANY" | "PRIVATE">("COMPANY");
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");

  function reset() {
    setEntityType("COMPANY");
    setName("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setCity("");
    setSource("");
  }

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        entityType,
        type: "lead",
        email: email || null,
        phone: phone || null,
        city: city || null,
        source: source || null,
      };
      if (entityType === "COMPANY") payload.name = name;
      else {
        payload.firstName = firstName;
        payload.lastName = lastName;
      }
      const res = await apiRequest("POST", "/api/leads", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Cliente creato" });
      reset();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuovo cliente</DialogTitle>
          <DialogDescription>Aggiungi un nuovo cliente all'anagrafica.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={entityType} onValueChange={(v) => setEntityType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPANY">Azienda</SelectItem>
                <SelectItem value="PRIVATE">Privato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {entityType === "COMPANY" ? (
            <div className="space-y-1">
              <Label>Ragione sociale</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Cognome</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Telefono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Città</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fonte</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="es. Passaparola DaDo Ponteggi, LinkedIn, evento X..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Creazione..." : "Crea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
