# EMME Gestionale — CRM Interno

**Stato:** Attivo — in produzione su Railway
**Avviato:** Giugno 2026
**Repo:** `progetti/emme` (Desktop)

---

## Cos'è

Gestionale personale per Enrico / EMME. Uso interno — non è un prodotto per clienti. Gestisce clienti, pipeline commerciale e avanzamento fatturazione a milestone.

Costruito adattando GDM Lattonerie come base (rimossi: preventivatore, mappa, cantieri, multi-tenancy). Sistema milestone preso dal pattern MZA.

---

## Deploy

| Voce | Valore |
|------|--------|
| Hosting | Railway |
| DB | PostgreSQL Railway (interno: `postgres.railway.internal:5432/railway`) |
| Build | `npm run build` |
| Start | `npm run db:push && npm start` |
| Porta | 5001 |

---

## Accesso

- **Email:** enricomaggio@gmail.com
- **Password:** Emme2026!

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

---

## Moduli attivi

### Clienti (route `/clienti`)
- Lista clienti + dettaglio
- Tipi: AZIENDA / PRIVATO
- Campo `source` (testo libero — es. "passaparola da DaDo Ponteggi")
- Tab: info / opportunità / referenti / note

### Pipeline (route `/pipeline`)
Kanban a 7 stadi fissi (non configurabili):

| Stadio | Colore |
|--------|--------|
| Lead | Grigio |
| Analisi | Blu |
| Preventivo inviato | Ambra |
| Trattativa | Viola |
| Contratto firmato | Verde |
| In sviluppo | Azzurro |
| Completato | Verde scuro |

Ogni opportunità ha una sezione **Milestone** (CRUD):
- Campi: descrizione, importo, data prevista fatturazione, data prevista pagamento
- Status: `pending` → `invoiced` → `paid`
- `invoicedAmount` sull'opportunità si aggiorna automaticamente

### Dashboard (route `/dashboard`)
KPI:
- Fatturato YTD (milestone `invoiced`, anno corrente)
- Incassato YTD (milestone `paid`, anno corrente)
- Da fatturare (milestone `pending` su opportunità Contratto/Sviluppo/Completato)
- Da incassare (milestone `invoiced` non ancora `paid`)
- Valore pipeline per stadio
- Scadenze imminenti (prossimi 60 giorni)
- **Barra soglia forfettario**: fatturato anno vs €100.000 — alert rosso ≥ 80%

---

## Schema DB — Tabelle principali

| Tabella | Descrizione |
|---------|-------------|
| `users` | Utente Enrico (singolo, no multi-tenant) |
| `sessions` | Sessioni autenticate |
| `pipeline_stages` | 7 stadi fissi (seedati al bootstrap) |
| `leads` | Clienti/prospect (UI rinominata "Clienti") |
| `contact_referents` | Referenti aziendali |
| `opportunities` | Opportunità commerciali — ha `invoicedAmount` calcolato |
| `opportunity_milestones` | Rate di fatturazione per opportunità |
| `reminders` | Promemoria |
| `notifications` | Notifiche in-app |
| `password_reset_tokens` | Token reset password |

---

## Router backend

| File | Endpoint |
|------|----------|
| `auth.router.ts` | Login, logout, sessione |
| `leads.router.ts` | CRUD clienti + referenti |
| `opportunities.router.ts` | CRUD opportunità + stage |
| `milestones.router.ts` | CRUD milestone + cambio status |
| `dashboard.router.ts` | KPI dashboard |
| `users.router.ts` | Profilo utente |
| `notifications.router.ts` | Notifiche in-app |

---

## Env var obbligatorie

```env
DATABASE_URL=postgresql://...@postgres.railway.internal:5432/railway
SESSION_SECRET=<32+ caratteri>
NODE_ENV=production
PORT=5001
INITIAL_USER_EMAIL=enricomaggio@gmail.com
INITIAL_USER_PASSWORD=<password>
```

---

## Note operative

- `bootstrapDatabase()` in `server/db.ts` crea schema + seed 7 stadi + utente al primo avvio
- `npm run db:push` gira automaticamente prima di ogni start (vedi `railway.toml`)
- Nessun multi-tenancy — ogni query lavora senza filtro `companyId`
- Nessun sistema di fatturazione completo — solo tracking stato milestone
- Logo: `client/public/emme-logo.png`
- Utente unico: Enrico Maggiolo
