import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const { data: me } = useQuery<Me>({ queryKey: ["/api/me"] });

  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName || "");
      setContactEmail(me.contactEmail || "");
      setPhone(me.phone || "");
    }
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/users/profile", {
        displayName,
        contactEmail,
        phone,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profilo aggiornato" });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const changePwd = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/users/change-password", {
        currentPassword: currentPwd,
        newPassword: newPwd,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password aggiornata" });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  function handleChangePwd(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      toast({ title: "Errore", description: "Le password non coincidono", variant: "destructive" });
      return;
    }
    changePwd.mutate();
  }

  return (
    <DashboardLayout user={user || undefined}>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Impostazioni</h1>
          <p className="text-sm text-muted-foreground">Gestisci il tuo profilo e la sicurezza dell'account.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profilo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Email di login</Label>
                <Input value={me?.email || ""} disabled />
              </div>
              <div className="space-y-1">
                <Label>Nome visualizzato</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Email di contatto</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Telefono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Salvataggio..." : "Salva profilo"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cambia password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePwd} className="space-y-3">
              <div className="space-y-1">
                <Label>Password corrente</Label>
                <Input
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Nuova password</Label>
                <Input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Min 8 caratteri, con maiuscola, minuscola e numero.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Conferma nuova password</Label>
                <Input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={changePwd.isPending}>
                {changePwd.isPending ? "Aggiornamento..." : "Aggiorna password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
