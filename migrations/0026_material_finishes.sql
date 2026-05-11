-- Catalogo v2b: 3° livello Finiture sotto gli spessori (Materiale → Spessore → Finitura)

CREATE TABLE IF NOT EXISTS material_finishes (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  thickness_id varchar NOT NULL REFERENCES material_thicknesses(id) ON DELETE CASCADE,
  name         text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_finishes_thickness_id_idx ON material_finishes(thickness_id);

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS material_finish_id varchar
  REFERENCES material_finishes(id) ON DELETE SET NULL;
