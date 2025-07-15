-- Add reset token fields to employees table
ALTER TABLE employees
ADD COLUMN reset_token VARCHAR(255),
ADD COLUMN reset_token_expires TIMESTAMP;