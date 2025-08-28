-- Migration: add cost column to items
-- Adds a numeric column `cost` to store computed cost per unit (matching yield_unit)

ALTER TABLE items
ADD COLUMN IF NOT EXISTS cost numeric(12,4);

-- You may want to backfill existing items by running a server-side recalculation after applying this migration.
