import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import * as schema from "@shared/schema";
import { PIPELINE_STAGES_FIXED } from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Tabelle obsolete da rimuovere se presenti (eredità GDM Lattonerie)
const OBSOLETE_TABLES = [
  "work_order_items",
  "work_orders",
  "quote_items",
  "quotes",
  "articles",
  "material_finishes",
  "material_thicknesses",
  "materials",
  "catalog_articles",
  "article_families",
  "labor_rates",
  "products",
  "raw_materials",
  "external_engineers",
  "payment_methods",
  "lead_sources",
  "sales_targets",
  "activity_logs",
  "creditsafe_reports",
  "invites",
  "user_companies",
  "companies",
  "notification_preferences",
];

const OBSOLETE_LEAD_COLUMNS = [
  "company_id",
  "assigned_to_user_id",
  "company_nature",
  "ipa_code",
  "payment_method_id",
  "reliability",
  "brochure_sent",
  "superbill_client_id",
];

const OBSOLETE_OPPORTUNITY_COLUMNS = [
  "company_id",
  "assigned_to_user_id",
  "site_address",
  "site_city",
  "site_zip",
  "site_province",
  "maps_link",
  "site_distance_km",
  "site_squadra_in_zona_km",
  "venice_zone",
  "site_latitude",
  "site_longitude",
  "site_quality",
  "sopralluogo_fatto",
  "site_status",
  "quote_sent_at",
  "quote_reminder_snoozed_until",
  "photo_notification_scheduled_at",
  "photo_notification_sent_at",
];

const OBSOLETE_PIPELINE_COLUMNS = ["company_id"];
const OBSOLETE_REMINDER_COLUMNS = ["company_id", "user_id"];
const OBSOLETE_NOTIFICATION_COLUMNS = ["company_id", "user_id"];

export async function bootstrapDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1) Drop tabelle obsolete eredità GDM
    for (const t of OBSOLETE_TABLES) {
      await client.query(`DROP TABLE IF EXISTS "${t}" CASCADE;`);
    }

    // 2) Create tabelle EMME (idempotente)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR UNIQUE NOT NULL,
        password VARCHAR NOT NULL,
        first_name VARCHAR NOT NULL,
        last_name VARCHAR NOT NULL,
        profile_image_url VARCHAR,
        profile_image_data TEXT,
        role VARCHAR NOT NULL DEFAULT 'ADMIN',
        status VARCHAR NOT NULL DEFAULT 'ACTIVE',
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        display_name VARCHAR,
        contact_email VARCHAR,
        phone VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        "order" INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL DEFAULT '#4563FF',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS pipeline_stages_order_idx ON pipeline_stages ("order");
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type TEXT NOT NULL DEFAULT 'COMPANY',
        type TEXT NOT NULL DEFAULT 'lead',
        name TEXT,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        zip_code TEXT,
        province TEXT,
        country TEXT DEFAULT 'Italia',
        vat_number TEXT,
        fiscal_code TEXT,
        sdi_code TEXT,
        pec_email TEXT,
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS leads_type_idx ON leads (type);
      CREATE INDEX IF NOT EXISTS leads_entity_type_idx ON leads (entity_type);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_referents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        role TEXT,
        contact_id VARCHAR NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS contact_referents_contact_id_idx ON contact_referents (contact_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        value NUMERIC,
        contract_total NUMERIC,
        invoiced_amount NUMERIC NOT NULL DEFAULT 0,
        stage_id VARCHAR REFERENCES pipeline_stages(id),
        lead_id VARCHAR NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        referent_id VARCHAR REFERENCES contact_referents(id) ON DELETE SET NULL,
        lost_reason TEXT,
        estimated_start_date TIMESTAMP,
        estimated_end_date TIMESTAMP,
        expected_close_date TIMESTAMP,
        probability INTEGER DEFAULT 50,
        won_at TIMESTAMP,
        lost_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS opportunities_lead_id_idx ON opportunities (lead_id);
      CREATE INDEX IF NOT EXISTS opportunities_stage_id_idx ON opportunities (stage_id);
      CREATE INDEX IF NOT EXISTS opportunities_referent_id_idx ON opportunities (referent_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunity_milestones (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        opportunity_id VARCHAR NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        invoice_date TIMESTAMP,
        payment_date TIMESTAMP,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS opportunity_milestones_opportunity_id_idx ON opportunity_milestones (opportunity_id);
      CREATE INDEX IF NOT EXISTS opportunity_milestones_status_idx ON opportunity_milestones (status);
      CREATE INDEX IF NOT EXISTS opportunity_milestones_invoice_date_idx ON opportunity_milestones (invoice_date);
      CREATE INDEX IF NOT EXISTS opportunity_milestones_payment_date_idx ON opportunity_milestones (payment_date);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        due_date TIMESTAMP NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT false,
        completed_at TIMESTAMP,
        lead_id VARCHAR REFERENCES leads(id) ON DELETE CASCADE,
        opportunity_id VARCHAR REFERENCES opportunities(id) ON DELETE CASCADE,
        is_automatic BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS reminders_due_date_idx ON reminders (due_date);
      CREATE INDEX IF NOT EXISTS reminders_lead_id_idx ON reminders (lead_id);
      CREATE INDEX IF NOT EXISTS reminders_opportunity_id_idx ON reminders (opportunity_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications (is_read);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens (token);
      CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
    `);

    // 3) Drop colonne obsolete su tabelle ereditate da GDM (idempotente)
    for (const col of OBSOLETE_LEAD_COLUMNS) {
      await client.query(`ALTER TABLE leads DROP COLUMN IF EXISTS "${col}";`);
    }
    for (const col of OBSOLETE_OPPORTUNITY_COLUMNS) {
      await client.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS "${col}";`);
    }
    for (const col of OBSOLETE_PIPELINE_COLUMNS) {
      await client.query(`ALTER TABLE pipeline_stages DROP COLUMN IF EXISTS "${col}";`);
    }
    for (const col of OBSOLETE_REMINDER_COLUMNS) {
      await client.query(`ALTER TABLE reminders DROP COLUMN IF EXISTS "${col}";`);
    }
    for (const col of OBSOLETE_NOTIFICATION_COLUMNS) {
      await client.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS "${col}";`);
    }

    // 4) Vincolo unique sulla colonna name di pipeline_stages
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'pipeline_stages_name_unique'
        ) THEN
          BEGIN
            ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_name_unique UNIQUE (name);
          EXCEPTION WHEN unique_violation THEN
            NULL;
          END;
        END IF;
      END $$;
    `);

    // 4.5) Migrazione pipeline_stages EMME v2 (8 stadi)
    // Rinomina Lead → Nuova opportunità, Trattativa → Preventivo consegnato,
    // sposta opp da Preventivo inviato → Preventivo consegnato prima che il
    // DELETE del passo 5 elimini lo stadio orfano.
    await client.query(`
      UPDATE pipeline_stages SET name = 'Nuova opportunità'
      WHERE name = 'Lead'
        AND NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE name = 'Nuova opportunità');
    `);
    await client.query(`
      UPDATE pipeline_stages SET name = 'Preventivo consegnato'
      WHERE name = 'Trattativa'
        AND NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE name = 'Preventivo consegnato');
    `);
    await client.query(`
      UPDATE opportunities
      SET stage_id = (SELECT id FROM pipeline_stages WHERE name = 'Preventivo consegnato')
      WHERE stage_id = (SELECT id FROM pipeline_stages WHERE name = 'Preventivo inviato')
        AND EXISTS (SELECT 1 FROM pipeline_stages WHERE name = 'Preventivo consegnato');
    `);

    // 5) Seed pipeline_stages fissi
    for (const s of PIPELINE_STAGES_FIXED) {
      await client.query(
        `INSERT INTO pipeline_stages (name, "order", color)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET "order" = EXCLUDED."order", color = EXCLUDED.color;`,
        [s.name, s.order, s.color]
      );
    }
    // Allinea: rimuovi eventuali stadi vecchi GDM rimasti
    await client.query(
      `DELETE FROM pipeline_stages
       WHERE name NOT IN (${PIPELINE_STAGES_FIXED.map((_, i) => `$${i + 1}`).join(", ")});`,
      PIPELINE_STAGES_FIXED.map((s) => s.name)
    );

    // 6) Seed utente iniziale (Enrico) se nessun utente esiste
    const userCount = await client.query(`SELECT COUNT(*)::int AS n FROM users;`);
    if (userCount.rows[0].n === 0) {
      const email = process.env.INITIAL_USER_EMAIL || "enrico@emme.local";
      const plain = process.env.INITIAL_USER_PASSWORD || "ChangeMe2026!";
      const hash = await bcrypt.hash(plain, 10);
      await client.query(
        `INSERT INTO users (email, password, first_name, last_name, role, status)
         VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE');`,
        [email, hash, "Enrico", "Maggiolo"]
      );
      console.log(`[bootstrap] Utente iniziale creato: ${email} / ${plain} (cambia la password al primo login)`);
    }
  } finally {
    client.release();
  }
}
