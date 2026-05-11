-- Add PDF & email-template related fields on companies for the quote PDF feature
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS pec_email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS rea text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_holder text,
  ADD COLUMN IF NOT EXISTS bank_swift text,
  ADD COLUMN IF NOT EXISTS quote_payment_terms text,
  ADD COLUMN IF NOT EXISTS quote_validity_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS quote_footer_notes text,
  ADD COLUMN IF NOT EXISTS email_subject_template text,
  ADD COLUMN IF NOT EXISTS email_body_template text;

-- Sensible defaults limited to the GDM tenant only (matched by name).
-- Other tenants keep NULL templates so they can configure their own from Settings.
UPDATE companies
SET
  quote_validity_days = COALESCE(quote_validity_days, 30),
  quote_payment_terms = COALESCE(quote_payment_terms, 'Bonifico bancario a 30 gg fine mese'),
  email_subject_template = COALESCE(email_subject_template, 'Preventivo {numero} — GDM Lattonerie'),
  email_body_template = COALESCE(
    email_body_template,
    E'Buongiorno,\n\nin allegato trovate il preventivo {numero} per {oggetto}.\n\nRimaniamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti,\nGDM Lattonerie s.r.l.'
  )
WHERE name ILIKE '%GDM%';
