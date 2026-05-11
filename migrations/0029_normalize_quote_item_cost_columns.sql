-- Remove fixed scale from weight_kg and unit_cost on quote_items.
-- Step 1: Change column types from numeric(12,4) to unscaled numeric so
--         future inserts are stored without forced trailing zeros.
-- Step 2: Re-save existing rows stripping any trailing zeros already stored
--         (e.g. "1.2500" → "1.25", "150.0000" → "150").
-- Mirrors the same fix applied to quantity and development_mm in migration 0028.

ALTER TABLE quote_items
  ALTER COLUMN weight_kg  TYPE numeric USING weight_kg::numeric,
  ALTER COLUMN unit_cost  TYPE numeric USING unit_cost::numeric;

-- Normalise all rows: strip trailing zeros from weight_kg (where not NULL)
-- and from unit_cost (where not NULL).
UPDATE quote_items
SET
  weight_kg = CASE
    WHEN weight_kg IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM weight_kg::text))::numeric
  END,
  unit_cost = CASE
    WHEN unit_cost IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM unit_cost::text))::numeric
  END;
