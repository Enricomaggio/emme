-- Remove fixed scale from quantity and development_mm on quote_items.
-- Step 1: Change column types from numeric(12,N) to unscaled numeric so
--         future inserts are stored without forced trailing zeros.
-- Step 2: Re-save existing rows stripping any trailing zeros already stored
--         (e.g. "50.0000" → "50", "1.5000" → "1.5").
-- Applies to all item types (LATTONERIA, ARTICOLO, GIORNATE, MANUALE, legacy).
-- Monetary/cost snapshot columns (unit_cost, weight_kg, etc.) are left untouched.

ALTER TABLE quote_items
  ALTER COLUMN quantity       TYPE numeric USING quantity::numeric,
  ALTER COLUMN development_mm TYPE numeric USING development_mm::numeric;

-- Normalise all rows: strip trailing zeros from quantity (all types)
-- and from development_mm where it is not NULL.
UPDATE quote_items
SET
  quantity = TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM quantity::text))::numeric,
  development_mm = CASE
    WHEN development_mm IS NULL THEN NULL
    ELSE TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM development_mm::text))::numeric
  END;
