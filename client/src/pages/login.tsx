import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { APP_CONFIG } from "@/lib/config";

export default function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "Errore di accesso",
        description: err.message || "Credenziali non valide",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#020617] bg-dot-grid relative overflow-hidden">
      {/* Blue glow accents */}
      <div className="pointer-events-none absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-blue-600/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-sm"
      >
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center justify-center">
                <img
                  src="/emme-logo.png"
                  alt={APP_CONFIG.appName}
                  className="h-16 w-16 object-contain text-glow-blue"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                />
              </div>
            </div>
            <h1
              className="text-3xl font-bold text-white tracking-tight"
              style={{ filter: "drop-shadow(0 0 12px rgba(59,130,246,0.5))" }}
            >
              {APP_CONFIG.appName}
            </h1>
            <p className="text-sm text-slate-400 mt-2">Accedi al tuo gestionale</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-white/[0.03] border-white/[0.08] text-white"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] hover:shadow-[0_0_16px_rgba(59,130,246,0.3)] transition-all duration-150 text-white"
              disabled={isLoading}
            >
              {isLoading ? "Accesso..." : "Accedi"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
