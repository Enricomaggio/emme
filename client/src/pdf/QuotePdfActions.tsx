import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Eye,
  Download,
  Mail,
  Loader2,
  X,
} from "lucide-react";
import { pdf, PDFViewer } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Company, Opportunity } from "@shared/schema";
import { QuotePdfDocument } from "./QuotePdfDocument";
import {
  type PdfQuote,
  type PdfCustomer,
  applyTemplate,
  fmt,
  customerDisplayName,
} from "./quote-pdf-utils";

interface LeadResponse extends PdfCustomer {
  id: string;
}

interface Props {
  quote: PdfQuote;
  opportunity: Opportunity | null | undefined;
  opportunityLoading?: boolean;
  resolveItemName: (itemId: string) => string | undefined;
  disabled?: boolean;
}

export function QuotePdfActions({ quote, opportunity, opportunityLoading = false, resolveItemName, disabled }: Props) {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const companyQuery = useQuery<Company>({
    queryKey: ["/api/company"],
  });

  const leadId = opportunity?.leadId;
  const leadQuery = useQuery<LeadResponse>({
    queryKey: ["/api/leads", leadId],
    enabled: !!leadId,
  });

  const enrichedQuote: PdfQuote = useMemo(() => {
    return {
      ...quote,
      items: quote.items.map((it) => ({
        ...it,
        resolvedName: it.description || resolveItemName(it.id) || "",
      })),
    };
  }, [quote, resolveItemName]);

  const resolvedCompany = useMemo(() => {
    if (!companyQuery.data) return null;
    return {
      ...companyQuery.data,
      logoUrl: companyQuery.data.logoUrl || `${window.location.origin}/gdm-logo.png`,
    };
  }, [companyQuery.data]);

  const dependentDataLoading = opportunityLoading || (!!leadId && leadQuery.isLoading) || companyQuery.isLoading;
  const dataReady = !!resolvedCompany && !opportunityLoading && !(!!leadId && leadQuery.isLoading);
  const customerMissing = !!leadId && !leadQuery.isLoading && !leadQuery.data;
  const opportunityMissing = !opportunityLoading && !opportunity;

  function warnIfDataIncomplete(): boolean {
    if (dependentDataLoading) return true;
    if (opportunityMissing || customerMissing) {
      const parts: string[] = [];
      if (opportunityMissing) parts.push("opportunità");
      if (customerMissing) parts.push("dati cliente");
      toast({
        title: "Dati incompleti",
        description: `Il PDF verrà generato senza ${parts.join(" e ")}. Verifica il preventivo prima di inviarlo.`,
      });
    }
    return true;
  }

  async function generateBlob(): Promise<Blob> {
    if (!resolvedCompany) {
      throw new Error("Dati azienda non disponibili");
    }
    return await pdf(
      <QuotePdfDocument
        company={resolvedCompany}
        customer={leadQuery.data ?? null}
        quote={enrichedQuote}
        opportunityTitle={opportunity?.title}
      />,
    ).toBlob();
  }

  async function handleDownload(): Promise<Blob | null> {
    try {
      setDownloading(true);
      const blob = await generateBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Preventivo-${quote.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return blob;
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Impossibile generare il PDF",
        variant: "destructive",
      });
      return null;
    } finally {
      setDownloading(false);
    }
  }

  function openMailto() {
    const company = resolvedCompany;
    const customer = leadQuery.data;
    const customerName = customerDisplayName(customer ?? null);
    const persistedTotal = parseFloat(quote.totalAmount || "0");
    const totalNum = Number.isFinite(persistedTotal) && persistedTotal > 0
      ? persistedTotal
      : enrichedQuote.items.reduce((s, it) => s + (parseFloat(it.totalRow) || 0), 0);
    const vars = {
      numero: quote.number,
      cliente: customerName,
      oggetto: quote.subject || "fornitura",
      totale: `€ ${fmt(totalNum)}`,
    };
    const subject =
      applyTemplate(company?.emailSubjectTemplate, vars) ||
      `Preventivo ${quote.number}`;
    const body =
      applyTemplate(company?.emailBodyTemplate, vars) ||
      `Buongiorno,\n\nin allegato trovate il preventivo ${quote.number}.\n\nCordiali saluti.`;
    const to = customer?.email || "";
    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  async function handleDownloadAndEmail() {
    const blob = await handleDownload();
    if (blob) {
      setEmailOpen(false);
      // small delay to let the download dialog kick in before mailto handler
      setTimeout(() => openMailto(), 300);
    }
  }

  function handleOnlyEmail() {
    setEmailOpen(false);
    openMailto();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={disabled || dependentDataLoading || (!companyQuery.isLoading && !resolvedCompany)} data-testid="button-pdf-actions">
            {dependentDataLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Azioni PDF
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              warnIfDataIncomplete();
              setPreviewOpen(true);
            }}
            data-testid="button-pdf-preview"
          >
            <Eye className="w-4 h-4 mr-2" />
            Anteprima PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              warnIfDataIncomplete();
              handleDownload();
            }}
            disabled={downloading}
            data-testid="button-pdf-download"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Scarica PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              warnIfDataIncomplete();
              setEmailOpen(true);
            }}
            data-testid="button-pdf-email"
          >
            <Mail className="w-4 h-4 mr-2" />
            Invia per email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-6xl w-[95vw] h-[92vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
            <DialogTitle data-testid="text-pdf-preview-title">
              Anteprima preventivo {quote.number}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload()}
                disabled={downloading}
                data-testid="button-pdf-preview-download"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Scarica
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreviewOpen(false);
                  setEmailOpen(true);
                }}
                data-testid="button-pdf-preview-email"
              >
                <Mail className="w-4 h-4 mr-2" />
                Invia email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(false)}
                data-testid="button-pdf-preview-close"
              >
                <X className="w-4 h-4 mr-2" />
                Chiudi
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 px-4 pb-4">
            {dataReady && resolvedCompany ? (
              <PDFViewer style={{ width: "100%", height: "100%", border: "none" }}>
                <QuotePdfDocument
                  company={resolvedCompany}
                  customer={leadQuery.data ?? null}
                  quote={enrichedQuote}
                  opportunityTitle={opportunity?.title}
                />
              </PDFViewer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Email confirm dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia preventivo per email</DialogTitle>
            <DialogDescription>
              Il tuo client email si aprirà con il messaggio precompilato. Allega il PDF appena
              scaricato (o usa "Scarica e apri email" qui sotto).
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {leadQuery.data?.email ? (
              <>Destinatario: <span className="font-medium text-foreground">{leadQuery.data.email}</span></>
            ) : (
              <>Nessun indirizzo email cliente — verrà aperto il client email senza destinatario.</>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={handleOnlyEmail}
              data-testid="button-email-only-open"
            >
              Solo apri email
            </Button>
            <Button
              onClick={handleDownloadAndEmail}
              disabled={downloading}
              data-testid="button-email-download-and-open"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Scarica PDF e apri email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
