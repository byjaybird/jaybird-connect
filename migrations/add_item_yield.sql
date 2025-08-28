-- Migration: add_item_yield.sql
-- Adds yield quantity and unit fields to the items table so items can express a production/service yield (e.g. "40 each", "1 liter", "1 serving").

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS yield_qty numeric,
    ADD COLUMN IF NOT EXISTS yield_unit text;

-- No default is set so existing rows remain NULL; application should treat NULL as unknown.
