-- Migration to support traditional Email/Username + Password authentication

-- Add email and password_hash columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Allow oauth_provider and oauth_id to be NULL since email/password users won't have them
ALTER TABLE users ALTER COLUMN oauth_provider DROP NOT NULL;
ALTER TABLE users ALTER COLUMN oauth_id DROP NOT NULL;
