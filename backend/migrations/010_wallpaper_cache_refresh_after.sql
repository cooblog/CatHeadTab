-- Change L2 cache from "expire & delete" to "stale & refresh" semantics.
-- Entries are never deleted; when refresh_after is reached the background job
-- fetches fresh data from upstream and updates in-place only if changed.

-- Rename the column to reflect its new meaning
ALTER TABLE wallpaper_cache RENAME COLUMN expires_at TO refresh_after;

-- Rename the index accordingly
ALTER INDEX idx_wallpaper_cache_expires_at RENAME TO idx_wallpaper_cache_refresh_after;
