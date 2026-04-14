-- Migration: Add 'pro' role to the user role system.
--
-- The 'role' column is VARCHAR(20) with no CHECK constraint, so new role values
-- are supported without schema changes. This migration serves as documentation.
--
-- Role hierarchy:
--   user  — Default. Basic features only.
--   pro   — Premium member. Access to AI assistant and future premium features.
--   admin — Full administrative privileges (superset of pro).
--
-- To promote a user to Pro via CLI:
--   catheadtab user set-role
--   → enter username/email → enter "pro"

-- No-op: role column already accepts any VARCHAR(20) value.
SELECT 1;
