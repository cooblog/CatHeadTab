-- Persistent cache for wallpaper search results.
-- Used for slow-changing sorting types (toplist, views, favorites) where results
-- remain stable for hours/days, reducing upstream API calls significantly.
CREATE TABLE IF NOT EXISTS wallpaper_cache (
    -- SHA-256 hash of (provider + search params), same as the in-memory cache key
    cache_key   VARCHAR(64) PRIMARY KEY,
    -- Provider name (e.g. "wallhaven")
    provider    VARCHAR(32)  NOT NULL,
    -- Sorting type that triggered this cache entry
    sorting     VARCHAR(32)  NOT NULL,
    -- JSON-encoded WallpaperSearchResult
    result_json JSONB        NOT NULL,
    -- When this entry was created / last refreshed
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- When this entry expires (for easy cleanup queries)
    expires_at  TIMESTAMPTZ  NOT NULL
);

-- Index for cleanup job: find expired entries efficiently
CREATE INDEX idx_wallpaper_cache_expires_at ON wallpaper_cache (expires_at);

-- Index for stats: count entries by sorting type
CREATE INDEX idx_wallpaper_cache_sorting ON wallpaper_cache (sorting);
