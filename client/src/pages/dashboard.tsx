import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { AlertTriangle, Calendar, Receipt, Wallet, CircleDollarSign, ClockAlert, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeForfettario, FORFETTARIO_THRESHOLD } from "@shared/forfettario";

interface DashboardData {
  year: number;
  invoicedYTD: number;
  paidYTD: number;
  toInvoice: number;
  toCollect: number;
  forfettario: {
    threshold: number;
    used: number;
    remaining: number;
    percent: number;
    alert: boolean;
  };
  pipelineByStage: Array<{
    id: string;
    name: string;
    order: number;
    color: string;
    opportunityCount: number;
    totalValue: number;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    opportunityId: string;
    opportunityTitle: string;
    leadId: string;
    leadName: string;
    amount: number;
    description: string | null;
    invoiceDate: string | null;
    paymentDate: string | null;
    status: "pending" | "invoiced" | "paid";
  }>;
  counts: {
    leadsTotal: number;
    opportunitiesOpen: number;
    opportunitiesWon: number;
  };
}

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target || target <= 0) {
      setValue(0);
      return;
    }
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

const TONE_STYLES = {
  default: {
    border: "from-blue-500/60 via-blue-500/30 to-transparent",
    icon: "text-blue-400",
    iconBg: "bg-blue-500/10",
  },
  success: {
    border: "from-emerald-500/60 via-emerald-500/30 to-transparent",
    icon: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  warning: {
    border: "from-amber-500/60 via-amber-500/30 to-transparent",
    icon: "text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  danger: {
    border: "from-red-500/60 via-red-500/30 to-transparent",
    icon: "text-red-400",
    iconBg: "bg-red-500/10",
  },
} as const;

type Tone = keyof typeof TONE_STYLES;

function KpiCard({
  title,
  rawValue,
  icon: Icon,
  tone = "default",
  isLoading,
}: {
  title: string;
  rawValue: number;
  icon: any;
  tone?: Tone;
  isLoading?: boolean;
}) {
  const animated = useCountUp(rawValue);
  const styles = TONE_STYLES[tone];

  return (
    <div className="relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl overflow-hidden transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04]">
      {/* Top accent gradient */}
      <div className={cn("absolute top-0 left-0 right-0 h-px bg-gradient-to-r", styles.border)} />
      <div className="p-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">{title}</p>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-white mt-2">
            {isLoading ? (
              <span className="text-slate-500">...</span>
            ) : (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                {formatCurrency(animated)}
              </motion.span>
            )}
          </p>
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", styles.iconBg)}>
          <Icon className={cn("w-5 h-5", styles.icon)} />
        </div>
      </div>
    </div>
  );
}

function CountCard({ value, label }: { value: number; label: string }) {
  const animated = useCountUp(value);
  return (
    <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-5 text-center transition-all duration-200 hover:border-white/[0.12]">
      <p className="text-4xl font-bold tabular-nums tracking-tight text-white">
        {Math.round(animated)}
      </p>
      <p className="text-xs uppercase tracking-wider text-slate-400 mt-2">{label}</p>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const forfettarioThreshold = data?.forfettario.threshold || FORFETTARIO_THRESHOLD;
  const invoiced = data?.invoicedYTD || 0;
  const toInvoice = data?.toInvoice || 0;
  const confirmedTotal = invoiced + toInvoice;
  // Percentuali esatte (float) per le larghezze delle barre — solo presentazione.
  const invoicedPercent = Math.min(100, (invoiced / forfettarioThreshold) * 100);
  const confirmedPercent = Math.min(100, (confirmedTotal / forfettarioThreshold) * 100);
  // Regola di business (soglia "remaining" e alert) dalla funzione condivisa: unica fonte di verità.
  const confirmedForfettario = computeForfettario(confirmedTotal, forfettarioThreshold);
  const remainingAfterConfirmed = confirmedForfettario.remaining;
  const forfettarioAlert = confirmedForfettario.alert;
  const animatedPercent = useCountUp(confirmedPercent, 1500);

  return (
    <DashboardLayout user={user || undefined}>
      <motion.div initial="hidden" animate="show" variants={container} className="space-y-6">
        <motion.div variants={item}>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            {data ? `Anno ${data.year}` : "..."}
          </p>
        </motion.div>

        {/* Forfettario alert */}
        {data && (
          <motion.div variants={item}>
            <div
              className={cn(
                "relative bg-white/[0.03] backdrop-blur-sm border rounded-xl p-5 overflow-hidden transition-all duration-200",
                forfettarioAlert
                  ? "border-red-500/40 shadow-[0_0_24px_rgba(239,68,68,0.12)]"
                  : "border-white/[0.06]",
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                    Regime forfettario
                  </span>
                </div>
                {forfettarioAlert && (
                  <Badge className="gap-1 bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/20">
                    <AlertTriangle className="w-3.5 h-3.5" /> Vicino al limite
                  </Badge>
                )}
              </div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-3xl font-bold tabular-nums tracking-tight text-white">
                  {formatCurrency(confirmedTotal)}
                </span>
                <span className="text-sm text-slate-400 tabular-nums">
                  su {formatCurrency(forfettarioThreshold)} ({Math.round(animatedPercent)}%)
                </span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
                {/* Segmento "confermato" (fatturato + da fatturare) — opacità ridotta */}
                <motion.div
                  className={cn(
                    "absolute top-0 left-0 h-full rounded-full bg-gradient-to-r",
                    forfettarioAlert
                      ? "from-amber-500/40 to-red-500/40"
                      : "from-blue-500/40 to-emerald-500/40",
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${confirmedPercent}%` }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
                />
                {/* Segmento "fatturato" — pieno, sopra */}
                <motion.div
                  className={cn(
                    "absolute top-0 left-0 h-full rounded-full bg-gradient-to-r",
                    forfettarioAlert
                      ? "from-amber-500 to-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      : "from-blue-500 to-emerald-500",
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${invoicedPercent}%` }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-400 tabular-nums">
                <span className="flex items-center gap-1.5">
                  <span className={cn("inline-block w-2 h-2 rounded-full", forfettarioAlert ? "bg-red-500" : "bg-emerald-500")} />
                  Fatturato <span className="text-slate-200 font-medium">{formatCurrency(invoiced)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={cn("inline-block w-2 h-2 rounded-full opacity-40", forfettarioAlert ? "bg-red-500" : "bg-emerald-500")} />
                  Confermato <span className="text-slate-200 font-medium">+{formatCurrency(toInvoice)}</span>
                </span>
                <span className="ml-auto">
                  Restano <span className="text-slate-300 font-medium">{formatCurrency(remainingAfterConfirmed)}</span> prima del limite
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* KPI cards */}
        <motion.div
          variants={container}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        >
          <motion.div variants={item}>
            <KpiCard
              title="Totale confermato"
              rawValue={confirmedTotal}
              icon={TrendingUp}
              tone="success"
              isLoading={isLoading}
            />
          </motion.div>
          <motion.div variants={item}>
            <KpiCard
              title="Fatturato anno"
              rawValue={data?.invoicedYTD || 0}
              icon={Receipt}
              tone="default"
              isLoading={isLoading}
            />
          </motion.div>
          <motion.div variants={item}>
            <KpiCard
              title="Incassato anno"
              rawValue={data?.paidYTD || 0}
              icon={Wallet}
              tone="success"
              isLoading={isLoading}
            />
          </motion.div>
          <motion.div variants={item}>
            <KpiCard
              title="Da fatturare"
              rawValue={data?.toInvoice || 0}
              icon={CircleDollarSign}
              tone="warning"
              isLoading={isLoading}
            />
          </motion.div>
          <motion.div variants={item}>
            <KpiCard
              title="Da incassare"
              rawValue={data?.toCollect || 0}
              icon={ClockAlert}
              tone="danger"
              isLoading={isLoading}
            />
          </motion.div>
        </motion.div>

        {/* Valore pipeline per stadio */}
        <motion.div variants={item}>
          <Card className="bg-white/[0.03] backdrop-blur-sm border-white/[0.06]">
            <CardHeader>
              <CardTitle className="text-base text-white">Valore pipeline per stadio</CardTitle>
            </CardHeader>
            <CardContent>
              {!data ? null : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {data.pipelineByStage.map((stage, i) => (
                    <Link key={stage.id} href="/pipeline">
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 + i * 0.05, ease: "easeOut" }}
                        className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 hover:bg-white/[0.05] hover:border-blue-500/30 hover:shadow-[0_0_12px_rgba(59,130,246,0.08)] cursor-pointer transition-all duration-200"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                            style={{ background: stage.color, color: stage.color }}
                          />
                          <span className="text-sm font-medium text-slate-200">{stage.name}</span>
                        </div>
                        <p className="text-xl font-bold tabular-nums text-white">{formatCurrency(stage.totalValue)}</p>
                        <p className="text-xs text-slate-400 mt-1">{stage.opportunityCount} opportunità</p>
                      </motion.div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Scadenze imminenti */}
        <motion.div variants={item}>
          <Card className="bg-white/[0.03] backdrop-blur-sm border-white/[0.06]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-white">
                <Calendar className="w-4 h-4 text-blue-400" /> Scadenze prossimi 60 giorni
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data || data.upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-slate-400">Nessuna scadenza nei prossimi 60 giorni.</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {data.upcomingDeadlines.map((d) => {
                    const isPayment = d.paymentDate && (d.status === "pending" || d.status === "invoiced");
                    const showDate = isPayment ? d.paymentDate : d.invoiceDate;
                    const label = isPayment ? "Incasso" : "Fattura";
                    return (
                      <Link key={d.id} href={`/pipeline?open=${d.opportunityId}`}>
                        <div className="py-3 flex items-center justify-between hover:bg-white/[0.04] px-2 cursor-pointer transition-colors duration-150 rounded">
                          <div>
                            <p className="font-medium text-sm text-slate-100">{d.opportunityTitle}</p>
                            <p className="text-xs text-slate-400">{d.leadName}</p>
                            {d.description && (
                              <p className="text-xs text-slate-500 italic">{d.description}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-sm tabular-nums text-white">{formatCurrency(d.amount)}</p>
                            <p className="text-xs text-slate-400">
                              {label} · {formatDate(showDate)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Counts */}
        {data && (
          <motion.div variants={container} className="grid grid-cols-3 gap-4">
            <motion.div variants={item}>
              <CountCard value={data.counts.leadsTotal} label="Clienti totali" />
            </motion.div>
            <motion.div variants={item}>
              <CountCard value={data.counts.opportunitiesOpen} label="Opportunità aperte" />
            </motion.div>
            <motion.div variants={item}>
              <CountCard value={data.counts.opportunitiesWon} label="Completate" />
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
