-- Create a simple table to store role permissions as JSONB
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  permissions JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default row if not exists
INSERT INTO role_permissions (name, permissions)
VALUES ('default', '{}')
ON CONFLICT (name) DO NOTHING;
