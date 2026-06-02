import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { AlertTriangle, Calendar, Receipt, Wallet, CircleDollarSign, ClockAlert } from "lucide-react";
import { cn } from "@/lib/utils";

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

function KpiCard({ title, value, icon: Icon, tone = "default" }: {
  title: string;
  value: string;
  icon: any;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-muted-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <Icon className={cn("w-6 h-6", toneClass)} />
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  return (
    <DashboardLayout user={user || undefined}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `Anno ${data.year}` : "..."}
          </p>
        </div>

        {/* Forfettario alert */}
        {data && (
          <Card className={cn(data.forfettario.alert && "border-red-500")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Regime forfettario</span>
                {data.forfettario.alert && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Vicino al limite
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-bold">{formatCurrency(data.forfettario.used)}</span>
                <span className="text-sm text-muted-foreground">
                  su {formatCurrency(data.forfettario.threshold)} ({data.forfettario.percent}%)
                </span>
              </div>
              <Progress
                value={data.forfettario.percent}
                className={cn("h-3", data.forfettario.alert && "[&>div]:bg-red-500")}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Restano {formatCurrency(data.forfettario.remaining)} prima del limite.
              </p>
            </CardContent>
          </Card>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Fatturato anno"
            value={isLoading ? "..." : formatCurrency(data?.invoicedYTD || 0)}
            icon={Receipt}
            tone="default"
          />
          <KpiCard
            title="Incassato anno"
            value={isLoading ? "..." : formatCurrency(data?.paidYTD || 0)}
            icon={Wallet}
            tone="success"
          />
          <KpiCard
            title="Da fatturare"
            value={isLoading ? "..." : formatCurrency(data?.toInvoice || 0)}
            icon={CircleDollarSign}
            tone="warning"
          />
          <KpiCard
            title="Da incassare"
            value={isLoading ? "..." : formatCurrency(data?.toCollect || 0)}
            icon={ClockAlert}
            tone="warning"
          />
        </div>

        {/* Valore pipeline per stadio */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valore pipeline per stadio</CardTitle>
          </CardHeader>
          <CardContent>
            {!data ? null : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.pipelineByStage.map((stage) => (
                  <Link key={stage.id} href="/pipeline">
                    <div className="border rounded-lg p-3 hover:bg-accent cursor-pointer transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                        <span className="text-sm font-medium">{stage.name}</span>
                      </div>
                      <p className="text-xl font-bold">{formatCurrency(stage.totalValue)}</p>
                      <p className="text-xs text-muted-foreground">{stage.opportunityCount} opportunità</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scadenze imminenti */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Scadenze prossimi 60 giorni
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data || data.upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna scadenza nei prossimi 60 giorni.</p>
            ) : (
              <div className="divide-y">
                {data.upcomingDeadlines.map((d) => {
                  const isInvoice = d.invoiceDate && d.status === "pending";
                  const isPayment = d.paymentDate && (d.status === "pending" || d.status === "invoiced");
                  const showDate = isPayment ? d.paymentDate : d.invoiceDate;
                  const label = isPayment ? "Incasso" : "Fattura";
                  return (
                    <Link key={d.id} href={`/pipeline?open=${d.opportunityId}`}>
                      <div className="py-3 flex items-center justify-between hover:bg-accent/50 px-2 cursor-pointer">
                        <div>
                          <p className="font-medium text-sm">{d.opportunityTitle}</p>
                          <p className="text-xs text-muted-foreground">{d.leadName}</p>
                          {d.description && (
                            <p className="text-xs text-muted-foreground italic">{d.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatCurrency(d.amount)}</p>
                          <p className="text-xs text-muted-foreground">
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

        {/* Counts */}
        {data && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold">{data.counts.leadsTotal}</p>
                <p className="text-sm text-muted-foreground">Clienti totali</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold">{data.counts.opportunitiesOpen}</p>
                <p className="text-sm text-muted-foreground">Opportunità aperte</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold">{data.counts.opportunitiesWon}</p>
                <p className="text-sm text-muted-foreground">Completate</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
