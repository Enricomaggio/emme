-- Aggiunge campo testo disclaimer per le Nota Lavori
ALTER TABLE companies ADD COLUMN IF NOT EXISTS work_order_disclaimer_text text;
