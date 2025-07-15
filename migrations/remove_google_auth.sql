-- Remove Google Auth related columns
ALTER TABLE employees
DROP COLUMN IF EXISTS google_sub;