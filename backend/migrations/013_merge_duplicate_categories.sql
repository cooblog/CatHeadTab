-- 013: Merge duplicate preset categories (Gaming, Reading)
--
-- Problem: Migration 008 created b-series categories including:
--   b0000000-...-000000000005  Gaming  (2 sites)
--   b0000000-...-000000000015  Reading (2 sites)
-- Migration 011 created c-series categories with the same names:
--   c0000000-...-000000000050  Gaming  (90+ sites)
--   c0000000-...-000000000049  Reading (50+ sites)
-- This results in duplicate categories shown in the UI.
--
-- Solution: Move unique sites from old (b-series) to new (c-series),
--           remove URL-duplicate sites, then delete old categories.

-- Step 1: Remove the old "微信读书" from b-series Reading because
-- the c-series Reading already has the same site (URL differs only by trailing slash).
DELETE FROM preset_sites
WHERE category_id = 'b0000000-0000-0000-0000-000000000015'
  AND url = 'https://weread.qq.com/';

-- Step 2: Migrate remaining unique sites from old Gaming to new Gaming.
-- Temporarily drop the global URL unique index to allow re-pointing category_id.
-- (The per-category unique index category_id+url won't conflict because these URLs
-- don't exist under the new category_id.)
UPDATE preset_sites
SET category_id = 'c0000000-0000-0000-0000-000000000050',
    sort_order = sort_order + 1000  -- push to end so they don't collide
WHERE category_id = 'b0000000-0000-0000-0000-000000000005';

-- Step 3: Migrate remaining unique sites from old Reading to new Reading.
UPDATE preset_sites
SET category_id = 'c0000000-0000-0000-0000-000000000049',
    sort_order = sort_order + 1000
WHERE category_id = 'b0000000-0000-0000-0000-000000000015';

-- Step 4: Delete the now-empty old categories.
DELETE FROM preset_categories WHERE id = 'b0000000-0000-0000-0000-000000000005';
DELETE FROM preset_categories WHERE id = 'b0000000-0000-0000-0000-000000000015';
