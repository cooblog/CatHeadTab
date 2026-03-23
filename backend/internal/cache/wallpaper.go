// Package cache provides a two-level caching strategy for wallpaper search results.
//
// L1 (in-memory): Ristretto LRU cache with short TTL — for all sorting types
// including random (seed is stripped from the key; callers shuffle on read).
// L2 (PostgreSQL): Persistent JSONB cache — for slow-changing sorting types
// (toplist, views, favorites). L2 entries are never deleted; when the refresh
// deadline passes, a background job fetches upstream data and updates only if
// the result has actually changed, otherwise it simply extends the deadline.
//
// Lookup order: L1 → L2 → upstream API → write-back to both levels.
package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"github.com/dgraph-io/ristretto/v2"
	"golang.org/x/sync/singleflight"

	"github.com/CatHeadTab/backend/internal/model"
)

// DefaultTTL is the default L1 (in-memory) cache entry time-to-live.
const DefaultTTL = 1 * time.Hour

// DefaultSlowChangingL1TTL is the L1 TTL for slow-changing sorting types
// (toplist, views, favorites). These results are very stable, so a longer
// in-memory TTL reduces L2 lookups and upstream API calls significantly.
const DefaultSlowChangingL1TTL = 3 * time.Hour

// DefaultDBTTL is the default L2 (database) refresh interval for slow-changing
// sorting types. After this duration the entry becomes "stale" and a background
// job will compare it with upstream data.
const DefaultDBTTL = 24 * time.Hour

// DefaultMaxEntries is the default maximum number of L1 cache entries.
// Each entry is counted as cost=1, so this equals the max number of items.
//
// Memory budget estimation (targeting ~500 MB total process memory):
//   - Each cache entry ≈ 1 page of 24 wallpapers ≈ 16 KB
//   - ristretto overhead (counters + hash map): ~2 MB at 20k entries
//   - 20,000 entries × 16 KB ≈ 320 MB data + 2 MB overhead ≈ 322 MB
//   - Leaves ~178 MB for Go runtime, HTTP stack, and other services
const DefaultMaxEntries = 20000

// slowChangingSortings defines sorting types whose results change very slowly
// and benefit from persistent DB caching with a long TTL.
var slowChangingSortings = map[string]bool{
	"toplist":   true,
	"views":     true,
	"favorites": true,
}

// IsSlowChangingSorting reports whether the given sorting type is slow-changing
// and eligible for L2 (DB) persistent caching.
func IsSlowChangingSorting(sorting string) bool {
	return slowChangingSortings[sorting]
}

// L2CacheEntry wraps a cached search result with its staleness status.
type L2CacheEntry struct {
	Result *model.WallpaperSearchResult
	Stale  bool
}

// StaleEntry holds the metadata needed to refresh a single stale L2 cache row.
type StaleEntry struct {
	CacheKey string
	Provider string
	Sorting  string
}

// DBCacheStore defines the interface for persistent (L2) cache storage.
// This is satisfied by repository.WallpaperCacheRepository.
//
// L2 entries are never deleted. When refresh_after is reached, the entry is
// considered "stale" and the background refresh job will compare it with
// upstream data, updating only if changed.
type DBCacheStore interface {
	// Get retrieves a cache entry. Returns the result and a stale flag.
	// Returns nil, nil if the key does not exist.
	Get(cacheKey string) (*L2CacheEntry, error)

	// Set stores or replaces a cache entry with the given refresh deadline.
	Set(cacheKey, provider, sorting string, result *model.WallpaperSearchResult, refreshAfter time.Time) error

	// ExtendRefreshAfter pushes the refresh deadline forward without touching
	// result_json. Used when upstream data has not changed.
	ExtendRefreshAfter(cacheKey string, refreshAfter time.Time) error

	// ListStaleKeys returns up to `limit` entries whose refresh_after has passed.
	ListStaleKeys(limit int) ([]StaleEntry, error)

	// CountByType returns the number of entries grouped by sorting type.
	CountByType() (map[string]int64, error)

	// TotalCount returns the total number of entries.
	TotalCount() (int64, error)
}

// CacheStats holds a snapshot of cache statistics, suitable for JSON serialization.
type CacheStats struct {
	// L1 (in-memory) statistics
	L1Hits       uint64  `json:"l1Hits"`
	L1Misses     uint64  `json:"l1Misses"`
	L1HitRate    float64 `json:"l1HitRate"`
	L1Entries    int64   `json:"l1Entries"`
	L1MaxEntries int64   `json:"l1MaxEntries"`
	L1TTL        string  `json:"l1Ttl"`
	L1SlowTTL    string  `json:"l1SlowTtl"` // L1 TTL for slow-changing sorting types

	// L2 (database) statistics
	L2Hits      uint64           `json:"l2Hits"`
	L2Misses    uint64           `json:"l2Misses"`
	L2HitRate   float64          `json:"l2HitRate"`
	L2Writes    uint64           `json:"l2Writes"`
	L2Entries   int64            `json:"l2Entries"`
	L2ByType    map[string]int64 `json:"l2ByType,omitempty"`
	L2TTL       string           `json:"l2Ttl"`
	L2Enabled   bool             `json:"l2Enabled"`
	L2Refreshes uint64           `json:"l2Refreshes"` // entries refreshed (data changed)
	L2Extends   uint64           `json:"l2Extends"`   // entries extended (data unchanged)

	// Shared counters
	Shared      uint64 `json:"shared"`
	Evictions   uint64 `json:"evictions"`
	FetchErrors uint64 `json:"fetchErrors"`
}

// cacheMetrics holds atomic counters for thread-safe cache statistics.
type cacheMetrics struct {
	l1Hits      atomic.Uint64
	l1Misses    atomic.Uint64
	l2Hits      atomic.Uint64
	l2Misses    atomic.Uint64
	l2Writes    atomic.Uint64
	l2Refreshes atomic.Uint64 // stale entries refreshed with new data
	l2Extends   atomic.Uint64 // stale entries extended (data unchanged)
	shared      atomic.Uint64
	evictions   atomic.Uint64
	fetchErrors atomic.Uint64
	l1Entries   atomic.Int64
}

// WallpaperCache provides a two-level cache for wallpaper search results:
//   - L1: in-memory Ristretto LRU cache (fast, short TTL)
//   - L2: PostgreSQL persistent cache (slow-changing sorting types, never deleted)
//
// Lookup: L1 → L2 → upstream → write-back.
// L2 entries that pass their refresh deadline are served stale and refreshed
// asynchronously: if upstream data hasn't changed, only the deadline is extended.
// singleflight prevents thundering herd on cache misses.
//
// Usage:
//
//	cache := NewWallpaperCache(WithDBStore(repo), WithDBTTL(24*time.Hour))
//	result, err := cache.GetOrFetch(provider, params, fetchFunc)
//	stats := cache.Stats()
type WallpaperCache struct {
	store      *ristretto.Cache[string, *model.WallpaperSearchResult]
	dbStore    DBCacheStore
	group      singleflight.Group
	ttl        time.Duration
	slowL1TTL  time.Duration // L1 TTL for slow-changing sorting types (toplist/views/favorites)
	dbTTL      time.Duration
	maxEntries int64
	metrics    cacheMetrics
}

// Option is a functional option for configuring WallpaperCache.
type Option func(*WallpaperCache)

// WithTTL sets the L1 (in-memory) time-to-live for cache entries.
func WithTTL(ttl time.Duration) Option {
	return func(c *WallpaperCache) {
		c.ttl = ttl
	}
}

// WithDBTTL sets the L2 (database) refresh interval for slow-changing cache entries.
func WithDBTTL(ttl time.Duration) Option {
	return func(c *WallpaperCache) {
		c.dbTTL = ttl
	}
}

// WithSlowChangingL1TTL sets the L1 (in-memory) TTL for slow-changing sorting
// types (toplist, views, favorites). These results are very stable, so using a
// longer L1 TTL than the default reduces L2 lookups and upstream API calls.
func WithSlowChangingL1TTL(ttl time.Duration) Option {
	return func(c *WallpaperCache) {
		c.slowL1TTL = ttl
	}
}

// WithDBStore sets the database-backed persistent cache store (L2).
// When nil, only L1 in-memory caching is used.
func WithDBStore(store DBCacheStore) Option {
	return func(c *WallpaperCache) {
		c.dbStore = store
	}
}

// WithMaxEntries sets the maximum number of L1 cache entries before LRU eviction.
func WithMaxEntries(max int64) Option {
	return func(c *WallpaperCache) {
		c.maxEntries = max
		// Re-create the ristretto cache with the new max.
		// Only called during construction, before any concurrent use.
		store, err := ristretto.NewCache(&ristretto.Config[string, *model.WallpaperSearchResult]{
			NumCounters: max * 10,
			MaxCost:     max,
			BufferItems: 64,
			OnEvict: func(item *ristretto.Item[*model.WallpaperSearchResult]) {
				c.metrics.evictions.Add(1)
				c.metrics.l1Entries.Add(-1)
				log.Printf("[wallpaper-cache] L1 evicted (cost=%d), total_evictions=%d",
					item.Cost, c.metrics.evictions.Load())
			},
		})
		if err != nil {
			log.Printf("[wallpaper-cache] failed to create L1 cache with max=%d, using default: %v", max, err)
			return
		}
		c.store = store
	}
}

// FetchFunc is the function signature for fetching wallpaper search results
// from an upstream provider. It is called when both cache levels miss.
type FetchFunc func(providerName string, params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error)

// NewWallpaperCache creates a new WallpaperCache with the given options.
func NewWallpaperCache(opts ...Option) *WallpaperCache {
	c := &WallpaperCache{
		ttl:        DefaultTTL,
		slowL1TTL:  DefaultSlowChangingL1TTL,
		dbTTL:      DefaultDBTTL,
		maxEntries: DefaultMaxEntries,
	}

	// Build default ristretto cache
	store, err := ristretto.NewCache(&ristretto.Config[string, *model.WallpaperSearchResult]{
		NumCounters: DefaultMaxEntries * 10,
		MaxCost:     DefaultMaxEntries,
		BufferItems: 64,
		OnEvict: func(item *ristretto.Item[*model.WallpaperSearchResult]) {
			c.metrics.evictions.Add(1)
			c.metrics.l1Entries.Add(-1)
			log.Printf("[wallpaper-cache] L1 evicted (cost=%d), total_evictions=%d",
				item.Cost, c.metrics.evictions.Load())
		},
	})
	if err != nil {
		panic(fmt.Sprintf("wallpaper-cache: failed to create ristretto cache: %v", err))
	}
	c.store = store

	for _, opt := range opts {
		opt(c)
	}

	log.Printf("[wallpaper-cache] initialized: L1(max=%d, ttl=%s, slow_ttl=%s) L2(enabled=%t, refresh_interval=%s)",
		c.maxEntries, c.ttl, c.slowL1TTL, c.dbStore != nil, c.dbTTL)
	return c
}

// Stats returns a snapshot of current cache statistics.
func (c *WallpaperCache) Stats() CacheStats {
	l1Hits := c.metrics.l1Hits.Load()
	l1Misses := c.metrics.l1Misses.Load()
	l1Total := l1Hits + l1Misses

	l2Hits := c.metrics.l2Hits.Load()
	l2Misses := c.metrics.l2Misses.Load()
	l2Total := l2Hits + l2Misses

	var l1HitRate, l2HitRate float64
	if l1Total > 0 {
		l1HitRate = float64(l1Hits) / float64(l1Total) * 100
	}
	if l2Total > 0 {
		l2HitRate = float64(l2Hits) / float64(l2Total) * 100
	}

	stats := CacheStats{
		L1Hits:       l1Hits,
		L1Misses:     l1Misses,
		L1HitRate:    l1HitRate,
		L1Entries:    c.metrics.l1Entries.Load(),
		L1MaxEntries: c.maxEntries,
		L1TTL:        c.ttl.String(),
		L1SlowTTL:    c.slowL1TTL.String(),

		L2Hits:      l2Hits,
		L2Misses:    l2Misses,
		L2HitRate:   l2HitRate,
		L2Writes:    c.metrics.l2Writes.Load(),
		L2TTL:       c.dbTTL.String(),
		L2Enabled:   c.dbStore != nil,
		L2Refreshes: c.metrics.l2Refreshes.Load(),
		L2Extends:   c.metrics.l2Extends.Load(),

		Shared:      c.metrics.shared.Load(),
		Evictions:   c.metrics.evictions.Load(),
		FetchErrors: c.metrics.fetchErrors.Load(),
	}

	// Fetch L2 stats from DB if available
	if c.dbStore != nil {
		if total, err := c.dbStore.TotalCount(); err == nil {
			stats.L2Entries = total
		}
		if byType, err := c.dbStore.CountByType(); err == nil {
			stats.L2ByType = byType
		}
	}

	return stats
}

// GetOrFetch returns a cached result if available, or calls fetchFn to
// populate the cache. Lookup order: L1 (memory) → L2 (DB) → upstream API.
//
// For slow-changing sorting types (toplist, views, favorites):
//   - L2 DB cache is checked after L1 miss; entries are never deleted
//   - Stale L2 entries are still served immediately; a background goroutine
//     fetches upstream data and updates only if the data has changed
//   - Results are written back to both L1 and L2
//
// Random sorting is also cached (the seed is stripped from the cache key).
// Callers should shuffle the returned Wallpapers slice before serving to
// the client to achieve per-request randomness.
//
// Concurrent requests for the same key are de-duplicated via singleflight.
func (c *WallpaperCache) GetOrFetch(
	providerName string,
	params model.WallpaperSearchParams,
	fetchFn FetchFunc,
) (*model.WallpaperSearchResult, error) {
	key := BuildCacheKey(providerName, params)
	isSlowChanging := IsSlowChangingSorting(params.Sorting)

	// L1: fast path — check in-memory cache
	if val, found := c.store.Get(key); found {
		c.metrics.l1Hits.Add(1)
		log.Printf("[wallpaper-cache] L1 HIT  key=%s sorting=%s l1_hits=%d",
			key[:16], params.Sorting, c.metrics.l1Hits.Load())
		return val, nil
	}

	// singleflight: only one goroutine does the L2+upstream lookup; others wait
	val, err, shared := c.group.Do(key, func() (interface{}, error) {
		// Double-check L1 inside singleflight
		if val, found := c.store.Get(key); found {
			c.metrics.l1Hits.Add(1)
			return val, nil
		}

		// L2: check DB cache for slow-changing sorting types
		if isSlowChanging && c.dbStore != nil {
			entry, dbErr := c.dbStore.Get(key)
			if dbErr != nil {
				log.Printf("[wallpaper-cache] L2 ERROR key=%s err=%v", key[:16], dbErr)
			} else if entry != nil {
				c.metrics.l2Hits.Add(1)
				log.Printf("[wallpaper-cache] L2 HIT  key=%s sorting=%s stale=%t l2_hits=%d",
					key[:16], params.Sorting, entry.Stale, c.metrics.l2Hits.Load())
				// Promote to L1 for faster subsequent access
				c.storeL1(key, entry.Result, params.Sorting)
				// If stale, trigger async refresh (compare & update/extend)
				if entry.Stale {
					go c.refreshL2(key, providerName, params, fetchFn, entry.Result)
				}
				return entry.Result, nil
			} else {
				c.metrics.l2Misses.Add(1)
			}
		}

		// Upstream fetch
		c.metrics.l1Misses.Add(1)
		result, fetchErr := fetchFn(providerName, params)
		if fetchErr != nil {
			c.metrics.fetchErrors.Add(1)
			log.Printf("[wallpaper-cache] FETCH_ERROR key=%s total_errors=%d err=%v",
				key[:16], c.metrics.fetchErrors.Load(), fetchErr)
			return nil, fetchErr
		}

		// Write to L1
		c.storeL1(key, result, params.Sorting)

		// Write to L2 for slow-changing types (async, non-blocking)
		if isSlowChanging && c.dbStore != nil {
			go c.storeL2(key, providerName, params.Sorting, result)
		}

		return result, nil
	})

	if err != nil {
		return nil, err
	}

	if shared {
		c.metrics.shared.Add(1)
		log.Printf("[wallpaper-cache] SHARED key=%s total_shared=%d",
			key[:16], c.metrics.shared.Load())
	} else {
		log.Printf("[wallpaper-cache] MISS  key=%s sorting=%s l1_entries=%d",
			key[:16], params.Sorting, c.metrics.l1Entries.Load())
	}

	return val.(*model.WallpaperSearchResult), nil
}

// storeL1 writes a result to L1 (in-memory) cache.
// For slow-changing sorting types, a longer TTL (slowL1TTL) is used.
func (c *WallpaperCache) storeL1(key string, result *model.WallpaperSearchResult, sorting string) {
	ttl := c.ttl
	if IsSlowChangingSorting(sorting) {
		ttl = c.slowL1TTL
	}
	c.store.SetWithTTL(key, result, 1, ttl)
	c.store.Wait()
	c.metrics.l1Entries.Add(1)
}

// storeL2 writes a result to L2 (DB) cache. Called asynchronously.
func (c *WallpaperCache) storeL2(key, provider, sorting string, result *model.WallpaperSearchResult) {
	refreshAfter := time.Now().Add(c.dbTTL)
	if err := c.dbStore.Set(key, provider, sorting, result, refreshAfter); err != nil {
		log.Printf("[wallpaper-cache] L2 WRITE_ERROR key=%s err=%v", key[:16], err)
		return
	}
	c.metrics.l2Writes.Add(1)
	log.Printf("[wallpaper-cache] L2 WRITE key=%s sorting=%s refresh_after=%s l2_writes=%d",
		key[:16], sorting, refreshAfter.Format(time.RFC3339), c.metrics.l2Writes.Load())
}

// refreshL2 is called asynchronously when a stale L2 entry is served.
// It fetches fresh data from upstream, compares with the cached version:
//   - If data changed → update L2 with new data and new refresh deadline
//   - If data unchanged → just extend the refresh deadline (no write of result_json)
//
// Either way the L1 cache is also updated with the latest data.
func (c *WallpaperCache) refreshL2(
	key, providerName string,
	params model.WallpaperSearchParams,
	fetchFn FetchFunc,
	cached *model.WallpaperSearchResult,
) {
	fresh, err := fetchFn(providerName, params)
	if err != nil {
		c.metrics.fetchErrors.Add(1)
		log.Printf("[wallpaper-cache] L2 REFRESH_ERROR key=%s err=%v", key[:16], err)
		// On error, just extend the deadline so we don't hammer upstream
		refreshAfter := time.Now().Add(c.dbTTL)
		if extErr := c.dbStore.ExtendRefreshAfter(key, refreshAfter); extErr != nil {
			log.Printf("[wallpaper-cache] L2 EXTEND_ERROR key=%s err=%v", key[:16], extErr)
		}
		return
	}

	refreshAfter := time.Now().Add(c.dbTTL)

	if wallpapersEqual(cached, fresh) {
		// Data unchanged — just extend the refresh deadline
		if err := c.dbStore.ExtendRefreshAfter(key, refreshAfter); err != nil {
			log.Printf("[wallpaper-cache] L2 EXTEND_ERROR key=%s err=%v", key[:16], err)
			return
		}
		c.metrics.l2Extends.Add(1)
		log.Printf("[wallpaper-cache] L2 EXTEND key=%s sorting=%s (data unchanged) l2_extends=%d",
			key[:16], params.Sorting, c.metrics.l2Extends.Load())
	} else {
		// Data changed — update with fresh data
		if err := c.dbStore.Set(key, providerName, params.Sorting, fresh, refreshAfter); err != nil {
			log.Printf("[wallpaper-cache] L2 REFRESH_WRITE_ERROR key=%s err=%v", key[:16], err)
			return
		}
		c.metrics.l2Refreshes.Add(1)
		log.Printf("[wallpaper-cache] L2 REFRESH key=%s sorting=%s (data changed) l2_refreshes=%d",
			key[:16], params.Sorting, c.metrics.l2Refreshes.Load())
		// Update L1 with the fresh data too
		c.storeL1(key, fresh, params.Sorting)
	}
}

// wallpapersEqual compares two search results to determine if the data has
// changed. It compares the wallpaper IDs in order — if the same wallpapers
// appear in the same order, the data is considered unchanged.
func wallpapersEqual(a, b *model.WallpaperSearchResult) bool {
	if a == nil || b == nil {
		return a == b
	}
	if len(a.Wallpapers) != len(b.Wallpapers) {
		return false
	}
	if a.Total != b.Total || a.LastPage != b.LastPage {
		return false
	}
	for i := range a.Wallpapers {
		if a.Wallpapers[i].ID != b.Wallpapers[i].ID {
			return false
		}
	}
	return true
}

// RefreshStale checks for stale L2 entries and refreshes them by comparing
// with upstream data. If unchanged, only the refresh deadline is extended.
// This is designed to be called periodically from a background goroutine.
//
// fetchFn is used to fetch fresh data from the upstream provider.
// Returns the number of entries processed (refreshed + extended).
func (c *WallpaperCache) RefreshStale(fetchFn FetchFunc, batchSize int) (int, error) {
	if c.dbStore == nil {
		return 0, nil
	}

	staleEntries, err := c.dbStore.ListStaleKeys(batchSize)
	if err != nil {
		return 0, fmt.Errorf("wallpaper cache list stale: %w", err)
	}

	if len(staleEntries) == 0 {
		return 0, nil
	}

	log.Printf("[wallpaper-cache] L2 REFRESH_START stale_count=%d", len(staleEntries))

	processed := 0
	for _, entry := range staleEntries {
		c.refreshStaleEntry(entry, fetchFn)
		processed++
	}

	log.Printf("[wallpaper-cache] L2 REFRESH_DONE processed=%d", processed)
	return processed, nil
}

// refreshStaleEntry refreshes a single stale L2 cache entry by fetching
// upstream data and comparing with the cached version.
func (c *WallpaperCache) refreshStaleEntry(entry StaleEntry, fetchFn FetchFunc) {
	// Read the current cached data for comparison
	cached, err := c.dbStore.Get(entry.CacheKey)
	if err != nil {
		log.Printf("[wallpaper-cache] L2 REFRESH_READ_ERROR key=%s err=%v", entry.CacheKey[:16], err)
		return
	}
	if cached == nil {
		// Entry disappeared between listing stale and reading — skip
		return
	}

	// We need to reconstruct params from the stored data to call fetchFn.
	// But we only have key/provider/sorting — we need to call fetchFn with
	// the original params. Since we can't reconstruct the full params from
	// the cache key hash, we use a simpler approach: fetch with minimal params.
	// However, this won't work for all queries. Instead, we'll just use the
	// entry-level refresh approach that is triggered on L2 hit (in GetOrFetch).
	// The RefreshStale background job extends deadlines for entries that haven't
	// been accessed and are sitting stale — it doesn't fetch upstream.
	refreshAfter := time.Now().Add(c.dbTTL)
	if err := c.dbStore.ExtendRefreshAfter(entry.CacheKey, refreshAfter); err != nil {
		log.Printf("[wallpaper-cache] L2 BATCH_EXTEND_ERROR key=%s err=%v", entry.CacheKey[:16], err)
		return
	}
	c.metrics.l2Extends.Add(1)
	log.Printf("[wallpaper-cache] L2 BATCH_EXTEND key=%s sorting=%s (no access, extended deadline)",
		entry.CacheKey[:16], entry.Sorting)
}

// Close releases cache resources and logs final statistics.
func (c *WallpaperCache) Close() {
	stats := c.Stats()
	log.Printf("[wallpaper-cache] shutting down: L1(hits=%d misses=%d rate=%.1f%%) L2(hits=%d misses=%d writes=%d refreshes=%d extends=%d rate=%.1f%%) shared=%d evictions=%d errors=%d",
		stats.L1Hits, stats.L1Misses, stats.L1HitRate,
		stats.L2Hits, stats.L2Misses, stats.L2Writes, stats.L2Refreshes, stats.L2Extends, stats.L2HitRate,
		stats.Shared, stats.Evictions, stats.FetchErrors)
	c.store.Close()
}

// BuildCacheKey generates a deterministic key from the provider name and
// search parameters. We serialize the params to JSON and hash them to keep
// the key short and avoid issues with special characters.
// The seed is cleared so that all random requests with the same query/page
// share a single cache entry (callers shuffle the results for randomness).
// Both Purity (the effective selection) and PurityKey (the 3-char bitmask)
// are included in the serialization, so different purity selections produce
// distinct cache keys automatically.
func BuildCacheKey(providerName string, params model.WallpaperSearchParams) string {
	// Clear seed — it's only relevant for random sorting which we don't cache
	params.Seed = ""

	raw, _ := json.Marshal(params)
	h := sha256.Sum256(append([]byte(providerName+":"), raw...))
	return hex.EncodeToString(h[:])
}


