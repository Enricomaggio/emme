# CLAUDE.md — EMME Gestionale (CRM interno)

Fonte di verità per qualsiasi agente AI che lavora su questo repository.
**Questo è il gestionale personale di Enrico Maggiolo / EMME — non è un prodotto per clienti.**

## Documenti di contesto (`_claude/`)

| File | Contenuto |
|---|---|
| `_claude/00-STATUS.md` | Stato progetto, moduli attivi, schema DB, router, note operative |
| `_claude/ARCHITETTURA.md` | Struttura directory e architettura dettagliata |
| `_claude/design_guidelines.md` | Linee guida design |

---

## Cos'è

CRM interno per gestire il business di EMME. Uso personale di Enrico — single-tenant, nessun multi-tenancy. Costruito adattando GDM Lattonerie come base (rimossi: preventivatore, mappa, cantieri, multi-tenancy). Aggiunto sistema milestone preso dal pattern MZA.

Gestisce: clienti → pipeline commerciale → opportunità → milestone di fatturazione.

---

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + shadcn/ui + Tailwind v3 + TanStack Query v5 + Wouter |
| Backend | Node.js + Express 4 + TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Railway) |
| Auth | express-session + passport-local + bcryptjs |
| Grafici | Recharts |
| DnD | @dnd-kit |

## Comandi

```bash
npm run dev       # Dev server (porta 5001)
npm run build     # Build produzione
npm run db:push   # Applica schema Drizzle
```

## Deploy

- **Hosting:** Railway
- **DB:** PostgreSQL Railway interno (`postgres.railway.internal:5432/railway`)
- **Start produzione:** `npm run db:push && npm start`
- **Porta:** 5001

## Moduli attivi

- **Clienti** (`/clienti`) — lista + dettaglio, tipi AZIENDA/PRIVATO, campo `source`, tab: info/opportunità/referenti/note
- **Pipeline** (`/pipeline`) — Kanban 7 stadi fissi: Lead → Analisi → Preventivo inviato → Trattativa → Contratto firmato → In sviluppo → Completato
- **Milestone** — per ogni opportunità: descrizione, importo, data fatturazione, data pagamento, status `pending → invoiced → paid`
- **Dashboard** (`/dashboard`) — KPI: fatturato YTD, incassato YTD, da fatturare, da incassare, scadenze 60gg, **barra soglia forfettario** (alert rosso ≥ 80% di €100.000)

## Principi assoluti

1. **Single-tenant** — nessun `companyId`, nessun filtro per azienda. Utente unico: Enrico.
2. **Modifica SOLO il richiesto** — niente refactoring non richiesto
3. **Nessun modulo fiscale/contabile** — solo tracking milestone (invoiced/paid), non fatturazione vera
4. **Mai modificare `vite.config.ts`** senza coordinamento
5. **Nessun multi-tenancy** — non aggiungere mai logica multi-tenant, è scelta deliberata

## Env var obbligatorie

```env
DATABASE_URL=postgresql://...@postgres.railway.internal:5432/railway
SESSION_SECRET=<32+ caratteri>
NODE_ENV=production
PORT=5001
INITIAL_USER_EMAIL=enricomaggio@gmail.com
INITIAL_USER_PASSWORD=<password>
```

## Note operative

- `bootstrapDatabase()` crea schema + seed 7 stadi + utente al primo avvio
- `npm run db:push` gira automaticamente prima di ogni start (Railway)
- Logo: `client/public/emme-logo.png`
- Utente unico: Enrico Maggiolo (enricomaggio@gmail.com)
