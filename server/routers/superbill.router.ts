/**
 * Superbill Integration Router
 *
 * In assenza di SUPERBILL_API_KEY il router opera in MOCK MODE:
 * tutti gli endpoint restituiscono dati realistici preconfigurati.
 * Quando le credenziali saranno disponibili, basterà impostare le
 * variabili d'ambiente per attivare le chiamate reali.
 *
 * ENV vars richieste (produzione):
 *   SUPERBILL_API_KEY     — Authorization-Key dal portale developer.datev.it
 *   SUPERBILL_ARCHIVE_ID  — ID archivio GDM su Superbill ({idElemento})
 *   SUPERBILL_BASE_URL    — https://superbillapp.datev.it/efat (default)
 */

import { Router } from "express";
import { isAuthenticated } from "../auth";
import { resolveUserCompany } from "../utils/accessContext";
import { storage } from "../storage";

export const superbillRouter = Router();

const IS_MOCK = !process.env.SUPERBILL_API_KEY;
const SUPERBILL_BASE_URL = process.env.SUPERBILL_BASE_URL || "https://superbillapp.datev.it/efat";
const SUPERBILL_ARCHIVE_ID = process.env.SUPERBILL_ARCHIVE_ID || "";
const SUPERBILL_API_KEY = process.env.SUPERBILL_API_KEY || "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const today = new Date();

/** Scadenze finanziarie mock (attive + passive) relative a oggi */
function buildMockScadenze() {
  return [
    // FATTURE ATTIVE — da incassare
    {
      id: "SB-2026-031",
      tipo: "ATTIVA" as const,
      numeroFattura: "FT-031/2026",
      cliente: "Edilcondomini Marchi S.r.l.",
      importo: 4850.00,
      dataScadenza: fmtDate(addDays(today, 3)),
      metodoPagamento: "RIBA" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Copertura + lattoneria via Rossini 14",
    },
    {
      id: "SB-2026-032",
      tipo: "ATTIVA" as const,
      numeroFattura: "FT-032/2026",
      cliente: "Condominio Il Prato",
      importo: 7200.00,
      dataScadenza: fmtDate(addDays(today, 8)),
      metodoPagamento: "BONIFICO" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Rifacimento gronde e pluviali",
    },
    {
      id: "SB-2026-033",
      tipo: "ATTIVA" as const,
      numeroFattura: "FT-033/2026",
      cliente: "Fam. Bertoldo Roberto",
      importo: 1920.00,
      dataScadenza: fmtDate(addDays(today, 15)),
      metodoPagamento: "BONIFICO" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Sostituzione canali di scolo",
    },
    {
      id: "SB-2026-028",
      tipo: "ATTIVA" as const,
      numeroFattura: "FT-028/2026",
      cliente: "Studio Tecnico Zanon",
      importo: 3100.00,
      dataScadenza: fmtDate(addDays(today, 22)),
      metodoPagamento: "RIBA" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Lattoneria capannone industriale",
    },
    {
      id: "SB-2026-025",
      tipo: "ATTIVA" as const,
      numeroFattura: "FT-025/2026",
      cliente: "Impresa Costruzioni Vianello",
      importo: 11400.00,
      dataScadenza: fmtDate(addDays(today, 45)),
      metodoPagamento: "BONIFICO" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Appalto residenziale via Manzoni – SAL 2",
    },
    // SCADUTE — non pagate
    {
      id: "SB-2026-019",
      tipo: "ATTIVA" as const,
      numeroFattura: "FT-019/2026",
      cliente: "Rossi Costruzioni s.n.c.",
      importo: 2640.00,
      dataScadenza: fmtDate(addDays(today, -12)),
      metodoPagamento: "RIBA" as const,
      stato: "SCADUTA" as const,
      descrizione: "Copertura villa unifamiliare",
    },
    {
      id: "SB-2026-021",
      tipo: "ATTIVA" as const,
      numeroFattura: "FT-021/2026",
      cliente: "Condominio Tre Colli",
      importo: 5850.00,
      dataScadenza: fmtDate(addDays(today, -5)),
      metodoPagamento: "BONIFICO" as const,
      stato: "SCADUTA" as const,
      descrizione: "Impermeabilizzazione terrazza",
    },
    // FATTURE PASSIVE — da pagare
    {
      id: "FP-2026-014",
      tipo: "PASSIVA" as const,
      numeroFattura: "AC-014/2026",
      cliente: "Coil Service Italia S.r.l.",
      importo: 3200.00,
      dataScadenza: fmtDate(addDays(today, 5)),
      metodoPagamento: "BONIFICO" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Acquisto coils zinco-titanio",
    },
    {
      id: "FP-2026-015",
      tipo: "PASSIVA" as const,
      numeroFattura: "AC-015/2026",
      cliente: "Ferramenta Bortolaso & C.",
      importo: 890.00,
      dataScadenza: fmtDate(addDays(today, 18)),
      metodoPagamento: "RIBA" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Minuteria e fissaggi vari",
    },
    {
      id: "FP-2026-016",
      tipo: "PASSIVA" as const,
      numeroFattura: "AC-016/2026",
      cliente: "Tecnolattoneria Nord-Est S.r.l.",
      importo: 4500.00,
      dataScadenza: fmtDate(addDays(today, 30)),
      metodoPagamento: "RIBA" as const,
      stato: "IN_SCADENZA" as const,
      descrizione: "Acconto lamiere pregiate",
    },
  ];
}

/** Fatture mock per un singolo cliente (tab Fatturazione in lead-detail) */
function buildMockFatturePerCliente(leadId: string) {
  // Fatture diverse in base all'ID per simulare dati realistici
  const seed = leadId.charCodeAt(0) % 3;
  const base = [
    {
      id: `SB-LEAD-${leadId}-001`,
      numeroFattura: "FT-028/2026",
      dataDocumento: fmtDate(addDays(today, -45)),
      importo: 3100.00,
      stato: "INVIATA_SDI" as const,
      metodoPagamento: "RIBA" as const,
      dataScadenza: fmtDate(addDays(today, 22)),
      statoPagamento: "IN_SCADENZA" as const,
      descrizione: "Lattoneria capannone industriale",
    },
    {
      id: `SB-LEAD-${leadId}-002`,
      numeroFattura: "FT-019/2026",
      dataDocumento: fmtDate(addDays(today, -75)),
      importo: 2640.00,
      stato: "INVIATA_SDI" as const,
      metodoPagamento: "RIBA" as const,
      dataScadenza: fmtDate(addDays(today, -12)),
      statoPagamento: "SCADUTA" as const,
      descrizione: "Copertura villa unifamiliare – 1° acconto",
    },
    {
      id: `SB-LEAD-${leadId}-003`,
      numeroFattura: "FT-012/2026",
      dataDocumento: fmtDate(addDays(today, -120)),
      importo: 5200.00,
      stato: "PAGATA" as const,
      metodoPagamento: "BONIFICO" as const,
      dataScadenza: fmtDate(addDays(today, -90)),
      statoPagamento: "PAGATA" as const,
      descrizione: "Rifacimento completo copertura",
    },
  ];
  // Restituisce 1, 2 o 3 fatture a seconda del seed
  return base.slice(0, seed + 1);
}

/** Proiezione flusso di cassa mensile mock per i prossimi 6 mesi */
function buildMockProiezione() {
  const now = new Date();
  const scadenze = buildMockScadenze();

  // Mesi base dai dati mock
  const map: Record<string, { entrate: number; uscite: number }> = {};

  for (const s of scadenze) {
    if (s.stato === "SCADUTA") continue; // escludiamo le già scadute dalla proiezione
    const d = new Date(s.dataScadenza);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map[key]) map[key] = { entrate: 0, uscite: 0 };
    if (s.tipo === "ATTIVA") map[key].entrate += s.importo;
    else map[key].uscite += s.importo;
  }

  // Genera i 6 mesi futuri (compreso il corrente) con dati simulati per quelli non coperti
  const simulatedEntrate = [8200, 12400, 6800, 9500, 11200, 7600];
  const simulatedUscite   = [4100,  5800, 3200, 4800,  6300, 3900];

  const months: { mese: string; entrate: number; uscite: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("it-IT", { month: "short", year: "numeric" });
    const existing = map[key];
    months.push({
      mese: label.charAt(0).toUpperCase() + label.slice(1),
      entrate: existing ? existing.entrate + simulatedEntrate[i] * 0.3 : simulatedEntrate[i],
      uscite:  existing ? existing.uscite  + simulatedUscite[i]  * 0.3 : simulatedUscite[i],
    });
  }

  return months;
}

// ─── Superbill Real API Helper ────────────────────────────────────────────────

async function superbillFetch(path: string, options: RequestInit = {}) {
  const url = `${SUPERBILL_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization-Key": SUPERBILL_API_KEY,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Superbill API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/superbill/status
 * Restituisce lo stato della configurazione (mock o reale).
 */
superbillRouter.get("/superbill/status", isAuthenticated, (_req, res) => {
  res.json({
    isMock: IS_MOCK,
    configured: !IS_MOCK,
    message: IS_MOCK
      ? "Modalità demo — inserire SUPERBILL_API_KEY e SUPERBILL_ARCHIVE_ID per attivare la connessione reale"
      : "Connesso a Superbill",
  });
});

/**
 * POST /api/superbill/fattura/:quoteId
 * Crea una fattura bozza su Superbill a partire da un preventivo accettato.
 * In mock mode: genera un ID documento fittizio e aggiorna il preventivo.
 */
superbillRouter.post("/superbill/fattura/:quoteId", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const quote = await storage.getQuote(req.params.quoteId, userCompany.companyId);
    if (!quote) return res.status(404).json({ message: "Preventivo non trovato" });

    if (quote.status !== "ACCEPTED") {
      return res.status(400).json({ message: "Solo i preventivi accettati possono essere inviati a Superbill" });
    }

    if (quote.superbillDocumentId) {
      return res.status(409).json({
        message: "Questo preventivo è già stato inviato a Superbill",
        superbillDocumentId: quote.superbillDocumentId,
        superbillSentAt: quote.superbillSentAt,
      });
    }

    let superbillDocumentId: string;

    if (IS_MOCK) {
      // ── MOCK MODE ──────────────────────────────────────────────────────────
      // Simula un breve ritardo di rete
      await new Promise((r) => setTimeout(r, 600));
      // Genera un ID documento fittizio ma credibile
      const year = new Date().getFullYear();
      const seq = String(Math.floor(Math.random() * 900) + 100);
      superbillDocumentId = `FT-${seq}/${year}`;
    } else {
      // ── REAL MODE ──────────────────────────────────────────────────────────
      // 1. Recupera opportunity + lead per ottenere i dati cliente
      const opp = await storage.getOpportunity(quote.opportunityId, userCompany.companyId);
      if (!opp) return res.status(404).json({ message: "Opportunità non trovata" });

      const lead = opp.leadId ? await storage.getLead(opp.leadId, userCompany.companyId) : null;
      const items = await storage.getQuoteItems(quote.id);

      // 2. Trova o crea il cliente su Superbill
      let idCliente: string;
      if (lead?.superbillClientId) {
        idCliente = lead.superbillClientId;
      } else {
        // Crea il cliente
        const clienteData = {
          ragioneSociale: lead?.name || lead?.firstName + " " + lead?.lastName || "Cliente",
          partitaIva: lead?.vatNumber || "",
          codiceFiscale: lead?.fiscalCode || "",
          indirizzo: lead?.address || "",
          comune: lead?.city || "",
          cap: lead?.zipCode || "",
          provincia: lead?.province || "",
          email: lead?.email || "",
          telefono: lead?.phone || "",
          codiceSdi: lead?.sdiCode || "",
          pec: lead?.pecEmail || "",
        };
        const createdCliente = await superbillFetch(`/api/v1/clienti/${SUPERBILL_ARCHIVE_ID}`, {
          method: "POST",
          body: JSON.stringify(clienteData),
        });
        idCliente = createdCliente.id;
        // Salva l'ID cliente su Superbill nel lead
        if (lead) {
          await storage.updateLead(lead.id, userCompany.companyId, { superbillClientId: idCliente });
        }
      }

      // 3. Recupera il primo registro di numerazione disponibile
      const registri = await superbillFetch(`/api/v1/registri/${SUPERBILL_ARCHIVE_ID}`);
      const idProgressivo = registri?.items?.[0]?.id;

      // 4. Recupera il codice IVA 22%
      const codiciIva = await superbillFetch(`/api/v1/codici-iva/${SUPERBILL_ARCHIVE_ID}`);
      const codiceIva22 = codiciIva?.items?.find((c: any) => c.aliquota === 22) || codiciIva?.items?.[0];
      const idCodiceIva = codiceIva22?.id;

      // 5. Costruisci il payload fattura
      const fatturaPayload = {
        tipoDocumento: 3, // Fattura
        idCliente,
        idProgressivo,
        idTipoPagamento: 1, // default: bonifico (da mappare)
        idModalitaPagamento: 1,
        flElettronica: true,
        note: quote.notes || "",
        datiRigheDettaglio: items.map((item) => ({
          descrizione: item.description || "",
          quantita: parseFloat(item.quantity || "1"),
          importoUnitario: parseFloat(item.unitPriceApplied || "0"),
          sconto: parseFloat(item.discountPercent || "0"),
          tipoArticolo: 1, // Servizio
          idCodiceIVA: idCodiceIva,
        })),
      };

      const created = await superbillFetch(`/api/v1/documenti/${SUPERBILL_ARCHIVE_ID}`, {
        method: "POST",
        body: JSON.stringify(fatturaPayload),
      });
      superbillDocumentId = String(created.id || created.numeroDocumento);
    }

    // Aggiorna il preventivo con i dati Superbill
    await storage.updateQuote(quote.id, userCompany.companyId, {
      superbillDocumentId,
      superbillSentAt: new Date(),
    });

    res.json({
      success: true,
      superbillDocumentId,
      isMock: IS_MOCK,
      message: IS_MOCK
        ? `[DEMO] Fattura ${superbillDocumentId} creata in bozza su Superbill`
        : `Fattura ${superbillDocumentId} creata in bozza su Superbill`,
    });
  } catch (error) {
    console.error("Superbill fattura error:", error);
    const msg = error instanceof Error ? error.message : "Errore durante l'invio a Superbill";
    res.status(500).json({ message: msg });
  }
});

/**
 * GET /api/superbill/scadenze
 * Restituisce le scadenze finanziarie per la dashboard.
 * Params: ?giorni=30 (default 90)
 */
superbillRouter.get("/superbill/scadenze", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const giorni = parseInt(req.query.giorni as string) || 90;

    if (IS_MOCK) {
      const all = buildMockScadenze();
      const cutoff = addDays(today, giorni);
      const filtered = all.filter((s) => {
        const scad = new Date(s.dataScadenza);
        // Includi sempre le scadute; per le future filtra per finestra
        return s.stato === "SCADUTA" || scad <= cutoff;
      });
      return res.json({ isMock: true, scadenze: filtered });
    }

    // REAL MODE
    const year = new Date().getFullYear();
    // Recupera fatture emesse
    const docs = await superbillFetch(
      `/api/v1/documenti/${SUPERBILL_ARCHIVE_ID}?tipoDocumento=3&anno=${year}`
    );

    const scadenze = (docs?.items || []).flatMap((doc: any) => {
      const scad = doc.datiScadenze || [];
      return scad.map((s: any) => ({
        id: `${doc.id}-${s.dataScadenza}`,
        tipo: "ATTIVA" as const,
        numeroFattura: doc.numeroDocumento,
        cliente: doc.denominazioneCliente,
        importo: s.importo,
        dataScadenza: s.dataScadenza,
        metodoPagamento: doc.modalitaPagamento === "RIBA" ? "RIBA" : "BONIFICO",
        stato: new Date(s.dataScadenza) < today ? "SCADUTA" : "IN_SCADENZA",
        descrizione: doc.note || "",
      }));
    });

    res.json({ isMock: false, scadenze });
  } catch (error) {
    console.error("Superbill scadenze error:", error);
    res.status(500).json({ message: "Errore nel recupero delle scadenze" });
  }
});

/**
 * GET /api/superbill/proiezione
 * Restituisce la proiezione mensile del flusso di cassa per i prossimi 6 mesi.
 */
superbillRouter.get("/superbill/proiezione", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    if (IS_MOCK) {
      return res.json({ isMock: true, mesi: buildMockProiezione() });
    }

    // REAL MODE — aggrega le scadenze reali per mese (ATTIVA = entrate, PASSIVA = uscite)
    const now = new Date();
    const years = [now.getFullYear(), now.getFullYear() + 1];

    // tipoDocumento=3 → fatture emesse (ATTIVA / entrate)
    // tipoDocumento=1 → fatture ricevute/acquisto (PASSIVA / uscite)
    const fetches = years.flatMap((anno) => [
      superbillFetch(`/api/v1/documenti/${SUPERBILL_ARCHIVE_ID}?tipoDocumento=3&anno=${anno}`)
        .then((r) => ({ tipo: "ATTIVA" as const, items: r?.items || [] }))
        .catch(() => ({ tipo: "ATTIVA" as const, items: [] })),
      superbillFetch(`/api/v1/documenti/${SUPERBILL_ARCHIVE_ID}?tipoDocumento=1&anno=${anno}`)
        .then((r) => ({ tipo: "PASSIVA" as const, items: r?.items || [] }))
        .catch(() => ({ tipo: "PASSIVA" as const, items: [] })),
    ]);

    const results = await Promise.all(fetches);
    const map: Record<string, { entrate: number; uscite: number }> = {};

    for (const { tipo, items } of results) {
      for (const doc of items) {
        const scad = doc.datiScadenze || [];
        for (const s of scad) {
          const d = new Date(s.dataScadenza);
          if (d < now) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!map[key]) map[key] = { entrate: 0, uscite: 0 };
          if (tipo === "ATTIVA") map[key].entrate += s.importo || 0;
          else map[key].uscite += s.importo || 0;
        }
      }
    }

    const mesi = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("it-IT", { month: "short", year: "numeric" });
      const entry = map[key] || { entrate: 0, uscite: 0 };
      mesi.push({
        mese: label.charAt(0).toUpperCase() + label.slice(1),
        entrate: entry.entrate,
        uscite: entry.uscite,
      });
    }

    res.json({ isMock: false, mesi });
  } catch (error) {
    console.error("Superbill proiezione error:", error);
    res.status(500).json({ message: "Errore nel calcolo della proiezione" });
  }
});

/**
 * GET /api/superbill/fatture-lead/:leadId
 * Restituisce le fatture emesse per un dato cliente (usato nel tab Fatturazione del lead).
 */
superbillRouter.get("/superbill/fatture-lead/:leadId", isAuthenticated, async (req, res) => {
  try {
    const { id: userId, role } = req.user!;
    const userCompany = await resolveUserCompany(userId, role, req);
    if (!userCompany) return res.status(403).json({ message: "Utente non associato a nessuna azienda" });

    const lead = await storage.getLead(req.params.leadId, userCompany.companyId);
    if (!lead) return res.status(404).json({ message: "Contatto non trovato" });

    if (IS_MOCK) {
      return res.json({ isMock: true, fatture: buildMockFatturePerCliente(lead.id) });
    }

    // REAL MODE
    if (!lead.superbillClientId) {
      return res.json({ isMock: false, fatture: [] });
    }

    const year = new Date().getFullYear();
    const docs = await superbillFetch(
      `/api/v1/documenti/${SUPERBILL_ARCHIVE_ID}?tipoDocumento=3&anno=${year}&idCliente=${lead.superbillClientId}`
    );

    const fatture = (docs?.items || []).map((doc: any) => ({
      id: String(doc.id),
      numeroFattura: doc.numeroDocumento,
      dataDocumento: doc.dataDocumento,
      importo: doc.totaleDocumento,
      stato: "INVIATA_SDI" as const,
      metodoPagamento: doc.modalitaPagamento === "RIBA" ? "RIBA" : "BONIFICO",
      dataScadenza: doc.datiScadenze?.[0]?.dataScadenza || null,
      statoPagamento: "IN_SCADENZA" as const,
      descrizione: doc.note || "",
    }));

    res.json({ isMock: false, fatture });
  } catch (error) {
    console.error("Superbill fatture-lead error:", error);
    res.status(500).json({ message: "Errore nel recupero delle fatture" });
  }
});
