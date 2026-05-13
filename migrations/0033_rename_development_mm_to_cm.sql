-- Rinomina quote_items.development_mm → quote_items.development_cm.
-- Lo sviluppo è sempre stato inserito in centimetri dalla UI; solo il nome
-- della colonna (e parte del codice) era disallineato. Nessuna trasformazione
-- dei valori esistenti — è solo un rename. Idempotente.

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
