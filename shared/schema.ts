import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, index, integer, numeric, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Esporta sessions e users dal modello auth
export * from "./models/auth";
import { users } from "./models/auth";

// ============ PIPELINE ============

// I 7 stadi fissi della pipeline EMME (non configurabili dall'utente).
// Persistono in DB come righe seedate al bootstrap.
export const PIPELINE_STAGES_FIXED = [
  { name: "Lead",               order: 1, color: "#94A3B8" },
  { name: "Analisi",             order: 2, color: "#4563FF" },
  { name: "Preventivo inviato",  order: 3, color: "#F59E0B" },
  { name: "Trattativa",          order: 4, color: "#A855F7" },
  { name: "Contratto firmato",   order: 5, color: "#10B981" },
  { name: "In sviluppo",         order: 6, color: "#0EA5E9" },
  { name: "Completato",          order: 7, color: "#059669" },
] as const;

export type FixedStageName = typeof PIPELINE_STAGES_FIXED[number]["name"];

export const pipelineStages = pgTable("pipeline_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  order: integer("order").notNull().default(0),
  color: text("color").notNull().default("#4563FF"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pipeline_stages_order_idx").on(table.order),
]);

// ============ CLIENTI (tabella DB resta "leads") ============

export const entityTypeEnum = ["COMPANY", "PRIVATE"] as const;
export type EntityType = typeof entityTypeEnum[number];

export const contactTypeEnum = ["lead", "cliente"] as const;
export type ContactType = typeof contactTypeEnum[number];

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Tipo entità: AZIENDA o PRIVATO
  entityType: text("entity_type").$type<EntityType>().notNull().default("COMPANY"),
  // Classificazione (lead potenziale vs cliente acquisito)
  type: text("type").$type<ContactType>().notNull().default("lead"),

  // Dati anagrafici (name per aziende = Ragione Sociale, firstName/lastName per privati)
  name: text("name"),
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
  vatNumber: text("vat_number"),
  fiscalCode: text("fiscal_code"),
  sdiCode: text("sdi_code"),
  pecEmail: text("pec_email"),

  // Provenienza (testo libero)
  source: text("source"),

  // Note libere
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("leads_type_idx").on(table.type),
  index("leads_entity_type_idx").on(table.entityType),
]);

// Riepilogo opportunità collegate a un cliente (calcolato in API)
export interface OpportunitySummary {
  total: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
}

export type LeadWithSummary = typeof leads.$inferSelect & {
  firstReferentName: string | null;
  opportunitySummary: OpportunitySummary;
};

// ============ REFERENTI ============

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

// ============ OPPORTUNITÀ ============

export const lostReasonEnum = ["PRICE_HIGH", "TIMING", "LOST_TO_COMPETITOR", "NOT_IN_TARGET", "NO_RESPONSE", "OTHER"] as const;
export type LostReason = typeof lostReasonEnum[number];

export const opportunities = pgTable("opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),

  // Valore stimato (offerta o preventivo iniziale)
  value: numeric("value"),
  // Valore del contratto firmato (somma delle milestone)
  contractTotal: numeric("contract_total"),
  // Netto già fatturato — ricalcolato dalle milestone "invoiced"/"paid"
  invoicedAmount: numeric("invoiced_amount").notNull().default("0"),

  stageId: varchar("stage_id").references(() => pipelineStages.id),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  referentId: varchar("referent_id").references(() => contactReferents.id, { onDelete: "set null" }),

  // Motivazione perso
  lostReason: text("lost_reason").$type<LostReason>(),

  // Date di pianificazione
  estimatedStartDate: timestamp("estimated_start_date"),
  estimatedEndDate: timestamp("estimated_end_date"),
  expectedCloseDate: timestamp("expected_close_date"),
  probability: integer("probability").default(50),

  // Timestamp esiti
  wonAt: timestamp("won_at"),
  lostAt: timestamp("lost_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("opportunities_lead_id_idx").on(table.leadId),
  index("opportunities_stage_id_idx").on(table.stageId),
  index("opportunities_referent_id_idx").on(table.referentId),
]);

// ============ MILESTONE DI FATTURAZIONE ============

export const milestoneStatusEnum = ["pending", "invoiced", "paid"] as const;
export type MilestoneStatus = typeof milestoneStatusEnum[number];

export const opportunityMilestones = pgTable("opportunity_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),

  // Importo della rata (€). Per il forfettario non gestiamo IVA: l'importo è quello fatturato lordo = netto.
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),

  // Date pianificate
  invoiceDate: timestamp("invoice_date"),   // Data prevista emissione fattura
  paymentDate: timestamp("payment_date"),   // Data prevista incasso

  description: text("description"),
  status: text("status").$type<MilestoneStatus>().notNull().default("pending"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("opportunity_milestones_opportunity_id_idx").on(table.opportunityId),
  index("opportunity_milestones_status_idx").on(table.status),
  index("opportunity_milestones_invoice_date_idx").on(table.invoiceDate),
  index("opportunity_milestones_payment_date_idx").on(table.paymentDate),
]);

// ============ REMINDERS ============

export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  leadId: varchar("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  opportunityId: varchar("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
  isAutomatic: boolean("is_automatic").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("reminders_due_date_idx").on(table.dueDate),
  index("reminders_lead_id_idx").on(table.leadId),
  index("reminders_opportunity_id_idx").on(table.opportunityId),
]);

// ============ NOTIFICATIONS ============

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_is_read_idx").on(table.isRead),
]);

// ============ PASSWORD RESET ============

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("password_reset_tokens_token_idx").on(table.token),
  index("password_reset_tokens_user_id_idx").on(table.userId),
]);

// ============ RELATIONS ============

export const pipelineStagesRelations = relations(pipelineStages, ({ many }) => ({
  opportunities: many(opportunities),
}));

export const leadsRelations = relations(leads, ({ many }) => ({
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
  stage: one(pipelineStages, {
    fields: [opportunities.stageId],
    references: [pipelineStages.id],
  }),
  milestones: many(opportunityMilestones),
}));

export const opportunityMilestonesRelations = relations(opportunityMilestones, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [opportunityMilestones.opportunityId],
    references: [opportunities.id],
  }),
}));

// ============ INSERT SCHEMAS ============

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).omit({
  id: true,
  createdAt: true,
});

export const insertOpportunitySchema = createInsertSchema(opportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  invoicedAmount: true,
});

export const insertContactReferentSchema = createInsertSchema(contactReferents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOpportunityMilestoneSchema = createInsertSchema(opportunityMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReminderSchema = createInsertSchema(reminders).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

// ============ TYPES ============

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;

export type ContactReferent = typeof contactReferents.$inferSelect;
export type InsertContactReferent = z.infer<typeof insertContactReferentSchema>;

export type OpportunityMilestone = typeof opportunityMilestones.$inferSelect;
export type InsertOpportunityMilestone = z.infer<typeof insertOpportunityMilestoneSchema>;

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;

export type AppNotification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
