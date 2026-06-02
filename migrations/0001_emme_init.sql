-- EMME gestionale init schema.
-- Lo stesso schema viene applicato in modo idempotente da `bootstrapDatabase()`
-- in server/db.ts all'avvio dell'app. Questo file esiste come baseline per
-- `drizzle-kit push` e per documentazione.

CREATE TABLE IF NOT EXISTS "users" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR UNIQUE NOT NULL,
  "password" VARCHAR NOT NULL,
  "first_name" VARCHAR NOT NULL,
  "last_name" VARCHAR NOT NULL,
  "profile_image_url" VARCHAR,
  "profile_image_data" TEXT,
  "role" VARCHAR NOT NULL DEFAULT 'ADMIN',
  "status" VARCHAR NOT NULL DEFAULT 'ACTIVE',
  "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP,
  "display_name" VARCHAR,
  "contact_email" VARCHAR,
  "phone" VARCHAR,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" VARCHAR PRIMARY KEY,
  "sess" JSONB NOT NULL,
  "expire" TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");

CREATE TABLE IF NOT EXISTS "pipeline_stages" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL UNIQUE,
  "order" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT NOT NULL DEFAULT '#4563FF',
  "created_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "pipeline_stages_order_idx" ON "pipeline_stages" ("order");

CREATE TABLE IF NOT EXISTS "leads" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type" TEXT NOT NULL DEFAULT 'COMPANY',
  "type" TEXT NOT NULL DEFAULT 'lead',
  "name" TEXT,
  "first_name" TEXT,
  "last_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "zip_code" TEXT,
  "province" TEXT,
  "country" TEXT DEFAULT 'Italia',
  "vat_number" TEXT,
  "fiscal_code" TEXT,
  "sdi_code" TEXT,
  "pec_email" TEXT,
  "source" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "leads_type_idx" ON "leads" ("type");
CREATE INDEX IF NOT EXISTS "leads_entity_type_idx" ON "leads" ("entity_type");

CREATE TABLE IF NOT EXISTS "contact_referents" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "first_name" TEXT,
  "last_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "role" TEXT,
  "contact_id" VARCHAR NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "contact_referents_contact_id_idx" ON "contact_referents" ("contact_id");

CREATE TABLE IF NOT EXISTS "opportunities" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "value" NUMERIC,
  "contract_total" NUMERIC,
  "invoiced_amount" NUMERIC NOT NULL DEFAULT 0,
  "stage_id" VARCHAR REFERENCES "pipeline_stages"("id"),
  "lead_id" VARCHAR NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "referent_id" VARCHAR REFERENCES "contact_referents"("id") ON DELETE SET NULL,
  "lost_reason" TEXT,
  "estimated_start_date" TIMESTAMP,
  "estimated_end_date" TIMESTAMP,
  "expected_close_date" TIMESTAMP,
  "probability" INTEGER DEFAULT 50,
  "won_at" TIMESTAMP,
  "lost_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "opportunities_lead_id_idx" ON "opportunities" ("lead_id");
CREATE INDEX IF NOT EXISTS "opportunities_stage_id_idx" ON "opportunities" ("stage_id");
CREATE INDEX IF NOT EXISTS "opportunities_referent_id_idx" ON "opportunities" ("referent_id");

CREATE TABLE IF NOT EXISTS "opportunity_milestones" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "opportunity_id" VARCHAR NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
  "amount" NUMERIC(10, 2) NOT NULL,
  "invoice_date" TIMESTAMP,
  "payment_date" TIMESTAMP,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "opportunity_milestones_opportunity_id_idx" ON "opportunity_milestones" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "opportunity_milestones_status_idx" ON "opportunity_milestones" ("status");
CREATE INDEX IF NOT EXISTS "opportunity_milestones_invoice_date_idx" ON "opportunity_milestones" ("invoice_date");
CREATE INDEX IF NOT EXISTS "opportunity_milestones_payment_date_idx" ON "opportunity_milestones" ("payment_date");

CREATE TABLE IF NOT EXISTS "reminders" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "due_date" TIMESTAMP NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "completed_at" TIMESTAMP,
  "lead_id" VARCHAR REFERENCES "leads"("id") ON DELETE CASCADE,
  "opportunity_id" VARCHAR REFERENCES "opportunities"("id") ON DELETE CASCADE,
  "is_automatic" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "reminders_due_date_idx" ON "reminders" ("due_date");
CREATE INDEX IF NOT EXISTS "reminders_lead_id_idx" ON "reminders" ("lead_id");
CREATE INDEX IF NOT EXISTS "reminders_opportunity_id_idx" ON "reminders" ("opportunity_id");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications" ("is_read");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" VARCHAR UNIQUE NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "used_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "password_reset_tokens_token_idx" ON "password_reset_tokens" ("token");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens" ("user_id");
