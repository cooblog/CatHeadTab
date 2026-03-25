package handler

import (
	"log"
	"math/rand/v2"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/service"
)

// WallpaperHandler handles wallpaper source browsing API endpoints.
type WallpaperHandler struct {
	svc *service.WallpaperService
}

// NewWallpaperHandler creates a WallpaperHandler.
func NewWallpaperHandler(svc *service.WallpaperService) *WallpaperHandler {
	return &WallpaperHandler{svc: svc}
}

// ListProviders returns the list of available wallpaper providers.
//
//	GET /api/v1/wallpapers/providers
func (h *WallpaperHandler) ListProviders(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"providers": h.svc.ListProviders(),
	})
}

// GetConfig returns provider configuration hints so the frontend can
// decide whether to use the backend proxy or query the upstream directly.
//
//	GET /api/v1/wallpapers/config
func (h *WallpaperHandler) GetConfig(c *gin.Context) {
	provider := c.DefaultQuery("provider", "wallhaven")
	hasKey, allowedPurity, found := h.svc.ProviderConfig(provider)
	if !found {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"provider":      provider,
		"hasApiKey":     hasKey,
		"allowedPurity": allowedPurity,
	})
}

// CacheStats returns current wallpaper cache statistics.
//
//	GET /api/v1/wallpapers/cache/stats
func (h *WallpaperHandler) CacheStats(c *gin.Context) {
	stats := h.svc.CacheStats()
	if stats == nil {
		c.JSON(http.StatusOK, gin.H{
			"enabled": false,
			"message": "cache is not enabled",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"enabled": true,
		"stats":   stats,
	})
}

// Search queries a wallpaper provider and returns paginated results.
// The frontend may pass a `purity` query param (comma-separated: sfw,sketchy,nsfw).
// The service layer validates it against the server-side allowed purity set.
//
// An optional `exclude` query param accepts a comma-separated list of wallpaper
// IDs that the client has already loaded (e.g. from previous pages). Any matching
// IDs are removed from the response so the client never sees duplicates even when
// upstream data shifts between cached pages.
//
//	GET /api/v1/wallpapers/search?provider=wallhaven&q=nature&page=1&sorting=toplist&categories=general,anime&purity=sfw,sketchy&exclude=id1,id2
func (h *WallpaperHandler) Search(c *gin.Context) {
	provider := c.DefaultQuery("provider", "wallhaven")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}

	params := model.WallpaperSearchParams{
		Query:      c.Query("q"),
		Sorting:    c.DefaultQuery("sorting", "toplist"),
		Order:      c.DefaultQuery("order", "desc"),
		TopRange:   c.DefaultQuery("topRange", "1M"),
		AtLeast:    c.Query("atLeast"),
		Ratios:     c.Query("ratios"),
		Colors:     c.Query("colors"),
		Page:       page,
		Seed:       c.Query("seed"),
		Categories: parseCategories(c.Query("categories")),
		Purity:     parsePurity(c.Query("purity")),
	}

	result, err := h.svc.Search(provider, params)
	if err != nil {
		log.Printf("[wallpaper] search error: provider=%s sorting=%s page=%d err=%v", provider, params.Sorting, params.Page, err)
		// Distinguish between "provider not found" (client error) and upstream failures
		errMsg := err.Error()
		if strings.Contains(errMsg, "not found") || strings.Contains(errMsg, "not configured") {
			c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": errMsg})
		return
	}

	// For random sorting the cache returns a stable result set; we shuffle a
	// shallow copy of the Wallpapers slice so each request feels random without
	// invalidating the cached pointer.
	if params.Sorting == "random" {
		result = shuffleWallpapers(result)
	}

	// Deduplicate: remove wallpapers whose IDs the client already has.
	// This handles the case where page 1 was refreshed but page 2+ still
	// contains stale cached data with overlapping entries.
	if excludeRaw := c.Query("exclude"); excludeRaw != "" {
		result = excludeWallpapers(result, excludeRaw)
	}

	c.JSON(http.StatusOK, result)
}

// parseCategories converts a comma-separated category string to a slice.
func parseCategories(raw string) []model.WallpaperCategory {
	if raw == "" {
		return nil
	}
	var cats []model.WallpaperCategory
	for _, s := range strings.Split(raw, ",") {
		switch strings.TrimSpace(s) {
		case "general":
			cats = append(cats, model.CategoryGeneral)
		case "anime":
			cats = append(cats, model.CategoryAnime)
		case "people":
			cats = append(cats, model.CategoryPeople)
		}
	}
	return cats
}

// parsePurity converts a comma-separated purity string to a slice.
// Unrecognised values are silently dropped.
func parsePurity(raw string) []model.WallpaperPurity {
	if raw == "" {
		return nil
	}
	var purities []model.WallpaperPurity
	for _, s := range strings.Split(raw, ",") {
		switch strings.TrimSpace(strings.ToLower(s)) {
		case "sfw":
			purities = append(purities, model.PuritySFW)
		case "sketchy":
			purities = append(purities, model.PuritySketchy)
		case "nsfw":
			purities = append(purities, model.PurityNSFW)
		}
	}
	return purities
}

// shuffleWallpapers returns a shallow copy of the search result with the
// Wallpapers slice randomly shuffled. This avoids mutating the cached original
// while providing per-request randomness for random-sorted queries.
func shuffleWallpapers(src *model.WallpaperSearchResult) *model.WallpaperSearchResult {
	if src == nil || len(src.Wallpapers) <= 1 {
		return src
	}
	shuffled := make([]model.Wallpaper, len(src.Wallpapers))
	copy(shuffled, src.Wallpapers)
	rand.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})
	return &model.WallpaperSearchResult{
		Wallpapers:  shuffled,
		CurrentPage: src.CurrentPage,
		LastPage:    src.LastPage,
		PerPage:     src.PerPage,
		Total:       src.Total,
		Seed:        src.Seed,
	}
}

// excludeWallpapers returns a shallow copy of the search result with any
// wallpapers whose IDs appear in the comma-separated excludeCSV removed.
// This allows the frontend to pass the IDs it has already loaded (from
// previously fetched pages) so the response contains no duplicates, even
// when upstream data has shifted between cached pages.
func excludeWallpapers(src *model.WallpaperSearchResult, excludeCSV string) *model.WallpaperSearchResult {
	if src == nil || len(src.Wallpapers) == 0 || excludeCSV == "" {
		return src
	}

	// Build a set of IDs to exclude.
	parts := strings.Split(excludeCSV, ",")
	excludeSet := make(map[string]struct{}, len(parts))
	for _, id := range parts {
		if trimmed := strings.TrimSpace(id); trimmed != "" {
			excludeSet[trimmed] = struct{}{}
		}
	}
	if len(excludeSet) == 0 {
		return src
	}

	filtered := make([]model.Wallpaper, 0, len(src.Wallpapers))
	for _, wp := range src.Wallpapers {
		if _, skip := excludeSet[wp.ID]; !skip {
			filtered = append(filtered, wp)
		}
	}

	// If nothing was filtered, return the original to avoid an unnecessary copy.
	if len(filtered) == len(src.Wallpapers) {
		return src
	}

	return &model.WallpaperSearchResult{
		Wallpapers:  filtered,
		CurrentPage: src.CurrentPage,
		LastPage:    src.LastPage,
		PerPage:     src.PerPage,
		Total:       src.Total,
		Seed:        src.Seed,
	}
}


