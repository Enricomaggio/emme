# CLAUDE.md — Guida per Claude Code CLI

Questo file è la fonte di verità per qualsiasi agente AI (Claude Code, Cursor, Copilot) che lavora su questo repository.

---

## Project Overview

Gestionale custom multi-modulo (CRM + preventivi + cantieri) sviluppato per **GDM Lattonerie s.r.l.** (Trevignano TV), settore lattoneria/coperture metalliche. Architettura multi-tenant: ogni azienda è isolata tramite `companyId`. Il sistema gestisce l'intero ciclo commerciale e operativo: contatti → opportunità → preventivi → cantieri → nota lavori.

---

## Tech Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v3, shadcn/ui (Radix), TanStack Query v5, Wouter |
| Backend | Node.js, Express 4, TypeScript, tsx (dev) |
| ORM | Drizzle ORM + drizzle-zod |
| Database | PostgreSQL (Railway) |
| Auth | express-session + passport-local + bcryptjs |
| PDF | @react-pdf/renderer (lato client) |
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
Questo sistema gestisce il **cervello operativo** (preventivi, cantieri). Non tocca contabilità, fatturazione attiva o passiva, registri IVA. Non aggiungere mai logica fiscale.

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
│   ├── public/               # Asset statici (solo gdm-logo.png e favicon.png)
│   └── index.html
│
├── server/                  # Backend Express
│   ├── index.ts              # Entry point, middleware, startup
│   ├── auth.ts               # Middleware requireRole, requireAuth
│   ├── db.ts                 # Pool PostgreSQL, bootstrapDatabase()
│   ├── storage/              # Data access layer — un file per dominio
│   │   ├── index.ts          # Aggregatore — esporta oggetto `storage` unificato
│   │   ├── pipeline.ts       # Opportunities, stages, activity logs
│   │   ├── settings.ts       # PaymentMethods, LeadSources, Reminders
│   │   ├── analytics.ts      # SalesTargets, statistiche vinte/perse
│   │   └── ...               # altri moduli storage
│   ├── routes.ts             # Registrazione router
│   ├── routers/              # Un file per dominio
│   │   ├── auth.router.ts
│   │   ├── leads.router.ts
│   │   ├── opportunities.router.ts
│   │   ├── quotes.router.ts
│   │   ├── catalog.router.ts
│   │   ├── work-orders.router.ts  # Nota lavori + SAL cantieri
│   │   ├── payment-methods.router.ts
│   │   ├── company.router.ts
│   │   ├── users.router.ts
│   │   ├── notifications.router.ts
│   │   └── admin.router.ts
│   └── utils/
│       ├── accessContext.ts  # Risoluzione company/ruolo per multi-tenancy
│       ├── quoteCalc.ts      # Motore calcolo preventivi (round2, applyDiscount)
│       └── errors.ts         # Classi errore standard
│
├── shared/
│   └── schema.ts             # Tabelle Drizzle + tipi + insert schema (fonte di verità)
│
├── migrations/               # SQL migrations idempotenti (0001 → 0038+)
├── scripts/                  # Utility (post-merge.sh, seed, reset-password)
└── script/build.ts           # Build produzione
```

---

## Pagine attive (GDM Lattonerie)

| Route | File | Note |
|---|---|---|
| `/` | `dashboard.tsx` | KPI e sommario |
| `/leads` | `leads.tsx` | Lista contatti/clienti |
| `/leads/duplicates` | `lead-duplicates.tsx` | Rilevazione e merge contatti duplicati |
| `/leads/:id` | `lead-detail.tsx` | Dettaglio contatto con tab |
| `/opportunita` | `opportunita.tsx` | Pipeline vendite (kanban) |
| `/cantieri` | `cantieri.tsx` | Vista cantieri attivi con SAL inline |
| `/cantieri/:id/nuova-nl` | `create-work-order.tsx` | Wizard creazione Nota Lavori |
| `/quotes/:id` | `quote-editor.tsx` | Editor preventivo lattoneria |
| `/catalog` | `catalog.tsx` | Catalogo materiali e articoli |
| `/impostazioni` | `settings.tsx` | Impostazioni azienda e metodi pagamento |
| `/team` | `team.tsx` | Gestione utenti |
| `/mappa` | `mappa.tsx` | Vista mappa contatti |
| `/admin` | `admin.tsx` | Solo SUPER_ADMIN |

---

## Feature Flags (variabili VITE_)

Lette da `client/src/lib/config.ts` come `APP_CONFIG`.

| Variabile | Valore GDM | Effetto |
|---|---|---|
| `VITE_APP_NAME` | `GDM Lattonerie` | Nome app nel browser |
| `VITE_MODULE_AMMINISTRAZIONE` | `false` | Nasconde tab Amministrazione nel lead |
| `VITE_MODULE_CANTIERI` | (default `true`) | Mostra voce Cantieri nella sidebar |

---

## Ruoli utente

```
SUPER_ADMIN      → accesso totale a tutti i tenant
COMPANY_ADMIN    → accesso totale alla propria azienda
SALES_AGENT      → accesso a lead/opportunità assegnati
TECHNICIAN       → moduli operativi (cantieri, note lavori)
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
| `opportunities` | Opportunità commerciali (include campi cantiere: `siteStatus`, coordinate GPS, ecc.) |
| `quotes` | Preventivi (con JSONB `discounts`) |
| `quote_items` | Righe preventivo (type: LATTONERIA/ARTICOLO/GIORNATE/MANUALE) |
| `work_orders` | Note lavori collegate a un'opportunità |
| `work_order_items` | Righe nota lavori |
| `materials` | Materiali lattoneria (con `priceMode`: SINGLE/PER_VARIANT) |
| `material_thicknesses` | Spessori con prezzo €/kg |
| `material_finishes` | Finiture per spessore |
| `article_families` | Famiglie articoli |
| `articles` | Articoli catalogo |
| `labor_rates` | Tariffe manodopera |
| `payment_methods` | Metodi di pagamento (per azienda) |
| `lead_sources` | Sorgenti lead |
| `reminders` | Promemoria su lead/opportunità |
| `notifications` | Notifiche in-app |
| `sales_targets` | Obiettivi mensili per venditore |

---

## Pipeline cantieri — Stadi post-vendita

Dopo lo stadio "Vinto", le opportunità seguono questa progressione:

```
Vinto → Cantiere in corso → Nota Lavori da Inviare → Nota Lavori Inviata → Da Fatturare
```

Il campo `opportunities.siteStatus` traccia lo stato operativo del cantiere (`ACTIVE`, `COMPLETED`, ecc.).

---

## Calcolo preventivo lattoneria

Formula per righe `LATTONERIA`:

```
sviluppo_cm / 100 × metri_lineari × (spessore_mm / 1000) × densità_kg_m3 = weightKg
weightKg × prezzo_€_kg × moltiplicatore_finitura = costRow
costRow × (1 + marginPercent/100) = baseTotal
applyDiscountOrOverride(baseTotal, discountPercent, overrideTotal) = totalRow
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
Tutte le query passano per `server/storage/index.ts`. I router non fanno query dirette al DB.

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

- **DB migrations:** i file SQL in `migrations/` sono applicati con `npm run db:push` (drizzle-kit push). Non vengono eseguiti automaticamente all'avvio — `bootstrapDatabase()` contiene solo le migration inline per le tabelle core.
- **Post-merge:** dopo ogni merge di task agent, `scripts/post-merge.sh` esegue `drizzle-kit push` per allineare lo schema.
- **PDF generation:** lato client con `@react-pdf/renderer`. Logo caricato via URL assoluto dal public folder.
- **Email preventivo:** mailto link, nessun server SMTP. Il PDF viene scaricato e allegato manualmente.
