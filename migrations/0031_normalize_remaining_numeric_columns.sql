-- Remove fixed precision/scale from all remaining numeric columns across the schema.
-- Follows the same pattern established in migrations 0028–0030 for quote_items.
-- Step 1: ALTER each column to plain numeric (removes the storage constraint).
-- Step 2: UPDATE existing rows to strip trailing zeros from stored text representations.

-- ── opportunities ─────────────────────────────────────────────────────────────
ALTER TABLE opportunities
  ALTER COLUMN value          TYPE numeric USING value::numeric,
  ALTER COLUMN site_latitude  TYPE numeric USING site_latitude::numeric,
  ALTER COLUMN site_longitude TYPE numeric USING site_longitude::numeric;

UPDATE opportunities
SET
  value = CASE
    WHEN value IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM value::text))::numeric
  END,
  site_latitude = CASE
    WHEN site_latitude IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM site_latitude::text))::numeric
  END,
  site_longitude = CASE
    WHEN site_longitude IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM site_longitude::text))::numeric
  END;

-- ── articles ──────────────────────────────────────────────────────────────────
ALTER TABLE articles
  ALTER COLUMN base_price              TYPE numeric USING base_price::numeric,
  ALTER COLUMN warehouse_cost_per_unit TYPE numeric USING warehouse_cost_per_unit::numeric;

UPDATE articles
SET
  base_price = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM base_price::text))::numeric,
  warehouse_cost_per_unit = CASE
    WHEN warehouse_cost_per_unit IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM warehouse_cost_per_unit::text))::numeric
  END;

-- ── quotes ────────────────────────────────────────────────────────────────────
ALTER TABLE quotes
  ALTER COLUMN total_amount TYPE numeric USING total_amount::numeric;

UPDATE quotes
SET
  total_amount = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM total_amount::text))::numeric;

-- ── quote_items (unit_price_applied and total_row — the others were done in 0028–0030) ──
ALTER TABLE quote_items
  ALTER COLUMN unit_price_applied TYPE numeric USING unit_price_applied::numeric,
  ALTER COLUMN total_row          TYPE numeric USING total_row::numeric;

UPDATE quote_items
SET
  unit_price_applied = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM unit_price_applied::text))::numeric,
  total_row          = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM total_row::text))::numeric;

-- ── warehouse_balances ────────────────────────────────────────────────────────
ALTER TABLE warehouse_balances
  ALTER COLUMN value TYPE numeric USING value::numeric;

UPDATE warehouse_balances
SET
  value = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM value::text))::numeric;

-- ── sales_targets ─────────────────────────────────────────────────────────────
ALTER TABLE sales_targets
  ALTER COLUMN quote_target TYPE numeric USING quote_target::numeric,
  ALTER COLUMN won_target   TYPE numeric USING won_target::numeric;

UPDATE sales_targets
SET
  quote_target = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM quote_target::text))::numeric,
  won_target   = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM won_target::text))::numeric;

-- ── sal_voci ──────────────────────────────────────────────────────────────────
ALTER TABLE sal_voci
  ALTER COLUMN quantity        TYPE numeric USING quantity::numeric,
  ALTER COLUMN unit_price      TYPE numeric USING unit_price::numeric,
  ALTER COLUMN discount_percent TYPE numeric USING discount_percent::numeric,
  ALTER COLUMN total           TYPE numeric USING total::numeric;

UPDATE sal_voci
SET
  quantity         = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM quantity::text))::numeric,
  unit_price       = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM unit_price::text))::numeric,
  discount_percent = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM discount_percent::text))::numeric,
  total            = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM total::text))::numeric;

-- ── materials ─────────────────────────────────────────────────────────────────
ALTER TABLE materials
  ALTER COLUMN density              TYPE numeric USING density::numeric,
  ALTER COLUMN single_cost_per_kg   TYPE numeric USING single_cost_per_kg::numeric,
  ALTER COLUMN single_margin_percent TYPE numeric USING single_margin_percent::numeric;

UPDATE materials
SET
  density               = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM density::text))::numeric,
  single_cost_per_kg    = CASE
    WHEN single_cost_per_kg IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM single_cost_per_kg::text))::numeric
  END,
  single_margin_percent = CASE
    WHEN single_margin_percent IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM single_margin_percent::text))::numeric
  END;

-- ── material_thicknesses ──────────────────────────────────────────────────────
ALTER TABLE material_thicknesses
  ALTER COLUMN thickness_mm  TYPE numeric USING thickness_mm::numeric,
  ALTER COLUMN cost_per_kg   TYPE numeric USING cost_per_kg::numeric,
  ALTER COLUMN margin_percent TYPE numeric USING margin_percent::numeric;

UPDATE material_thicknesses
SET
  thickness_mm  = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM thickness_mm::text))::numeric,
  cost_per_kg   = CASE
    WHEN cost_per_kg IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM cost_per_kg::text))::numeric
  END,
  margin_percent = CASE
    WHEN margin_percent IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM margin_percent::text))::numeric
  END;

-- ── catalog_articles ──────────────────────────────────────────────────────────
ALTER TABLE catalog_articles
  ALTER COLUMN unit_cost     TYPE numeric USING unit_cost::numeric,
  ALTER COLUMN margin_percent TYPE numeric USING margin_percent::numeric;

UPDATE catalog_articles
SET
  unit_cost      = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM unit_cost::text))::numeric,
  margin_percent = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM margin_percent::text))::numeric;

-- ── labor_rates ───────────────────────────────────────────────────────────────
ALTER TABLE labor_rates
  ALTER COLUMN cost_per_day  TYPE numeric USING cost_per_day::numeric,
  ALTER COLUMN margin_percent TYPE numeric USING margin_percent::numeric;

UPDATE labor_rates
SET
  cost_per_day   = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM cost_per_day::text))::numeric,
  margin_percent = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM margin_percent::text))::numeric;
