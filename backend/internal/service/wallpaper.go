// Package service provides business logic services for the application.
package service

import (
	"fmt"

	"github.com/CatHeadTab/backend/internal/cache"
	"github.com/CatHeadTab/backend/internal/model"
)

// WallpaperProvider defines the interface for external wallpaper sources.
// Implementations must be safe for concurrent use.
type WallpaperProvider interface {
	// Name returns the unique identifier of this provider (e.g. "wallhaven").
	Name() string

	// Search queries wallpapers with the given parameters and returns paginated results.
	Search(params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error)

	// Available reports whether the provider is configured and ready to use.
	Available() bool

	// HasAPIKey reports whether an API key is configured for this provider.
	HasAPIKey() bool

	// AllowedPurity returns the purity levels allowed by the server configuration.
	AllowedPurity() []string

	// PurityKey returns a stable, deterministic string derived from the
	// provider's purity configuration. It is injected into search params
	// before caching so that different purity settings produce distinct
	// cache keys. Changing WALLHAVEN_PURITY and restarting the server
	// automatically invalidates all cached entries.
	PurityKey() string
}

// WallpaperService manages multiple wallpaper providers, dispatches requests,
// and transparently caches results to reduce upstream API calls.
type WallpaperService struct {
	providers map[string]WallpaperProvider
	cache     *cache.WallpaperCache
}

// NewWallpaperService creates a WallpaperService with the supplied providers
// and an optional WallpaperCache. If wpCache is nil, every request hits the
// upstream provider directly (useful for testing or when caching is unwanted).
func NewWallpaperService(wpCache *cache.WallpaperCache, providers ...WallpaperProvider) *WallpaperService {
	m := make(map[string]WallpaperProvider, len(providers))
	for _, p := range providers {
		if p.Available() {
			m[p.Name()] = p
		}
	}
	return &WallpaperService{providers: m, cache: wpCache}
}

// Search dispatches a search to the named provider. Results are served from
// an in-memory LRU cache when available. Cache misses are de-duplicated via
// singleflight to prevent thundering herd on the upstream API.
// Random-sorted searches are also cached; the handler shuffles before serving.
//
// The effective purity is the intersection of the frontend request and the
// server-side allowed set. If the frontend sends no purity, all allowed
// purities are used. The resulting PurityKey is injected into params so that
// different selections produce distinct cache keys.
func (s *WallpaperService) Search(providerName string, params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error) {
	p, ok := s.providers[providerName]
	if !ok {
		return nil, fmt.Errorf("wallpaper provider %q not found or not configured", providerName)
	}

	// Compute effective purity: intersect frontend request with server config.
	// If the frontend sends nothing, use all allowed purities.
	params.Purity = effectivePurity(params.Purity, p.AllowedPurity())

	// Build a deterministic cache key from the effective purity.
	params.PurityKey = purityKeyFromSlice(params.Purity)

	// Delegate to cache layer (handles miss → fetch → store → singleflight)
	if s.cache != nil {
		return s.cache.GetOrFetch(providerName, params, s.fetchFromProvider)
	}

	// No cache configured — call provider directly
	return s.fetchFromProvider(providerName, params)
}

// effectivePurity returns the intersection of the requested purity levels
// and the server-allowed set. If requested is empty, all allowed levels are
// returned. SFW is always included as a minimum.
func effectivePurity(requested []model.WallpaperPurity, allowed []string) []model.WallpaperPurity {
	allowedSet := make(map[model.WallpaperPurity]bool, len(allowed))
	for _, a := range allowed {
		allowedSet[model.WallpaperPurity(a)] = true
	}

	if len(requested) == 0 {
		// No filter from frontend — use all allowed.
		out := make([]model.WallpaperPurity, 0, len(allowedSet))
		for p := range allowedSet {
			out = append(out, p)
		}
		return out
	}

	// Intersect: only keep requested values that the server allows.
	out := make([]model.WallpaperPurity, 0, len(requested))
	for _, r := range requested {
		if allowedSet[r] {
			out = append(out, r)
		}
	}
	// Safety net: always include at least SFW.
	if len(out) == 0 {
		out = append(out, model.PuritySFW)
	}
	return out
}

// purityKeyFromSlice builds a deterministic 3-char bitmask from a purity slice.
// Format: SFW|Sketchy|NSFW → e.g. "110" for sfw+sketchy.
func purityKeyFromSlice(purities []model.WallpaperPurity) string {
	bits := [3]byte{'0', '0', '0'}
	for _, p := range purities {
		switch p {
		case model.PuritySFW:
			bits[0] = '1'
		case model.PuritySketchy:
			bits[1] = '1'
		case model.PurityNSFW:
			bits[2] = '1'
		}
	}
	return string(bits[:])
}

// fetchFromProvider is the underlying fetch function passed to the cache layer.
// PurityKey is already injected into params by Search before this is called.
func (s *WallpaperService) fetchFromProvider(providerName string, params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error) {
	p, ok := s.providers[providerName]
	if !ok {
		return nil, fmt.Errorf("wallpaper provider %q not found or not configured", providerName)
	}
	return p.Search(params)
}

// FetchFromProvider returns the underlying fetch function suitable for passing
// to cache.RefreshStale or cache.GetOrFetch. This allows the background refresh
// job to call upstream providers through the service layer.
func (s *WallpaperService) FetchFromProvider() cache.FetchFunc {
	return s.fetchFromProvider
}

// ListProviders returns the names of all available providers.
func (s *WallpaperService) ListProviders() []string {
	names := make([]string, 0, len(s.providers))
	for name := range s.providers {
		names = append(names, name)
	}
	return names
}

// ProviderConfig returns configuration details about a provider so the
// frontend can adapt its UI (e.g. show/hide purity filter options).
func (s *WallpaperService) ProviderConfig(providerName string) (hasKey bool, allowedPurity []string, found bool) {
	p, ok := s.providers[providerName]
	if !ok {
		return false, nil, false
	}
	return p.HasAPIKey(), p.AllowedPurity(), true
}

// CacheStats returns current cache statistics. If the cache is nil
// (disabled), it returns nil.
func (s *WallpaperService) CacheStats() *cache.CacheStats {
	if s.cache == nil {
		return nil
	}
	stats := s.cache.Stats()
	return &stats
}

// Close releases resources held by the service (e.g. cache).
func (s *WallpaperService) Close() {
	if s.cache != nil {
		s.cache.Close()
	}
}
