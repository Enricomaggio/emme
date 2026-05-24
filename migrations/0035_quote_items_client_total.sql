ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS is_internal_only boolean NOT NULL DEFAULT false;
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS client_total numeric(10,2);
