import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { APP_CONFIG } from "@/lib/config";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setVerifying(false);
      return;
    }
    setToken(t);
    fetch(`/api/auth/verify-reset/${t}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).message);
        return res.json();
      })
      .then((data) => {
        setValid(true);
        setEmail(data.email);
      })
      .catch((err) => {
        toast({ title: "Link non valido", description: err.message, variant: "destructive" });
      })
      .finally(() => setVerifying(false));
  }, [toast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Errore", description: "Le password non coincidono", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: "Password aggiornata", description: "Ora puoi accedere" });
      navigate("/login");
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{APP_CONFIG.appName}</CardTitle>
          <CardDescription>Reset password</CardDescription>
        </CardHeader>
        <CardContent>
          {verifying ? (
            <p className="text-sm text-muted-foreground text-center">Verifica del link...</p>
          ) : !valid ? (
            <p className="text-sm text-destructive text-center">Link non valido o scaduto.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {email && <p className="text-sm text-muted-foreground">{email}</p>}
              <div className="space-y-2">
                <Label htmlFor="password">Nuova password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Conferma password</Label>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Aggiornamento..." : "Reimposta password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
