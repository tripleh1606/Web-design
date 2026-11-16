-- Add the resource state used by the Week 8 ABAC rule without replacing dishes.
-- Existing records retain their assignments, availability and other business data.
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
