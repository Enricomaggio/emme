-- Add per-row discount and total override fields to quote_items
-- discountPercent: percentage discount (0 = none), applied to computed base total
-- overrideTotal: if set, used directly as totalRow (takes precedence over discountPercent)
-- baseTotal: snapshot of the calculated total before any discount/override

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS override_total numeric,
  ADD COLUMN IF NOT EXISTS base_total numeric;
