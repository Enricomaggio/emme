-- Catalogo v2: Prezzo unico o per variante sui materiali, Famiglie articoli

-- Materiali: modalità prezzo
-- Default PER_VARIANT per retrocompatibilità (materiali esistenti avevano prezzo per spessore)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS price_mode text NOT NULL DEFAULT 'PER_VARIANT',
  ADD COLUMN IF NOT EXISTS single_cost_per_kg numeric(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS single_margin_percent numeric(6,2) DEFAULT 0;

-- Backfill: materiali esistenti mantengono prezzo per variante
-- (nuovi materiali creati dall'app useranno SINGLE come default nell'interfaccia)
UPDATE materials SET price_mode = 'PER_VARIANT' WHERE price_mode IS NULL OR price_mode = 'SINGLE';

-- Varianti materiale: finitura e costo/margine nullable (usati solo in PER_VARIANT)
ALTER TABLE material_thicknesses
  ADD COLUMN IF NOT EXISTS finish text;
ALTER TABLE material_thicknesses
  ALTER COLUMN cost_per_kg DROP NOT NULL,
  ALTER COLUMN margin_percent DROP NOT NULL;

-- Famiglie articoli
CREATE TABLE IF NOT EXISTS article_families (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit_of_measure text NOT NULL DEFAULT 'mt',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Articoli: collegamento a famiglia e note aggiuntive
ALTER TABLE catalog_articles
  ADD COLUMN IF NOT EXISTS family_id varchar REFERENCES article_families(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notes text;

-- Migrazione articoli esistenti verso struttura a 2 livelli:
-- per ogni articolo senza famiglia, crea una famiglia omonima e collegalo
DO $$
DECLARE art RECORD; new_fam_id varchar;
BEGIN
  FOR art IN SELECT * FROM catalog_articles WHERE family_id IS NULL LOOP
    INSERT INTO article_families (name, unit_of_measure)
    VALUES (art.name, COALESCE(art.unit_of_measure, 'pz'))
    RETURNING id INTO new_fam_id;
    UPDATE catalog_articles SET family_id = new_fam_id, name = 'Standard' WHERE id = art.id;
  END LOOP;
END $$;
