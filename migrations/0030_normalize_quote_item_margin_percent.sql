-- Remove fixed scale from margin_percent on quote_items.
-- Step 1: Change column type from numeric(6,2) to unscaled numeric so
--         future inserts are stored without forced trailing zeros.
-- Step 2: Re-save existing rows stripping any trailing zeros already stored
--         (e.g. "15.00" → "15", "12.50" → "12.5").
-- Mirrors the same fix applied to weight_kg and unit_cost in migration 0029.

ALTER TABLE quote_items
  ALTER COLUMN margin_percent TYPE numeric USING margin_percent::numeric;

-- Normalise all rows: strip trailing zeros from margin_percent (where not NULL).
UPDATE quote_items
SET
  margin_percent = CASE
    WHEN margin_percent IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM margin_percent::text))::numeric
  END;
