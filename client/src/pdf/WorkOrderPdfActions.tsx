import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
import { Download, Send, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import type { Company } from "@shared/schema";
import { WorkOrderPdfDocument, type WorkOrderPdfData, DEFAULT_WO_DISCLAIMER } from "./WorkOrderPdfDocument";
import { applyTemplate } from "./quote-pdf-utils";

// ── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_WO_EMAIL_SUBJECT = "Nota Lavori n. {numero} — {cantiere}";

export const DEFAULT_WO_EMAIL_BODY =
  `Spett.le {cliente},\n\n` +
  `in allegato trasmettiamo la Nota Lavori n. {numero} relativa alle lavorazioni eseguite ` +
  `presso il cantiere {cantiere}.\n\n` +
  `La preghiamo di prendere visione del documento e di confermare il ricevimento ` +
  `entro 48 ore dalla presente.\n\n` +
  `In assenza di contestazioni entro tale termine, la nota lavori si intenderà ` +
  `accettata in ogni sua parte e si procederà con l'emissione della relativa fattura.\n\n` +
  `Restiamo a disposizione per qualsiasi chiarimento.\n\n` +
  `Cordiali saluti,\n{mittente}`;

// ── Types ──────────────────────────────────────────────────────────────────

interface OpportunityInfo {
  id: string;
  title: string;
  leadId: string;
  leadName?: string | null;
}

interface LeadInfo {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface WorkOrderPdfActionsProps {
  workOrderId: string;
  workOrder: WorkOrderPdfData;
  status: string;
  opportunityId: string;
  /** Called after the NL is marked SENT so the parent can refresh its state */
  onSent?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function WorkOrderPdfActions({
  workOrderId,
  workOrder,
  status,
  opportunityId,
  onSent,
}: WorkOrderPdfActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [downloading, setDownloading] = useState(false);

  // ── Remote data ──────────────────────────────────────────────────────────

  const { data: company } = useQuery<Company>({ queryKey: ["/api/company"] });

  const { data: opportunity } = useQuery<OpportunityInfo>({
    queryKey: ["/api/opportunities", opportunityId],
    enabled: !!opportunityId,
  });

  const { data: lead } = useQuery<LeadInfo>({
    queryKey: ["/api/leads", opportunity?.leadId],
    enabled: !!opportunity?.leadId,
  });

  // Mark NL as SENT
  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/work-orders/${workOrderId}/send`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", { opportunityId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders?companyScope=all"] });
      toast({ title: "Nota Lavori inviata" });
      onSent?.();
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato", variant: "destructive" });
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const resolvedCompany = useMemo(() => {
    if (!company) return null;
    return { ...company, logoUrl: company.logoUrl || `${window.location.origin}/gdm-logo.png` };
  }, [company]);

  function getClientName(): string {
    if (lead) {
      if (lead.firstName || lead.lastName) {
        return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
      }
      return lead.name || "";
    }
    return opportunity?.leadName || "";
  }

  function getSenderName(): string {
    if (user) {
      const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
      return full || user.email || "";
    }
    return company?.name || "";
  }

  function getEmailVars(): Record<string, string> {
    return {
      numero: workOrder.number,
      cantiere: opportunity?.title || "",
      cliente: getClientName(),
      mittente: getSenderName(),
    };
  }

  async function generateBlob(): Promise<Blob | null> {
    if (!resolvedCompany) return null;
    try {
      return await pdf(
        <WorkOrderPdfDocument
          company={resolvedCompany}
          workOrder={workOrder}
          opportunityTitle={opportunity?.title ?? null}
          customerName={getClientName() || null}
          disclaimerText={company?.workOrderDisclaimerText ?? DEFAULT_WO_DISCLAIMER}
        />
      ).toBlob();
    } catch (e) {
      toast({
        title: "Errore PDF",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      return null;
    }
  }

  function triggerDownload(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NL-${workOrder.number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function openMailto() {
    const vars = getEmailVars();
    const subject = applyTemplate(
      company?.workOrderEmailSubjectTemplate || DEFAULT_WO_EMAIL_SUBJECT,
      vars
    );
    const body = applyTemplate(
      company?.workOrderEmailBodyTemplate || DEFAULT_WO_EMAIL_BODY,
      vars
    );
    const to = lead?.email || "";
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await generateBlob();
      if (blob) triggerDownload(blob);
    } finally {
      setDownloading(false);
    }
  }

  async function handleInvia() {
    // 1. Generate + download PDF
    const blob = await generateBlob();
    if (!blob) return;
    triggerDownload(blob);

    // 2. Open mailto after a brief delay (let download dialog appear first)
    setTimeout(() => openMailto(), 300);

    // 3. Mark NL as SENT
    sendMutation.mutate();
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const isLoading = !resolvedCompany;
  const isSent = status === "SENT" || status === "CONFIRMED";
  const isBusy = downloading || sendMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isBusy || isLoading}
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Scarica PDF
      </Button>

      {!isSent ? (
        <Button
          onClick={handleInvia}
          disabled={isBusy || isLoading}
          size="sm"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Invia
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={openMailto}
          disabled={isLoading}
        >
          <Mail className="h-4 w-4 mr-2" />
          Rinvia email
        </Button>
      )}
    </div>
  );
}
