-- Migration: remap merged ingredient ID 189 -> 151 in recipes
-- Run this against the production DB after taking a backup.
BEGIN;

-- Inspect which rows will be affected
SELECT * FROM recipes WHERE source_type = 'ingredient' AND source_id = 189 LIMIT 100;
SELECT COUNT(*) AS will_update FROM recipes WHERE source_type = 'ingredient' AND source_id = 189;

-- Update recipe rows to point to the new merged ingredient id
UPDATE recipes
SET source_id = 151
WHERE source_type = 'ingredient' AND source_id = 189;

-- Verify results
SELECT COUNT(*) AS now_189 FROM recipes WHERE source_type = 'ingredient' AND source_id = 189;
SELECT COUNT(*) AS now_151 FROM recipes WHERE source_type = 'ingredient' AND source_id = 151;

COMMIT;

-- If you prefer to DELETE instead of remapping, run:
-- DELETE FROM recipes WHERE source_type='ingredient' AND source_id = 189;
