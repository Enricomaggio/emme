-- Aggiunge le famiglie articoli "Copertura" (m²) e "Converse" (pz) al catalogo lattoneria.
-- Idempotente: usa NOT EXISTS per evitare duplicati su esecuzioni ripetute.

-- Nuova famiglia: Copertura (venduto a metro quadro)
INSERT INTO article_families (name, unit_of_measure, created_at, updated_at)
SELECT 'Copertura', 'm²', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM article_families WHERE name = 'Copertura');

-- Nuova famiglia: Converse (venduto a pezzo — spostato dai prodotti LATTONERIA)
INSERT INTO article_families (name, unit_of_measure, created_at, updated_at)
SELECT 'Converse', 'pz', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM article_families WHERE name = 'Converse');
