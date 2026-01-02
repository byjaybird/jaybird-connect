-- Improve performance for margin dashboard queries over sales_daily_lines
CREATE INDEX IF NOT EXISTS idx_sales_daily_lines_business_date ON sales_daily_lines (business_date);
CREATE INDEX IF NOT EXISTS idx_sales_daily_lines_item_id ON sales_daily_lines (item_id);
