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
npm test          # Esegue i test vitest (cartella tests/)
```

## Test e guardrail (IMPORTANTE)

Questo progetto ha un impianto di test: `vitest` (config in `vitest.config.ts`, test in `tests/`) e un hook **pre-commit** husky che esegue `npm test` — se un test fallisce, il commit viene bloccato.

> **Se questo progetto è stato appena CLONATO per un nuovo cliente** (`cp -r emme ...` dalla skill `setup-app`): dopo aver fatto `git init` nel nuovo repo, esegui **`npx husky`** per riarmare il pre-commit. Lo script `prepare` di `npm install` non lo arma se gira prima del `git init`. Verifica con `git config core.hooksPath` → deve stampare `.husky/_`.

> **Logica di calcolo custom (preventivo, IVA, SAL):** i test non arrivano dalla base — vanno scritti per ogni cliente, in `tests/`. Per moduli `shared/` (solo import di tipi) testa diretto; se la funzione importa `storage`/DB, mockalo con `vi.mock('../server/storage', () => ({ storage: {} }))`.

## Standard di codice

**Quando scrivere un test.** Domanda unica: *se questa logica dà il risultato sbagliato in silenzio, chi ci rimette e quanto?* SI testa (funzione pura nuova) se calcola: **soldi** (IVA, totali, preventivo, SAL, sconti, arrotondamenti), **isolamento dati** (`companyId`), **soglie/scaglioni**, **macchine a stati**. NON si testa: UI/layout, CRUD banale, codice che fallisce in modo visibile. Regola: testa ciò che fallisce *in silenzio*. Definition of done: la feature che rientra nel trigger nasce col suo test, nello stesso commit, `npm test` verde.

**Organizzazione (anti-drift).** Una feature nuova = un modulo/file nuovo, NON accodare a un file grande esistente. File oltre ~400 righe → spezzare per responsabilità. La logica di calcolo pura va in `shared/` o `server/utils/` (testabile), MAI dentro route handler o componenti React. Un router per dominio. Prima di aggiungere a un'area: "è una responsabilità nuova?" → se sì, file nuovo.

> Dove c'è ESLint, la regola `max-lines` (warn, 400) segnala i file troppo lunghi. I file mostri esistenti non si spezzano in automatico (è giudizio architetturale, sessione dedicata): il guardrail serve a non farli ricrescere.

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
