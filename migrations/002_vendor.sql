-- Add vendor + category classification columns to spans + a rolled-up
-- vendor_count on traces. Idempotent; safe to re-run.

ALTER TABLE spans ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS idx_spans_vendor ON spans(vendor) WHERE vendor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spans_category ON spans(category) WHERE category IS NOT NULL;

ALTER TABLE traces ADD COLUMN IF NOT EXISTS vendor_count INTEGER DEFAULT 0;
ALTER TABLE traces ADD COLUMN IF NOT EXISTS top_vendors JSONB DEFAULT '[]'::jsonb;
