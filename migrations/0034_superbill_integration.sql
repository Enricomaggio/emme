-- Integrazione Superbill: campi su quotes e leads
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS superbill_document_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS superbill_sent_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS superbill_client_id TEXT;
