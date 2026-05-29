-- Aggiunge template email (oggetto + corpo) per le Nota Lavori
ALTER TABLE companies ADD COLUMN IF NOT EXISTS work_order_email_subject_template text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS work_order_email_body_template text;
