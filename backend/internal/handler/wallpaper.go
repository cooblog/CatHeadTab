package handler

import (
	"log"
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

// Search queries a wallpaper provider and returns paginated results.
// Purity is controlled by the server-side WALLHAVEN_PURITY environment variable.
//
//	GET /api/v1/wallpapers/search?provider=wallhaven&q=nature&page=1&sorting=toplist&categories=general,anime
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


