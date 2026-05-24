import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function bootstrapDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE opportunities o
      SET won_at = o.updated_at
      FROM pipeline_stages ps
      WHERE o.stage_id = ps.id
        AND ps.name = 'Vinto'
        AND o.won_at IS NULL;
    `);
    await client.query(`
      UPDATE opportunities o
      SET lost_at = o.updated_at
      FROM pipeline_stages ps
      WHERE o.stage_id = ps.id
        AND ps.name = 'Perso'
        AND o.lost_at IS NULL;
    `);

    await client.query(`
      ALTER TABLE opportunities
        ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS quote_reminder_snoozed_until TIMESTAMP;
    `);

    await client.query(`
      UPDATE opportunities o
      SET quote_sent_at = o.updated_at
      FROM pipeline_stages ps
      WHERE o.stage_id = ps.id
        AND ps.name = 'Preventivo Inviato'
        AND o.quote_sent_at IS NULL;
    `);

    // Migration 0002: brochure_sent on leads
    await client.query(`
      ALTER TABLE "leads"
        ADD COLUMN IF NOT EXISTS "brochure_sent" boolean DEFAULT false;
    `);

    // Migration 0003: is_automatic on reminders
    await client.query(`
      ALTER TABLE "reminders"
        ADD COLUMN IF NOT EXISTS "is_automatic" boolean NOT NULL DEFAULT false;
    `);

    // Migration 0004: unique constraint on quotes (company_id, number)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'quotes_company_id_number_unique'
            AND conrelid = 'quotes'::regclass
        ) THEN
          BEGIN
            ALTER TABLE quotes
              ADD CONSTRAINT quotes_company_id_number_unique UNIQUE (company_id, number);
          EXCEPTION
            WHEN unique_violation THEN
              NULL;
          END;
        END IF;
      END
      $$;
    `);


    // Migration 0018: photo notification scheduling fields on opportunities
    await client.query(`
      ALTER TABLE opportunities
        ADD COLUMN IF NOT EXISTS photo_notification_scheduled_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS photo_notification_sent_at TIMESTAMP;
    `);

    // Migration 0025: Catalogo Lattoneria — sostituisce raw_materials e products con
    // materials, material_thicknesses, catalog_articles, labor_rates.
    // Drop old catalog tables (products dipende da raw_materials, droppare prima products).
    await client.query(`DROP TABLE IF EXISTS products CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS raw_materials CASCADE;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS materials (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        density NUMERIC(12, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS material_thicknesses (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        material_id VARCHAR NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        thickness_mm NUMERIC(8, 3) NOT NULL,
        cost_per_kg NUMERIC(12, 4) NOT NULL DEFAULT 0,
        margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS material_thicknesses_material_id_idx ON material_thicknesses (material_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_articles (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0,
        margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
        unit_of_measure TEXT NOT NULL DEFAULT 'pz',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS labor_rates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        cost_per_day NUMERIC(12, 2) NOT NULL DEFAULT 0,
        margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Migration 0026: Preventivatore Lattoneria — colonne nuove su quotes/quote_items
    await client.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS subject TEXT,
        ADD COLUMN IF NOT EXISTS notes TEXT;
    `);
    await client.query(`
      ALTER TABLE quotes
        ALTER COLUMN global_params DROP NOT NULL;
    `);
    await client.query(`
      ALTER TABLE quote_items
        ALTER COLUMN article_id DROP NOT NULL;
    `);
    // Rinomina development_mm → development_cm (idempotente). Lo sviluppo è
    // sempre stato inserito in cm dalla UI; solo il nome della colonna era
    // disallineato. Il valore non viene trasformato.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'quote_items' AND column_name = 'development_mm'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'quote_items' AND column_name = 'development_cm'
        ) THEN
          ALTER TABLE quote_items RENAME COLUMN development_mm TO development_cm;
        END IF;
      END
      $$;
    `);
    await client.query(`
      ALTER TABLE quote_items
        ADD COLUMN IF NOT EXISTS type TEXT,
        ADD COLUMN IF NOT EXISTS material_id VARCHAR REFERENCES materials(id),
        ADD COLUMN IF NOT EXISTS material_thickness_id VARCHAR REFERENCES material_thicknesses(id),
        ADD COLUMN IF NOT EXISTS catalog_article_id VARCHAR REFERENCES catalog_articles(id),
        ADD COLUMN IF NOT EXISTS labor_rate_id VARCHAR REFERENCES labor_rates(id),
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS unit_of_measure TEXT,
        ADD COLUMN IF NOT EXISTS development_cm NUMERIC(12, 3),
        ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12, 4),
        ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 4),
        ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS quote_items_type_idx ON quote_items (type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS quote_items_display_order_idx ON quote_items (display_order);
    `);

    // Migration 0027: colonne nota lavori su quotes e quote_items
    await client.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS work_order_notes TEXT,
        ADD COLUMN IF NOT EXISTS work_order_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS work_order_confirmed_at TIMESTAMP;
    `);
    await client.query(`
      ALTER TABLE quote_items
        ADD COLUMN IF NOT EXISTS work_order_quantity_override NUMERIC;
    `);

    // Migration 0028: stadi pipeline post-vendita (Cantiere in corso, Nota Lavori, Da Fatturare)
    await client.query(`
      INSERT INTO pipeline_stages (id, name, "order", color, company_id, created_at)
      SELECT gen_random_uuid(), 'Cantiere in corso', 7, '#F97316', c.id, NOW()
      FROM companies c
      WHERE NOT EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.company_id = c.id AND ps.name = 'Cantiere in corso'
      );
    `);
    await client.query(`
      INSERT INTO pipeline_stages (id, name, "order", color, company_id, created_at)
      SELECT gen_random_uuid(), 'Nota Lavori da Inviare', 8, '#6366F1', c.id, NOW()
      FROM companies c
      WHERE NOT EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.company_id = c.id AND ps.name = 'Nota Lavori da Inviare'
      );
    `);
    await client.query(`
      INSERT INTO pipeline_stages (id, name, "order", color, company_id, created_at)
      SELECT gen_random_uuid(), 'Nota Lavori Inviata', 9, '#8B5CF6', c.id, NOW()
      FROM companies c
      WHERE NOT EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.company_id = c.id AND ps.name = 'Nota Lavori Inviata'
      );
    `);
    await client.query(`
      INSERT INTO pipeline_stages (id, name, "order", color, company_id, created_at)
      SELECT gen_random_uuid(), 'Da Fatturare', 10, '#059669', c.id, NOW()
      FROM companies c
      WHERE NOT EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.company_id = c.id AND ps.name = 'Da Fatturare'
      );
    `);

    // Migration 0029: tabelle dedicate nota lavori (work_orders, work_order_items)
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_orders (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR NOT NULL REFERENCES companies(id),
        opportunity_id VARCHAR NOT NULL REFERENCES opportunities(id),
        quote_id VARCHAR REFERENCES quotes(id),
        number TEXT NOT NULL,
        subject TEXT,
        notes TEXT,
        total_amount NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        sent_at TIMESTAMP,
        confirmed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS work_orders_company_id_idx ON work_orders(company_id);
      CREATE INDEX IF NOT EXISTS work_orders_opportunity_id_idx ON work_orders(opportunity_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_order_items (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        work_order_id VARCHAR NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        description TEXT NOT NULL DEFAULT '',
        unit_of_measure TEXT NOT NULL DEFAULT 'ml',
        quantity NUMERIC NOT NULL DEFAULT 0,
        unit_price NUMERIC NOT NULL DEFAULT 0,
        total_row NUMERIC NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS work_order_items_work_order_id_idx ON work_order_items(work_order_id);
    `);
  } finally {
    client.release();
  }
}
