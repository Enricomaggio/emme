# CLAUDE.md — Guida per Claude Code CLI

Questo file è la fonte di verità per qualsiasi agente AI (Claude Code, Cursor, Copilot) che lavora su questo repository.

---

## Project Overview

Gestionale custom multi-modulo (CRM + ERP + Planning) sviluppato per il settore edile/lattoneria. Architettura multi-tenant: ogni azienda cliente è isolata tramite `companyId`. Il sistema gestisce l'intero ciclo commerciale e operativo: contatti → opportunità → preventivi → cantieri → pianificazione squadre.

**Cliente attivo:** GDM Lattonerie s.r.l. (Trevignano TV)
**Istanza base:** fork di `gestionale-dado` (DaDo Ponteggi) con moduli ponteggi nascosti tramite feature flag.

---

## Tech Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v3, shadcn/ui (Radix), TanStack Query v5, Wouter |
| Backend | Node.js, Express 4, TypeScript, tsx (dev) |
| ORM | Drizzle ORM + drizzle-zod |
| Database | PostgreSQL (Railway) |
| Auth | express-session + passport-local + bcryptjs |
| PDF | @react-pdf/renderer |
| Form | react-hook-form + zod |
| Mappe | Leaflet + react-leaflet |
| Grafici | Recharts |

---

## Comandi principali

```bash
npm run dev       # Avvia server Express + Vite dev server (porta 5000)
npm run build     # Build produzione (tsx script/build.ts → dist/)
npm run start     # Avvia server produzione da dist/
npm run check     # Type check TypeScript (tsc)
npm run db:push   # Applica schema Drizzle al DB (drizzle-kit push)
```

> Il workflow `Start application` su Replit esegue `npm run dev`.
> Dopo ogni merge di task agent, riavviare manualmente l'app (il backend Express non si ricarica automaticamente).

---

## Guiding Principles — TASSATIVI

### 1. Modifica SOLO il richiesto
Non fare refactoring globale, rinominare variabili, riordinare import o "pulire" codice funzionante a meno che non sia esplicitamente richiesto. Ogni modifica non richiesta è un rischio.

### 2. Se funziona, non si tocca
Il codice eredita anni di fix specifici. Una funzione "brutta" potrebbe contenere workaround critici. Non riscrivere mai senza capire perché esiste.

### 3. Backend sottile, frontend ricco
La logica di business vive nel frontend dove possibile. Il backend si occupa solo di persistenza e chiamate API esterne. I router devono essere thin.

### 4. Nessuna contabilità
Questo sistema gestisce il **cervello operativo** (preventivi, cantieri, squadre). Non tocca contabilità, fatturazione attiva o passiva, registri IVA. Non aggiungere mai logica fiscale.

### 5. Multi-tenancy sempre
Ogni query al DB deve filtrare per `companyId`. Non esistono dati globali (eccetto tabelle di sistema come `users` per SUPER_ADMIN).

### 6. Mai modificare package.json
Per installare pacchetti usare i tool dedicati di Replit. Non editare `package.json` direttamente.

### 7. Mai modificare vite.config.ts e server/vite.ts
La configurazione Vite è già ottimizzata per il dual-server (Express + Vite sulla stessa porta). Non aggiungere proxy o modificare alias.

---

## Architettura

```
/
├── client/                  # Frontend React (Vite)
│   ├── src/
│   │   ├── App.tsx           # Router Wouter — route protette per ruolo
│   │   ├── pages/            # Pagine (una per route)
│   │   ├── components/       # Componenti riutilizzabili
│   │   │   └── ui/           # ~50 componenti shadcn/ui
│   │   ├── lib/              # Auth, QueryClient, utils
│   │   ├── hooks/            # Hook custom
│   │   ├── pdf/              # Generazione PDF (react-pdf)
│   │   │   ├── QuotePdfDocument.tsx
│   │   │   ├── QuotePdfActions.tsx
│   │   │   └── quote-pdf-utils.ts
│   │   └── index.css         # Stili globali Tailwind + variabili CSS
│   ├── public/               # Asset statici (logo, favicon)
│   └── index.html
│
├── server/                  # Backend Express
│   ├── index.ts              # Entry point, middleware, startup
│   ├── auth.ts               # JWT middleware, requireRole, requireAuth
│   ├── db.ts                 # Pool PostgreSQL, bootstrapDatabase()
│   ├── storage.ts            # Data access layer (Drizzle queries)
│   ├── routes.ts             # Registrazione router
│   ├── routers/              # Un file per dominio
│   │   ├── auth.router.ts
│   │   ├── leads.router.ts
│   │   ├── opportunities.router.ts
│   │   ├── quotes.router.ts
│   │   ├── catalog.router.ts
│   │   ├── payment-methods.router.ts
│   │   ├── company.router.ts
│   │   ├── users.router.ts
│   │   └── admin.router.ts
│   └── utils/
│       ├── accessContext.ts  # Risoluzione company/ruolo per multi-tenancy
│       ├── quoteCalc.ts      # Motore calcolo preventivi (round2, applyDiscount)
│       └── errors.ts         # Classi errore standard
│
├── shared/
│   └── schema.ts             # Tabelle Drizzle + tipi + insert schema (fonte di verità)
│
├── migrations/               # SQL migrations idempotenti (0001 → 0032+)
├── scripts/                  # Utility (post-merge.sh, seed, reset-password)
└── script/build.ts           # Build produzione
```

---

## Pagine attive (GDM Lattonerie)

| Route | File | Note |
|---|---|---|
| `/` | `dashboard.tsx` | KPI e sommario |
| `/leads` | `leads.tsx` | Lista contatti/clienti |
| `/leads/:id` | `lead-detail.tsx` | Dettaglio contatto con tab |
| `/opportunities` | `opportunita.tsx` | Pipeline vendite |
| `/quotes/:id` | `quote-editor.tsx` | Editor preventivo lattoneria |
| `/catalog` | `catalog.tsx` | Catalogo materiali e articoli |
| `/settings` | `settings.tsx` | Impostazioni azienda e metodi pagamento |
| `/team` | `team.tsx` | Gestione utenti |
| `/mappa` | `mappa.tsx` | Vista mappa contatti |
| `/admin` | `admin.tsx` | Solo SUPER_ADMIN |

**Pagine nascoste per GDM** (visibili nel codice, non nel menu):
- `/proxit` — Pianificazione squadre ponteggi
- `/gantt` — Gantt cantieri
- `/sal` — Stato avanzamento lavori
- `/progetti` — Gestione commesse

---

## Feature Flags (variabili VITE_)

Lette da `client/src/lib/config.ts` come `APP_CONFIG`.

| Variabile | Valore GDM | Effetto |
|---|---|---|
| `VITE_APP_NAME` | `GDM Lattonerie` | Nome app nel browser |
| `VITE_MODULE_PONTEGGI` | `false` | Nasconde campi ponteggi nel catalogo |
| `VITE_MODULE_PROXIT` | `false` | Nasconde voce Proxit dalla sidebar |
| `VITE_MODULE_AMMINISTRAZIONE` | `false` | Nasconde tab Amministrazione nel lead |
| `VITE_QUOTE_EDITOR_TYPE` | `lattoneria` | Usa `quote-editor.tsx` invece dello scaffolding |

---

## Ruoli utente

```
SUPER_ADMIN      → accesso totale a tutti i tenant
COMPANY_ADMIN    → accesso totale alla propria azienda
SALES_AGENT      → accesso a lead/opportunità assegnati
TECHNICIAN       → solo moduli operativi (cantieri, Proxit)
```

Protezione route: `requireRole(...)` in `server/auth.ts`.

---

## Schema DB — Tabelle chiave

| Tabella | Descrizione |
|---|---|
| `companies` | Tenant aziendali |
| `users` + `user_companies` | Utenti e appartenenza aziendale |
| `leads` | Contatti / clienti |
| `contact_referents` | Referenti per lead aziendali |
| `pipeline_stages` | Stadi pipeline (configurabili per azienda) |
| `opportunities` | Opportunità commerciali |
| `quotes` | Preventivi (con JSONB `discounts`, `globalParams`) |
| `quote_items` | Righe preventivo (type: LATTONERIA/ARTICOLO/GIORNATE/MANUALE) |
| `materials` | Materiali lattoneria (con `priceMode`: SINGLE/PER_VARIANT) |
| `material_thicknesses` | Spessori con prezzo €/kg |
| `material_finishes` | Finiture per spessore |
| `article_families` | Famiglie articoli |
| `articles` | Articoli catalogo |
| `labor_rates` | Tariffe manodopera |
| `payment_methods` | Metodi di pagamento (per azienda) |
| `lead_sources` | Sorgenti lead |

---

## Convenzioni di naming

- **File componenti:** `kebab-case.tsx` (es. `lead-detail.tsx`, `quote-editor.tsx`)
- **Componenti React:** `PascalCase` (es. `QuotePdfDocument`)
- **Router Express:** `dominio.router.ts` (es. `leads.router.ts`)
- **Variabili DB:** `snake_case` (Drizzle mappa automaticamente a `camelCase`)
- **Tipi shared:** definiti in `shared/schema.ts` con pattern:
  - `pgTable(...)` → tabella
  - `createInsertSchema(table).omit({...})` → insert schema
  - `z.infer<typeof insertSchema>` → insert type
  - `typeof table.$inferSelect` → select type
- **Test IDs:** `{azione}-{target}` (es. `button-submit`, `input-email`, `row-quote-item-${uid}`)

---

## Calcolo preventivo lattoneria

Formula per righe `LATTONERIA`:

```
sviluppo_cm / 100 × metri_lineari × (spessore_mm / 1000) × densità_kg_m3 = weightKg
weightKg × costo_€_kg = costRow
costRow × (1 + marginPercent/100) = baseTotal
baseTotal × (1 - discountPercent/100) = totalRow
```

I prezzi vengono **congelati al salvataggio**. Le modifiche al catalogo non aggiornano preventivi già salvati (comportamento intenzionale).

---

## Pattern da rispettare

### API fetch (TanStack Query)
```ts
const query = useQuery<TipoRisposta>({ queryKey: ["/api/endpoint", id] });
// queryFn NON va definita — il fetcher globale in queryClient.ts gestisce tutto
```

### Mutazioni
```ts
const mutation = useMutation({
  mutationFn: () => apiRequest("POST", "/api/endpoint", payload),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/endpoint"] });
  },
});
```

### Storage (backend)
Tutte le query passano per `server/storage.ts`. I router non fanno query dirette al DB.

### Navigazione "indietro"
Usare sempre `window.history.back()` per i pulsanti ←, mai URL hardcoded.

---

## Variabili d'ambiente obbligatorie

```env
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
SESSION_SECRET="stringa-random-min-32-caratteri"
NODE_ENV="development" | "production"
PORT=5000
```

---

## Asset GDM

| File | Uso |
|---|---|
| `client/public/gdm-logo.png` | Logo GDM (usato nel PDF via `window.location.origin + '/gdm-logo.png'`) |
| `client/public/favicon.png` | Favicon |

---

## Note operative

- **DB migrations:** file SQL in `migrations/` con `ADD COLUMN IF NOT EXISTS` (idempotenti). Eseguiti automaticamente da `bootstrapDatabase()` all'avvio.
- **Post-merge:** dopo ogni merge di task agent, `scripts/post-merge.sh` esegue `drizzle-kit push` per allineare lo schema.
- **Errori pre-esistenti non bloccanti:** `column "is_internal" does not exist` (admin.router.ts — tabella workers legacy) — non toccare.
- **PDF generation:** lato client con `@react-pdf/renderer`. Logo caricato via URL assoluto dal public folder.
- **Email preventivo:** mailto link, nessun server SMTP. Il PDF viene scaricato e allegato manualmente.
