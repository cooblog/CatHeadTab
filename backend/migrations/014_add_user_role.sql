-- Migration: Add role column to users table for role-based access control.
-- Default role is 'user' (regular user). Admin-created users via CLI
-- will be set to 'admin' at creation time.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Set existing CLI-created users (those with email_verified=true and no OAuth)
-- to admin role. This is a one-time migration heuristic; going forward the CLI
-- tool explicitly sets role='admin'.
-- NOTE: This is intentionally commented out — manually promote users if needed.
-- UPDATE users SET role = 'admin' WHERE email_verified = true AND oauth_provider IS NULL;
