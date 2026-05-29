import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, index, uniqueIndex, unique, integer, numeric, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Esporta le tabelle sessions e users dal modello auth
export * from "./models/auth";
import { users, userRoleEnum, type UserRole, type UserStatus } from "./models/auth";

// Tabella Companies - Aziende/Tenant
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  vatNumber: text("vat_number"),
  fiscalCode: text("fiscal_code"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  shareCapital: text("share_capital"),
  iban: text("iban"),
  logoUrl: text("logo_url"),
  // Campi aggiuntivi per il PDF preventivo
  pecEmail: text("pec_email"),
  website: text("website"),
  rea: text("rea"),
  bankName: text("bank_name"),
  bankHolder: text("bank_holder"),
  bankSwift: text("bank_swift"),
  quotePaymentTerms: text("quote_payment_terms"),
  quoteValidityDays: integer("quote_validity_days").default(30),
  quoteFooterNotes: text("quote_footer_notes"),
  emailSubjectTemplate: text("email_subject_template"),
  emailBodyTemplate: text("email_body_template"),
  workOrderDisclaimerText: text("work_order_disclaimer_text"),
  workOrderEmailSubjectTemplate: text("work_order_email_subject_template"),
  workOrderEmailBodyTemplate: text("work_order_email_body_template"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tabella PipelineStages - Fasi della pipeline per ogni azienda
export const pipelineStages = pgTable("pipeline_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  color: text("color").notNull().default("#4563FF"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pipeline_stages_company_id_idx").on(table.companyId),
  index("pipeline_stages_order_idx").on(table.order),
]);

// Enum per tipo entità contatto (AZIENDA vs PRIVATO)
export const entityTypeEnum = ["COMPANY", "PRIVATE"] as const;
export type EntityType = typeof entityTypeEnum[number];

// Vecchio enum mantenuto per retrocompatibilità
export const contactTypeEnum = ["lead", "cliente", "non_in_target"] as const;
export type ContactType = typeof contactTypeEnum[number];

// Enum per provenienza contatto
export const sourceEnum = [
  "Facebook", "Instagram", "Google", "LinkedIn", "Passaparola", 
  "Newsletter", "CAF", "Cartellonistica", "Mondo Appalti", 
  "Facebook Ads", "Instagram Ads", "Google Ads"
] as const;
export type ContactSource = typeof sourceEnum[number];

// Enum per motivazione opportunità persa
export const lostReasonEnum = ["PRICE_HIGH", "TIMING", "LOST_TO_COMPETITOR", "NOT_IN_TARGET", "NO_RESPONSE", "OTHER"] as const;
export type LostReason = typeof lostReasonEnum[number];

// Enum per qualità cantiere (quando opportunità vinta)
export const siteQualityEnum = ["PHOTO_VIDEO", "PHOTO_ONLY", "NOTHING"] as const;
export type SiteQuality = typeof siteQualityEnum[number];

// Enum per unità di misura articoli (Preventivatore)
export const unitTypeEnum = ["MQ", "ML", "CAD", "NUM", "MC", "PZ", "MT"] as const;
export type UnitType = typeof unitTypeEnum[number];

// Enum per logica di pricing articoli (LABOR e EXTRA rimossi - usare SERVICE)
export const pricingLogicEnum = ["RENTAL", "DOCUMENT", "TRANSPORT", "SERVICE", "HOIST", "SALE"] as const;
export type PricingLogic = typeof pricingLogicEnum[number];
// Legacy types mantenuti per backward compatibility con dati esistenti
export type PricingLogicLegacy = PricingLogic | "LABOR" | "EXTRA";

// Enum per categoria articoli (distinzione materiale proprio vs cliente)
export const articleCategoryEnum = ["SCAFFOLDING", "SCAFFOLDING_LABOR", "TRANSPORT", "DOCUMENT", "SERVICE", "HANDLING", "TRASFERTA", "HOIST"] as const;
export type ArticleCategory = typeof articleCategoryEnum[number];

// Enum per aliquote IVA
export const vatRateEnum = ["22", "10", "4", "RC"] as const;
export type VatRate = typeof vatRateEnum[number];

// Tipo per dati pricing montacarichi (HOIST)
// Struttura per gestire prezzi basamento, elevazione, sbarco/sbalzo con variazione per durata
export interface HoistPricingTier {
  months_1_2: number;
  months_3_5: number;
  months_6_8: number;
  months_9_plus: number;
}

export interface HoistPricingData {
  // Costo noleggio basamento (€/cad/mese)
  basamento: HoistPricingTier;
  // Costo noleggio per metro di elevazione (€/mt/mese)
  elevazione: HoistPricingTier;
  // Costo noleggio cancello sbarco (€/cad/mese) - per PM-M10
  sbarco?: HoistPricingTier;
  // Costo noleggio sbalzo verso parete (€/mq/mese) - per P26
  sbalzo?: HoistPricingTier;
}

// Tipo per dati manodopera montacarichi
export interface HoistInstallationData {
  // Costo base montaggio basamento (€/cad)
  basamentoMount: number;
  // Costo base smontaggio basamento (€/cad)
  basamentoDismount: number;
  // Costo aggiuntivo per metro di altezza - montaggio (€/mt)
  elevazioneMountPerMeter: number;
  // Costo aggiuntivo per metro di altezza - smontaggio (€/mt)
  elevazioneDismountPerMeter: number;
  // Costo cancello sbarco (€/cad) - per PM-M10
  sbarcoMount?: number;
  sbarcoDismount?: number;
  // Costo sbalzo (€/mq) - per P26
  sbalzoMount?: number;
  sbalzoDismount?: number;
}

// Tipo per dati trasferta (costo1 e costo2 con label configurabili)
export interface TrasfertaData {
  costo1Label: string;      // es. "Costo auto" o "Costo Hotel"
  costo1Value: number;      // €/km o €/Persona
  costo1Unit: string;       // es. "€/Km" o "€/Persona"
  costo2Label: string;      // es. "Costo a persona" o "Costo extra personale"
  costo2Value: number;      // €/km o €/Persona
  costo2Unit: string;       // es. "€/Km" o "€/Persona"
}

// Enum per stato preventivo
export const quoteStatusEnum = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "WORK_ORDER_DRAFT", "WORK_ORDER_SENT", "WORK_ORDER_CONFIRMED"] as const;
export type QuoteStatus = typeof quoteStatusEnum[number];

// Enum per tipo riga preventivo (Catalogo Lattoneria)
export const quoteItemTypeEnum = ["LATTONERIA", "ARTICOLO", "GIORNATE", "MANUALE"] as const;
export type QuoteItemType = typeof quoteItemTypeEnum[number];

// Enum per fase riga preventivo (6 fasi Excel-style)
export const quotePhaseEnum = [
  "DOCUMENTI",                // POS, Relazione Calcolo
  "TRASPORTO_ANDATA",         // Trasporto all'andata
  "MOVIMENTAZIONE_MAGAZZINO", // Movimentazione logistica magazzino (auto-inserita se RENTAL presente)
  "MONTAGGIO",                // Manodopera montaggio
  "NOLEGGIO",                 // Canone noleggio mensile
  "SMONTAGGIO",               // Manodopera smontaggio
  "TRASPORTO_RITORNO"         // Trasporto al ritorno
] as const;
export type QuotePhase = typeof quotePhaseEnum[number];

// Tipo per parametri globali preventivo
export interface QuoteGlobalParams {
  durationMonths: number;
  distanceKm: number;
  logisticsDifficulty: "LOW" | "MEDIUM" | "HIGH";
  // Aliquota IVA di default per il preventivo (22%, 10%, 4%, RC)
  vatRateDefault?: VatRate;
  // Voci "A corpo" - articoli con totale editabile manualmente
  aCorpoItems?: Array<{
    articleId: string;
    variantIndex?: number;
    notes?: string;
    quantity: number;
    totalPrice: number;
  }>;
  // Override prezzo POS/Pimus manuale
  posManualPrice?: number;
  posManualEnabled?: boolean;
  // ML rete antipolvere (NOL-010) per calcolo prezzo a scaglioni SRV-004
  reteAntipolvereQtyML?: number;
  // Servizi opzionali selezionati (array di ID servizio)
  optionalServices?: string[];
  // Testi personalizzati per servizi opzionali { id: testo }
  optionalServicesTexts?: Record<string, string>;
  // Trasporti Lagunari Venezia
  lagunariVehicleIndex?: number;
  lagunariNumeroCamion?: number;
  lagunariBarcaVariantIndex?: number;
  lagunariNumeroBarca?: number;
}

// Tipo per sconti per singola voce (item-level)
export interface QuoteItemDiscount {
  phase: QuotePhase;
  itemIndex: number;  // Indice dell'item nella fase
  discountPercent: number;  // Sconto percentuale (0-100)
}

// Tipo legacy per sconti per fase (mantenuto per compatibilità)
export interface QuotePhaseDiscount {
  phase: QuotePhase;
  discountPercent?: number;  // Sconto percentuale (0-100)
  discountAmount?: number;   // Sconto importo fisso in €
}

export interface QuoteDiscounts {
  itemDiscounts?: QuoteItemDiscount[];  // Sconti per singola voce
  phaseDiscounts?: QuotePhaseDiscount[];  // Sconti per fase (legacy)
  globalDiscountPercent?: number;  // Sconto globale finale (solo percentuale, legacy)
  globalDiscountAmount?: number;  // Sconto globale fisso in € (quando mode = "euro")
  globalDiscountMode?: "percent" | "euro";  // Modalità sconto globale
}

// Tipo per zona movimentazione (logistica cantiere)
export interface HandlingZone {
  label: string;           // Es. "Zona A", "Ingresso secondario"
  quantity: number;        // Quantità mq/mc da movimentare
  distHoriz: number;       // Distanza orizzontale in metri
  distVert: number;        // Distanza verticale in metri
  type: "GROUND" | "HEIGHT";  // A terra o in quota
}

// Tipo per dati movimentazione nel preventivo
export interface HandlingData {
  enabled: boolean;
  zones: HandlingZone[];
  saltareti: {
    included: boolean;
    quantity: number;
  };
  extraPrice: number;      // Costo una tantum manuale
}

// Tipo per parametri movimentazione (coefficienti di calcolo)
export interface HandlingParamsData {
  k_terra_orizz: number;   // Costo per mq/mc per metro orizzontale a terra
  k_terra_vert: number;    // Costo per mq/mc per metro verticale a terra
  k_quota_orizz: number;   // Costo per mq/mc per metro orizzontale in quota
  k_quota_vert: number;    // Costo per mq/mc per metro verticale in quota
  free_meters_limit: number; // Primi N metri orizzontali gratis
}

// Tipi per pricingData strutturati per categoria
export interface RentalPricingData {
  months_1_2: number;      // Prezzo per 1-2 mesi
  months_3_5: number;      // Prezzo per 3-5 mesi
  months_6_8: number;      // Prezzo per 6-8 mesi
  months_9_plus: number;   // Prezzo per 9+ mesi
}

export interface LaborPricingData {
  mount: number;           // Prezzo montaggio
  dismount: number;        // Prezzo smontaggio
}

export interface InstallationOption {
  label: string;           // Es. "Da terra", "Sopra tetti", "Sospeso"
  mount: number;           // Prezzo montaggio per unità
  dismount: number;        // Prezzo smontaggio per unità
  isDefault?: boolean;     // Opzione predefinita
}

export type InstallationData = InstallationOption[];

// Variante/Modello di un articolo (es. diversi modelli di montacarichi)
export interface ArticleVariant {
  label: string;             // Nome variante (es. "200kg - 24m")
  description: string;       // Descrizione dettagliata con specifiche tecniche
  rental?: {                 // Prezzi noleggio per le 4 fasce (opzionale)
    months_1_2: number;
    months_3_5: number;
    months_6_8: number;
    months_9_plus: number;
  };
  installation?: {           // Costi manodopera (opzionale)
    mount: number;
    dismount: number;
  };
  supportsCesta?: boolean;   // Se true, permette opzione "con cesta"
  cestaPrice?: number;       // Legacy: prezzo unico cesta (backward compatibility)
  cestaMountPrice?: number;  // Prezzo aggiuntivo cesta per montaggio (€/unità)
  cestaDismountPrice?: number; // Prezzo aggiuntivo cesta per smontaggio (€/unità)
  isDefault?: boolean;       // Variante predefinita
  
  // ===== HOIST (Ponteggi Elettrici) specific fields =====
  hoistType?: "PM-M10" | "P26";  // Tipo per logica sbarco/sbalzo
  hoistRental?: HoistPricingData;       // Prezzi noleggio componenti HOIST
  hoistInstallation?: HoistInstallationData;  // Costi manodopera HOIST
  
  // ===== Campi "Servizio Aggiuntivo" per preventivo =====
  isAdditionalService?: boolean;           // Se true, questa variante appare nella sezione "Altri Servizi" del preventivo
  serviceDescriptionMounting?: string;     // Testo per la riga montaggio/smontaggio in "Altri Servizi"
  serviceDescriptionRental?: string;       // Testo per la riga noleggio in "Altri Servizi"
  serviceMountingApplyTrasferta?: boolean; // Se true, il prezzo montaggio viene moltiplicato per il coefficiente trasferta
  quoteDescription?: string;              // Testo che appare nella tabella "Lavorazione" del preventivo
  price?: number;  // Prezzo fisso per varianti a prezzo autonomo (es. barca lagunare)
}

export type ArticleVariantsData = ArticleVariant[];

export interface TransportVehicle {
  name: string;            // Nome veicolo (es. "Furgone DAILY")
  fix: number;             // Prezzo fisso viaggio
  perKm: number;           // Prezzo per km
  description?: string;    // Descrizione veicolo per PDF
  banchinaCost?: number;     // €/camion/direzione (scarico banchina — andata O ritorno)
  ferryLidoCost?: number;    // €/camion/direzione (ferry all-inclusive — Lido)
  ferryPellesCost?: number;  // €/camion/direzione (ferry all-inclusive — Pellestrina)
}

export interface TransportPricingData {
  vehicles: TransportVehicle[];  // Lista veicoli disponibili
}

export interface DocumentOption {
  name: string;            // Nome opzione (es. "Fino a 1000 mq")
  price: number;           // Prezzo opzione
}

export interface DocumentPricingData {
  options: DocumentOption[];  // Lista opzioni documento
}

export interface SimplePricingData {
  price: number;           // Prezzo singolo per EXTRA/SERVICE
}

export interface SalePricingData {
  price: number;           // Prezzo per unità di vendita (es. €90 per rotolo)
  unitCoverage?: number;   // Copertura per unità in mq (es. 200 mq per rotolo). Se definito, quantità vendita = ceil(mq / unitCoverage)
}

export type PricingData = RentalPricingData | LaborPricingData | TransportPricingData | DocumentPricingData | SimplePricingData | SalePricingData | HandlingParamsData;

// Tabella Leads (Contatti) - Contatti/Clienti con isolamento multi-tenant
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Tipo entità: AZIENDA o PRIVATO
  entityType: text("entity_type").$type<EntityType>().notNull().default("COMPANY"),
  // Classificazione commerciale (lead potenziale vs cliente acquisito)
  type: text("type").$type<ContactType>().notNull().default("lead"),
  
  // Dati anagrafici (nome per aziende = Ragione Sociale, firstName/lastName per privati)
  name: text("name"), // Ragione Sociale per COMPANY
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  
  // Indirizzo
  address: text("address"),
  city: text("city"),
  zipCode: text("zip_code"),
  province: text("province"),
  country: text("country").default("Italia"),
  
  // Dati fiscali
  vatNumber: text("vat_number"), // P.IVA
  fiscalCode: text("fiscal_code"), // Codice Fiscale
  companyNature: text("company_nature").$type<"PRIVATE" | "PUBLIC">().default("PRIVATE"), // Azienda Privata o Pubblica
  sdiCode: text("sdi_code"), // Codice SDI (per aziende private)
  ipaCode: text("ipa_code"), // Codice IPA (per aziende pubbliche)
  pecEmail: text("pec_email"), // PEC
  
  // Provenienza
  source: text("source").$type<ContactSource>(),
  
  // Modalità di pagamento
  paymentMethodId: varchar("payment_method_id"),
  
  // Affidabilità commerciale
  reliability: text("reliability").$type<"AFFIDABILE" | "POCO_AFFIDABILE" | "NON_AFFIDABILE">().default("AFFIDABILE"),
  
  // Brochure inviata
  brochureSent: boolean("brochure_sent").default(false),
  
  // Note e metadati
  notes: text("notes"),
  // Integrazione Superbill: ID cliente nell'anagrafica Superbill
  superbillClientId: text("superbill_client_id"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("leads_company_id_idx").on(table.companyId),
  index("leads_assigned_to_user_id_idx").on(table.assignedToUserId),
  index("leads_type_idx").on(table.type),
  index("leads_entity_type_idx").on(table.entityType),
]);

// Tipo per il riepilogo opportunità collegato a un lead (campo calcolato, non stored)
export interface OpportunitySummary {
  total: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
}

// Lead arricchito con dati calcolati dall'endpoint GET /api/leads
export type LeadWithSummary = typeof leads.$inferSelect & {
  firstReferentName: string | null;
  opportunitySummary: OpportunitySummary;
};

// Tabella ContactReferents - Referenti aziendali (per contatti COMPANY)
export const contactReferents = pgTable("contact_referents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  contactId: varchar("contact_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("contact_referents_contact_id_idx").on(table.contactId),
]);

// Tabella Opportunities - Cantieri/Preventivi collegati ai Lead
export const opportunities = pgTable("opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  value: numeric("value"),
  stageId: varchar("stage_id").references(() => pipelineStages.id),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  referentId: varchar("referent_id").references(() => contactReferents.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  
  // Indirizzo cantiere
  siteAddress: text("site_address"),
  siteCity: text("site_city"),
  siteZip: text("site_zip"),
  siteProvince: text("site_province"),
  mapsLink: text("maps_link"),
  
  // Distanza cantiere (km) e squadra in zona
  siteDistanceKm: integer("site_distance_km"),
  siteSquadraInZonaKm: integer("site_squadra_in_zona_km"),
  veniceZone: text("venice_zone"),
  
  // Coordinate GPS per mappa cantieri
  siteLatitude: numeric("site_latitude"),
  siteLongitude: numeric("site_longitude"),
  
  // Motivazione persa
  lostReason: text("lost_reason").$type<LostReason>(),
  
  // Qualità cantiere (quando vinto)
  siteQuality: text("site_quality").$type<SiteQuality>(),
  
  // Date indicative lavori (compilate dal venditore prima di chiudere come vinta)
  estimatedStartDate: timestamp("estimated_start_date"),
  estimatedEndDate: timestamp("estimated_end_date"),
  
  // Sopralluogo fatto (da step 3 preventivatore)
  sopralluogoFatto: boolean("sopralluogo_fatto"),
  
  expectedCloseDate: timestamp("expected_close_date"),
  probability: integer("probability").default(50),

  // Timestamp precisi per vinto/perso (immutabili dopo essere stati impostati)
  wonAt: timestamp("won_at"),
  lostAt: timestamp("lost_at"),

  // Stato operativo cantiere (rilevante solo quando wonAt IS NOT NULL)
  // "ACTIVE" | "INVOICING_PENDING" | "COMPLETED"
  siteStatus: text("site_status").notNull().default("ACTIVE"),

  // Campi per gestione notifica "Preventivo Inviato da 60 giorni"
  quoteSentAt: timestamp("quote_sent_at"),
  quoteReminderSnoozedUntil: timestamp("quote_reminder_snoozed_until"),

  // Campi per gestione notifica programmata foto/video cantiere (-10 giorni da inizio)
  photoNotificationScheduledAt: timestamp("photo_notification_scheduled_at"),
  photoNotificationSentAt: timestamp("photo_notification_sent_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("opportunities_company_id_idx").on(table.companyId),
  index("opportunities_lead_id_idx").on(table.leadId),
  index("opportunities_stage_id_idx").on(table.stageId),
  index("opportunities_assigned_to_user_id_idx").on(table.assignedToUserId),
  index("opportunities_referent_id_idx").on(table.referentId),
]);

// Tabella ActivityLogs - Log delle attività per audit trail
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  userId: varchar("user_id").references(() => users.id),
  entityType: text("entity_type").notNull(), // 'lead' | 'opportunity'
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(), // 'created' | 'updated' | 'deleted' | 'moved'
  details: jsonb("details"), // { field: 'email', oldValue: 'x', newValue: 'y' } o { fromStage: 'X', toStage: 'Y' }
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("activity_logs_company_id_idx").on(table.companyId),
  index("activity_logs_entity_type_entity_id_idx").on(table.entityType, table.entityId),
  index("activity_logs_user_id_idx").on(table.userId),
  index("activity_logs_created_at_idx").on(table.createdAt),
]);

// Tabella per associare utenti a companies (multi-tenant)
// Constraint UNIQUE su userId per garantire un solo tenant per utente
export const userCompanies = pgTable("user_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("user_companies_company_id_idx").on(table.companyId),
]);

// Tabella Invites - Inviti utenti con token magic link
export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  role: varchar("role").$type<UserRole>().notNull(),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  token: varchar("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("invites_token_idx").on(table.token),
  index("invites_company_id_idx").on(table.companyId),
  index("invites_expires_at_idx").on(table.expiresAt),
]);

// Tabella Password Reset Tokens - Token per reset password dall'admin
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: varchar("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("password_reset_tokens_token_idx").on(table.token),
  index("password_reset_tokens_user_id_idx").on(table.userId),
]);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Tabella Articles - Listino articoli per Preventivatore
export const articles = pgTable("articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  code: text("code").notNull(), // Codice articolo (es. ART-001)
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").$type<ArticleCategory>().notNull().default("SCAFFOLDING"), // Categoria articolo
  unitType: text("unit_type").$type<UnitType>().notNull().default("MQ"),
  pricingLogic: text("pricing_logic").$type<PricingLogicLegacy>().notNull().default("RENTAL"),
  basePrice: numeric("base_price").notNull().default("0"),
  pricingData: jsonb("pricing_data").$type<PricingData>(), // Dati strutturati per pricing complesso
  installationData: jsonb("installation_data").$type<InstallationData>(), // Opzioni installazione per RENTAL
  warehouseCostPerUnit: numeric("warehouse_cost_per_unit"), // Costo magazzino per unità (€/mq, €/ml, €/cad)
  variantsData: jsonb("variants_data").$type<ArticleVariantsData>(), // Varianti/modelli articolo (es. diversi montacarichi)
  trasfertaData: jsonb("trasferta_data").$type<TrasfertaData>(), // Dati trasferta per categoria TRASFERTA
  hoistInstallationData: jsonb("hoist_installation_data").$type<HoistInstallationData>(), // Dati manodopera per montacarichi (HOIST)
  isChecklistItem: integer("is_checklist_item").notNull().default(0), // 0 = false, 1 = true
  checklistOrder: integer("checklist_order").default(0),
  isActive: integer("is_active").notNull().default(1), // 0 = false, 1 = true
  // Campi "Servizio Aggiuntivo" per preventivo (articoli senza varianti)
  quoteDescription: text("quote_description"), // Testo per tabella "Lavorazione" nel preventivo
  isAdditionalService: integer("is_additional_service").notNull().default(0), // 0 = false, 1 = true
  serviceDescriptionMounting: text("service_description_mounting"), // Testo montaggio/smontaggio per "Altri Servizi"
  serviceDescriptionRental: text("service_description_rental"), // Testo noleggio per "Altri Servizi"
  serviceMountingApplyTrasferta: integer("service_mounting_apply_trasferta").notNull().default(0), // 0 = false, 1 = true
  serviceUnitMounting: text("service_unit_mounting"), // Unità di misura override per voce mounting in "Altri Servizi" (es. "MQ" per posa rete)
  displayOrder: integer("display_order").notNull().default(0), // Ordine di visualizzazione nel preventivo
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("articles_company_id_idx").on(table.companyId),
  index("articles_is_checklist_item_idx").on(table.isChecklistItem),
  index("articles_checklist_order_idx").on(table.checklistOrder),
  index("articles_code_idx").on(table.code),
  index("articles_display_order_idx").on(table.displayOrder),
]);

// Tabella Quotes - Preventivi
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id").notNull().references(() => opportunities.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  number: text("number").notNull(), // Es. "PREV-2024-001"
  status: text("status").$type<QuoteStatus>().notNull().default("DRAFT"),
  totalAmount: numeric("total_amount").notNull().default("0"),
  // Oggetto/descrizione e note libere del preventivo (Catalogo Lattoneria)
  subject: text("subject"),
  notes: text("notes"),
  // Campi legacy ponteggi: nullable per supportare il nuovo preventivatore lattoneria
  globalParams: jsonb("global_params").$type<QuoteGlobalParams>(),
  discounts: jsonb("discounts").$type<QuoteDiscounts>(), // Sconti per fase e globale
  handlingData: jsonb("handling_data").$type<HandlingData>(), // Dati movimentazione cantiere
  pdfData: jsonb("pdf_data"), // Dati completi per rendering PDF (totals, clausole, ecc.)
  // Campi nota lavori (post-cantiere)
  workOrderNotes: text("work_order_notes"),
  workOrderSentAt: timestamp("work_order_sent_at"),
  workOrderConfirmedAt: timestamp("work_order_confirmed_at"),
  // Integrazione Superbill: ID documento e data invio
  superbillDocumentId: text("superbill_document_id"),
  superbillSentAt: timestamp("superbill_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("quotes_opportunity_id_idx").on(table.opportunityId),
  index("quotes_company_id_idx").on(table.companyId),
  index("quotes_status_idx").on(table.status),
  unique("quotes_company_id_number_unique").on(table.companyId, table.number),
]);

// Tabella QuoteItems - Righe preventivo (3 tipi: LATTONERIA, ARTICOLO, GIORNATE)
export const quoteItems = pgTable("quote_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),

  // Tipo riga (Catalogo Lattoneria) — null per righe legacy ponteggi
  type: text("type").$type<QuoteItemType>(),

  // FK legacy verso articles (ponteggi). Nullable per nuove righe lattoneria.
  articleId: varchar("article_id").references(() => articles.id),

  // FK Catalogo Lattoneria (uno solo valorizzato in base al type)
  materialId: varchar("material_id").references(() => materials.id),
  materialThicknessId: varchar("material_thickness_id").references(() => materialThicknesses.id),
  materialFinishId: varchar("material_finish_id").references(() => materialFinishes.id, { onDelete: "set null" }),
  catalogArticleId: varchar("catalog_article_id").references(() => catalogArticles.id),
  laborRateId: varchar("labor_rate_id").references(() => laborRates.id),

  // Snapshot descrittivi (per stabilità anche se l'item del catalogo viene modificato/eliminato)
  description: text("description"),
  unitOfMeasure: text("unit_of_measure"),

  // Per righe LATTONERIA: sviluppo in cm
  developmentCm: numeric("development_cm"),

  // Quantità: metri lineari (LATTONERIA), unità (ARTICOLO), giorni (GIORNATE)
  quantity: numeric("quantity").notNull().default("0"),

  // Snapshot calcoli congelati al salvataggio
  weightKg: numeric("weight_kg"),
  unitCost: numeric("unit_cost"),
  marginPercent: numeric("margin_percent"),

  // Campi legacy ponteggi
  phase: text("phase").$type<QuotePhase>(),
  priceSnapshot: jsonb("price_snapshot").$type<PricingData>(),
  vatRate: text("vat_rate").$type<VatRate>(),

  // Sconto percentuale per riga (0 = nessuno sconto)
  discountPercent: numeric("discount_percent").notNull().default("0"),
  // Override manuale del totale riga (se valorizzato, sovrascrive il calcolo automatico)
  overrideTotal: numeric("override_total"),

  // Prezzo finale (totalRow = totale riga, unitPriceApplied = prezzo unitario applicato)
  unitPriceApplied: numeric("unit_price_applied").notNull().default("0"),
  // Totale calcolato prima di sconto/override (snapshot del prezzo "pieno")
  baseTotal: numeric("base_total"),
  totalRow: numeric("total_row").notNull().default("0"),

  // Ordinamento riga nel preventivo
  displayOrder: integer("display_order").notNull().default(0),

  // Override quantità per nota lavori (10% dei casi in cui differisce dal preventivo)
  workOrderQuantityOverride: numeric("work_order_quantity_override"),

  // Pannello bozza/cliente: se true, la riga è solo interna (non va nel PDF cliente)
  isInternalOnly: boolean("is_internal_only").notNull().default(false),
  // Prezzo finale esposto al cliente (impostato manualmente o tramite spalma manodopera)
  clientTotal: numeric("client_total", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("quote_items_quote_id_idx").on(table.quoteId),
  index("quote_items_article_id_idx").on(table.articleId),
  index("quote_items_phase_idx").on(table.phase),
  index("quote_items_type_idx").on(table.type),
  index("quote_items_display_order_idx").on(table.displayOrder),
]);

// Relazioni
export const companiesRelations = relations(companies, ({ many }) => ({
  leads: many(leads),
  opportunities: many(opportunities),
  userCompanies: many(userCompanies),
  pipelineStages: many(pipelineStages),
  articles: many(articles),
  quotes: many(quotes),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  company: one(companies, {
    fields: [articles.companyId],
    references: [companies.id],
  }),
  quoteItems: many(quoteItems),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  opportunity: one(opportunities, {
    fields: [quotes.opportunityId],
    references: [opportunities.id],
  }),
  company: one(companies, {
    fields: [quotes.companyId],
    references: [companies.id],
  }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteItems.quoteId],
    references: [quotes.id],
  }),
  article: one(articles, {
    fields: [quoteItems.articleId],
    references: [articles.id],
  }),
}));

export const pipelineStagesRelations = relations(pipelineStages, ({ one, many }) => ({
  company: one(companies, {
    fields: [pipelineStages.companyId],
    references: [companies.id],
  }),
  opportunities: many(opportunities),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  company: one(companies, {
    fields: [leads.companyId],
    references: [companies.id],
  }),
  assignedToUser: one(users, {
    fields: [leads.assignedToUserId],
    references: [users.id],
  }),
  opportunities: many(opportunities),
  referents: many(contactReferents),
}));

export const contactReferentsRelations = relations(contactReferents, ({ one }) => ({
  contact: one(leads, {
    fields: [contactReferents.contactId],
    references: [leads.id],
  }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  lead: one(leads, {
    fields: [opportunities.leadId],
    references: [leads.id],
  }),
  referent: one(contactReferents, {
    fields: [opportunities.referentId],
    references: [contactReferents.id],
  }),
  company: one(companies, {
    fields: [opportunities.companyId],
    references: [companies.id],
  }),
  stage: one(pipelineStages, {
    fields: [opportunities.stageId],
    references: [pipelineStages.id],
  }),
  quotes: many(quotes),
  assignedToUser: one(users, {
    fields: [opportunities.assignedToUserId],
    references: [users.id],
  }),
}));

export const userCompaniesRelations = relations(userCompanies, ({ one }) => ({
  company: one(companies, {
    fields: [userCompanies.companyId],
    references: [companies.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  company: one(companies, {
    fields: [activityLogs.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

// Schema di validazione per inserimento
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCompanySchema = createInsertSchema(userCompanies).omit({
  id: true,
  createdAt: true,
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).omit({
  id: true,
  createdAt: true,
});

export const insertOpportunitySchema = createInsertSchema(opportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  photoNotificationScheduledAt: true,
  photoNotificationSentAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertInviteSchema = createInsertSchema(invites).omit({
  id: true,
  createdAt: true,
});

export const insertContactReferentSchema = createInsertSchema(contactReferents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({
  id: true,
  createdAt: true,
});

// Tipi TypeScript
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

export type UserCompany = typeof userCompanies.$inferSelect;
export type InsertUserCompany = z.infer<typeof insertUserCompanySchema>;

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Invite = typeof invites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;

export type ContactReferent = typeof contactReferents.$inferSelect;
export type InsertContactReferent = z.infer<typeof insertContactReferentSchema>;

export type Article = typeof articles.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;

export const creditsafeReports = pgTable("creditsafe_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  connectId: text("connect_id"),
  creditScore: integer("credit_score"),
  creditRating: text("credit_rating"),
  internationalScore: text("international_score"),
  contractLimit: integer("contract_limit"),
  contractLimitCurrency: text("contract_limit_currency").default("EUR"),
  incorporationDate: text("incorporation_date"),
  companyStatus: text("company_status"),
  revenue: jsonb("revenue").$type<{ year: number; value: number }[]>(),
  cashFlow: jsonb("cash_flow").$type<{ year: number; value: number }[]>(),
  profit: jsonb("profit").$type<{ year: number; value: number }[]>(),
  avgPaymentDays: jsonb("avg_payment_days").$type<{ year: number; value: number }[]>(),
  rawReport: jsonb("raw_report"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("creditsafe_reports_lead_id_idx").on(table.leadId),
  index("creditsafe_reports_company_id_idx").on(table.companyId),
]);

export const insertCreditsafeReportSchema = createInsertSchema(creditsafeReports).omit({ id: true, createdAt: true, updatedAt: true });
export type CreditsafeReport = typeof creditsafeReports.$inferSelect;
export type InsertCreditsafeReport = z.infer<typeof insertCreditsafeReportSchema>;

// Tabella PaymentMethods - Modalità di pagamento per ogni azienda
export const paymentMethods = pgTable("payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("payment_methods_company_id_idx").on(table.companyId),
]);

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true, createdAt: true });
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;

// Tabella LeadSources - Provenienze configurabili per ogni azienda
export const leadSources = pgTable("lead_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("lead_sources_company_id_idx").on(table.companyId),
]);

export const insertLeadSourceSchema = createInsertSchema(leadSources).omit({ id: true, createdAt: true });
export type LeadSource = typeof leadSources.$inferSelect;
export type InsertLeadSource = z.infer<typeof insertLeadSourceSchema>;

// Tabella Reminders - Promemoria per commerciali e team
export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  leadId: varchar("lead_id").references(() => leads.id),
  opportunityId: varchar("opportunity_id").references(() => opportunities.id),
  userId: varchar("user_id").notNull(),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  isAutomatic: boolean("is_automatic").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("reminders_company_id_idx").on(table.companyId),
  index("reminders_user_id_idx").on(table.userId),
  index("reminders_due_date_idx").on(table.dueDate),
  index("reminders_lead_id_idx").on(table.leadId),
  index("reminders_opportunity_id_idx").on(table.opportunityId),
]);

export const insertReminderSchema = createInsertSchema(reminders).omit({ id: true, createdAt: true, completedAt: true });
export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_company_id_idx").on(table.companyId),
  index("notifications_is_read_idx").on(table.isRead),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type AppNotification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export const notificationTypes = [
  { type: "NEW_PROJECT", label: "Nuovi cantieri", description: "Quando un'opportunità viene vinta e si crea un nuovo progetto", roles: ["TECHNICIAN"] },
  { type: "PROJECT_CANCELLED", label: "Cantiere annullato", description: "Quando un'opportunità vinta viene riportata a persa e il progetto collegato viene eliminato", roles: ["TECHNICIAN"] },
  { type: "SITE_PHOTO", label: "Cantieri da foto", description: "Quando un cantiere è segnalato come bello da fotografare", roles: ["COMPANY_ADMIN", "SUPER_ADMIN"] },
  { type: "SITE_PHOTO_VIDEO", label: "Cantieri da foto + video", description: "Quando un cantiere è segnalato per foto e videointervista", roles: ["COMPANY_ADMIN", "SUPER_ADMIN"] },
  { type: "QUOTE_EXPIRING", label: "Preventivo in scadenza", description: "Quando un'opportunità è in 'Preventivo Inviato' da almeno 60 giorni senza aggiornamenti", roles: ["SALES_AGENT", "COMPANY_ADMIN"] },
  { type: "LEAD_CALL_REQUEST", label: "Contatto da chiamare", description: "Quando la segreteria segnala un nuovo contatto da richiamare", roles: ["SALES_AGENT", "COMPANY_ADMIN"] },
] as const;

export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  notificationType: text("notification_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
}, (table) => [
  index("notification_preferences_user_id_idx").on(table.userId),
]);

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true });
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;

// Tabella SalesTargets - Obiettivi mensili per venditore
export const salesTargets = pgTable("sales_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  quoteTarget: numeric("quote_target").notNull().default("0"),
  wonTarget: numeric("won_target").notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("sales_targets_unique").on(table.companyId, table.userId, table.month, table.year),
  index("sales_targets_company_id_idx").on(table.companyId),
  index("sales_targets_user_id_idx").on(table.userId),
]);

export const insertSalesTargetSchema = createInsertSchema(salesTargets).omit({ id: true, updatedAt: true });
export type SalesTarget = typeof salesTargets.$inferSelect;
export type InsertSalesTarget = z.infer<typeof insertSalesTargetSchema>;

// ========== SAL - Stato Avanzamento Lavori ==========

// Enum per stato SAL
// ============ CATALOGO LATTONERIA ============
// Tabelle globali condivise tra tutte le aziende (no companyId).
// Materiali (es. Rame, Alluminio, Zinco) con peso specifico in kg/m³.
// Ogni materiale ha più spessori (es. 0.6mm, 0.8mm) ognuno con costo/kg e margine % di default.
// Articoli (catalog_articles): articoli pre-acquistati e rivenduti (staffe, raccordi, ecc.).
// Manodopera (labor_rates): voci di manodopera giornaliera.
export const materials = pgTable("materials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Peso specifico in kg/m³
  density: numeric("density").notNull().default("0"),
  // 'SINGLE' = prezzo unico per tutti gli spessori, 'PER_VARIANT' = ogni variante ha il suo prezzo
  priceMode: text("price_mode").notNull().default("SINGLE"),
  singleCostPerKg: numeric("single_cost_per_kg").default("0"),
  singleMarginPercent: numeric("single_margin_percent").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const materialThicknesses = pgTable("material_thicknesses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  materialId: varchar("material_id").notNull().references(() => materials.id, { onDelete: "cascade" }),
  // Spessore in millimetri
  thicknessMm: numeric("thickness_mm").notNull(),
  // Finitura opzionale (es. "Grezzo", "Preverniciato", "RAL 9010")
  finish: text("finish"),
  // Costo al kg in € — usato solo in modalità PER_VARIANT
  costPerKg: numeric("cost_per_kg").default("0"),
  // Margine % di default — usato solo in modalità PER_VARIANT
  marginPercent: numeric("margin_percent").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("material_thicknesses_material_id_idx").on(table.materialId),
]);

// Famiglie articoli (es. "Tubo Alluminio Preverniciato")
export const articleFamilies = pgTable("article_families", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull().default("mt"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const catalogArticles = pgTable("catalog_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // familyId collega la variante alla sua famiglia
  familyId: varchar("family_id").references(() => articleFamilies.id, { onDelete: "cascade" }),
  // name diventa l'etichetta variante (es. "Diam. 60")
  name: text("name").notNull(),
  unitCost: numeric("unit_cost").notNull().default("0"),
  marginPercent: numeric("margin_percent").notNull().default("0"),
  unitOfMeasure: text("unit_of_measure").notNull().default("pz"),
  // Note aggiuntive (es. "spessore 0.8mm")
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const laborRates = pgTable("labor_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // Costo al giorno in €
  costPerDay: numeric("cost_per_day").notNull().default("0"),
  marginPercent: numeric("margin_percent").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Finiture per spessore (es. "rosso siena", "RAL 9010")
export const materialFinishes = pgTable("material_finishes", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  thicknessId: varchar("thickness_id").notNull()
                 .references(() => materialThicknesses.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow(),
}, (table) => [
  index("material_finishes_thickness_id_idx").on(table.thicknessId),
]);

export const materialsRelations = relations(materials, ({ many }) => ({
  thicknesses: many(materialThicknesses),
}));

export const materialThicknessesRelations = relations(materialThicknesses, ({ one, many }) => ({
  material: one(materials, {
    fields: [materialThicknesses.materialId],
    references: [materials.id],
  }),
  finishes: many(materialFinishes),
}));

export const materialFinishesRelations = relations(materialFinishes, ({ one }) => ({
  thickness: one(materialThicknesses, {
    fields: [materialFinishes.thicknessId],
    references: [materialThicknesses.id],
  }),
}));

export const articleFamiliesRelations = relations(articleFamilies, ({ many }) => ({
  variants: many(catalogArticles),
}));

export const catalogArticlesRelations = relations(catalogArticles, ({ one }) => ({
  family: one(articleFamilies, {
    fields: [catalogArticles.familyId],
    references: [articleFamilies.id],
  }),
}));

const catalogNumericString = z.union([z.string(), z.number()])
  .transform(v => String(v))
  .refine(v => !isNaN(parseFloat(v)), { message: "Valore numerico non valido" });

export const insertMaterialSchema = createInsertSchema(materials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  density: catalogNumericString.refine(v => parseFloat(v) > 0, { message: "Il peso specifico deve essere maggiore di 0" }),
  priceMode: z.enum(["SINGLE", "PER_VARIANT"]).default("SINGLE"),
  singleCostPerKg: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il costo deve essere >= 0" }).optional(),
  singleMarginPercent: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il margine deve essere >= 0" }).optional(),
});

export const insertMaterialThicknessSchema = createInsertSchema(materialThicknesses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  materialId: z.string().min(1, "Seleziona un materiale"),
  thicknessMm: catalogNumericString.refine(v => parseFloat(v) > 0, { message: "Lo spessore deve essere maggiore di 0" }),
  finish: z.string().optional().nullable(),
  costPerKg: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il costo al kg deve essere >= 0" }).optional(),
  marginPercent: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il margine deve essere >= 0" }).optional(),
});

export const insertArticleFamilySchema = createInsertSchema(articleFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  unitOfMeasure: z.string().min(1, "L'unità di misura è obbligatoria"),
});

export const insertCatalogArticleSchema = createInsertSchema(catalogArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  familyId: z.string().min(1, "Seleziona una famiglia").optional().nullable(),
  notes: z.string().optional().nullable(),
  unitCost: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il costo unitario deve essere >= 0" }),
  marginPercent: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il margine deve essere >= 0" }),
  unitOfMeasure: z.string().min(1, "L'unità di misura è obbligatoria"),
});

export const insertLaborRateSchema = createInsertSchema(laborRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  costPerDay: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il costo al giorno deve essere >= 0" }),
  marginPercent: catalogNumericString.refine(v => parseFloat(v) >= 0, { message: "Il margine deve essere >= 0" }),
});

export const insertMaterialFinishSchema = createInsertSchema(materialFinishes).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Il nome è obbligatorio"),
  sortOrder: z.number().int().min(0).default(0),
});

export type MaterialPriceMode = "SINGLE" | "PER_VARIANT";

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;

export type MaterialThickness = typeof materialThicknesses.$inferSelect;
export type InsertMaterialThickness = z.infer<typeof insertMaterialThicknessSchema>;

export type MaterialFinish = typeof materialFinishes.$inferSelect;
export type InsertMaterialFinish = z.infer<typeof insertMaterialFinishSchema>;

export type MaterialThicknessWithFinishes = MaterialThickness & { finishes: MaterialFinish[] };
export type MaterialWithThicknesses = Material & { thicknesses: MaterialThicknessWithFinishes[] };

export type ArticleFamily = typeof articleFamilies.$inferSelect;
export type InsertArticleFamily = z.infer<typeof insertArticleFamilySchema>;
export type ArticleFamilyWithVariants = ArticleFamily & { variants: CatalogArticle[] };

export type CatalogArticle = typeof catalogArticles.$inferSelect;
export type InsertCatalogArticle = z.infer<typeof insertCatalogArticleSchema>;

export type LaborRate = typeof laborRates.$inferSelect;
export type InsertLaborRate = z.infer<typeof insertLaborRateSchema>;

// ========== NOTA LAVORI (Tabelle dedicate) ==========

export const workOrderStatusEnum = ["DRAFT", "SENT", "CONFIRMED"] as const;
export type WorkOrderStatus = typeof workOrderStatusEnum[number];

export const workOrders = pgTable("work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  opportunityId: varchar("opportunity_id").notNull().references(() => opportunities.id),
  quoteId: varchar("quote_id").references(() => quotes.id),
  number: text("number").notNull(),
  subject: text("subject"),
  notes: text("notes"),
  totalAmount: numeric("total_amount").notNull().default("0"),
  status: text("status").$type<WorkOrderStatus>().notNull().default("DRAFT"),
  sentAt: timestamp("sent_at"),
  confirmedAt: timestamp("confirmed_at"),
  invoicedAmount: numeric("invoiced_amount", { precision: 10, scale: 2 }),
  invoicedAt: timestamp("invoiced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("work_orders_company_id_idx").on(table.companyId),
  index("work_orders_opportunity_id_idx").on(table.opportunityId),
]);

export const workOrderItems = pgTable("work_order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  description: text("description").notNull().default(""),
  unitOfMeasure: text("unit_of_measure").notNull().default("ml"),
  quantity: numeric("quantity").notNull().default("0"),
  unitPrice: numeric("unit_price").notNull().default("0"),
  totalRow: numeric("total_row").notNull().default("0"),
  displayOrder: integer("display_order").notNull().default(0),
  // Collegamento alla riga preventivo di origine (popolato dal wizard Crea NL, Prompt 2)
  sourceQuoteItemId: varchar("source_quote_item_id").references(() => quoteItems.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("work_order_items_work_order_id_idx").on(table.workOrderId),
]);

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  company: one(companies, { fields: [workOrders.companyId], references: [companies.id] }),
  opportunity: one(opportunities, { fields: [workOrders.opportunityId], references: [opportunities.id] }),
  quote: one(quotes, { fields: [workOrders.quoteId], references: [quotes.id] }),
  items: many(workOrderItems),
}));

export const workOrderItemsRelations = relations(workOrderItems, ({ one }) => ({
  workOrder: one(workOrders, { fields: [workOrderItems.workOrderId], references: [workOrders.id] }),
}));

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkOrderItemSchema = createInsertSchema(workOrderItems).omit({ id: true, createdAt: true });

export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrderItem = typeof workOrderItems.$inferSelect;
export type InsertWorkOrderItem = z.infer<typeof insertWorkOrderItemSchema>;
export type WorkOrderWithItems = WorkOrder & { items: WorkOrderItem[] };
