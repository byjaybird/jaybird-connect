-- Add frequency field and change day_of_week to days_of_week array
ALTER TABLE task_patterns
    ADD COLUMN frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
    ADD COLUMN days_of_week INTEGER[] NOT NULL DEFAULT '{}',
    DROP COLUMN day_of_week;

-- Convert existing records to use the new array format
UPDATE task_patterns
SET days_of_week = ARRAY[day_of_week]
WHERE days_of_week = '{}';