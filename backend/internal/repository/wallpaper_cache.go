// Package repository provides data-access abstractions.
package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/CatHeadTab/backend/internal/cache"
	"github.com/CatHeadTab/backend/internal/model"
)

// WallpaperCacheRepository implements cache.DBCacheStore using PostgreSQL.
// L2 entries are never deleted. When refresh_after is reached, the entry is
// considered "stale" and the cache layer handles refresh logic.
type WallpaperCacheRepository interface {
	cache.DBCacheStore
}

// postgresWallpaperCacheRepository implements WallpaperCacheRepository using PostgreSQL.
type postgresWallpaperCacheRepository struct {
	db *sql.DB
}

// NewWallpaperCacheRepository creates a new WallpaperCacheRepository backed by PostgreSQL.
func NewWallpaperCacheRepository(db *sql.DB) WallpaperCacheRepository {
	return &postgresWallpaperCacheRepository{db: db}
}

// Get retrieves a cached result by key. It always returns the data regardless
// of staleness. The Stale flag is set when refresh_after <= NOW().
func (r *postgresWallpaperCacheRepository) Get(cacheKey string) (*cache.L2CacheEntry, error) {
	var resultJSON []byte
	var stale bool
	err := r.db.QueryRow(
		`SELECT result_json, (refresh_after <= NOW()) AS stale
		 FROM wallpaper_cache
		 WHERE cache_key = $1`,
		cacheKey,
	).Scan(&resultJSON, &stale)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("wallpaper cache get: %w", err)
	}

	var result model.WallpaperSearchResult
	if err := json.Unmarshal(resultJSON, &result); err != nil {
		return nil, fmt.Errorf("wallpaper cache unmarshal: %w", err)
	}

	return &cache.L2CacheEntry{Result: &result, Stale: stale}, nil
}

// Set inserts or updates a cache entry using PostgreSQL UPSERT.
func (r *postgresWallpaperCacheRepository) Set(
	cacheKey, provider, sorting string,
	result *model.WallpaperSearchResult,
	refreshAfter time.Time,
) error {
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("wallpaper cache marshal: %w", err)
	}

	_, err = r.db.Exec(
		`INSERT INTO wallpaper_cache (cache_key, provider, sorting, result_json, created_at, refresh_after)
		 VALUES ($1, $2, $3, $4, NOW(), $5)
		 ON CONFLICT (cache_key) DO UPDATE SET
		   result_json   = EXCLUDED.result_json,
		   created_at    = NOW(),
		   refresh_after = EXCLUDED.refresh_after`,
		cacheKey, provider, sorting, resultJSON, refreshAfter,
	)
	if err != nil {
		return fmt.Errorf("wallpaper cache set: %w", err)
	}

	return nil
}

// ExtendRefreshAfter pushes the refresh deadline forward without rewriting
// the cached data. This is used when upstream data has not changed.
func (r *postgresWallpaperCacheRepository) ExtendRefreshAfter(cacheKey string, refreshAfter time.Time) error {
	_, err := r.db.Exec(
		`UPDATE wallpaper_cache SET refresh_after = $1 WHERE cache_key = $2`,
		refreshAfter, cacheKey,
	)
	if err != nil {
		return fmt.Errorf("wallpaper cache extend refresh: %w", err)
	}
	return nil
}

// ListStaleKeys returns up to `limit` entries whose refresh_after has passed,
// ordered by oldest first so the most overdue entries are refreshed first.
func (r *postgresWallpaperCacheRepository) ListStaleKeys(limit int) ([]cache.StaleEntry, error) {
	rows, err := r.db.Query(
		`SELECT cache_key, provider, sorting FROM wallpaper_cache
		 WHERE refresh_after <= NOW()
		 ORDER BY refresh_after ASC
		 LIMIT $1`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("wallpaper cache list stale: %w", err)
	}
	defer rows.Close()

	var entries []cache.StaleEntry
	for rows.Next() {
		var e cache.StaleEntry
		if err := rows.Scan(&e.CacheKey, &e.Provider, &e.Sorting); err != nil {
			return nil, fmt.Errorf("wallpaper cache scan stale: %w", err)
		}
		entries = append(entries, e)
	}

	return entries, rows.Err()
}

// CountByType returns the number of entries grouped by sorting type.
// All entries are counted regardless of staleness.
func (r *postgresWallpaperCacheRepository) CountByType() (map[string]int64, error) {
	rows, err := r.db.Query(
		`SELECT sorting, COUNT(*) FROM wallpaper_cache GROUP BY sorting`,
	)
	if err != nil {
		return nil, fmt.Errorf("wallpaper cache count by type: %w", err)
	}
	defer rows.Close()

	counts := make(map[string]int64)
	for rows.Next() {
		var sorting string
		var count int64
		if err := rows.Scan(&sorting, &count); err != nil {
			return nil, fmt.Errorf("wallpaper cache scan: %w", err)
		}
		counts[sorting] = count
	}

	return counts, rows.Err()
}

// TotalCount returns the total number of entries (including stale ones).
func (r *postgresWallpaperCacheRepository) TotalCount() (int64, error) {
	var count int64
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM wallpaper_cache`,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("wallpaper cache total count: %w", err)
	}
	return count, nil
}
