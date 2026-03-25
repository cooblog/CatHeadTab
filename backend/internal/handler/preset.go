// Package handler provides HTTP handlers for preset site endpoints.
package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// PresetHandler handles HTTP requests for preset site data.
type PresetHandler struct {
	repo repository.PresetRepository
}

// NewPresetHandler creates a new PresetHandler.
func NewPresetHandler(repo repository.PresetRepository) *PresetHandler {
	return &PresetHandler{repo: repo}
}

// ListAll returns all preset categories with their sites nested inside.
// Deprecated: kept for backward compatibility. Prefer ListCategories + ListSitesByCategory.
func (h *PresetHandler) ListAll(c *gin.Context) {
	categories, err := h.repo.ListAllWithSites()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch preset sites"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"categories": categories})
}

// ListCategories returns all preset categories (without sites) and the site count per category.
// GET /api/v1/preset-categories
func (h *PresetHandler) ListCategories(c *gin.Context) {
	categories, err := h.repo.ListCategoriesWithCount()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch categories"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"categories": categories})
}

// ListSitesByCategory returns all preset sites for a given category.
// GET /api/v1/preset-categories/:id/sites
func (h *PresetHandler) ListSitesByCategory(c *gin.Context) {
	idStr := c.Param("id")
	categoryID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category id"})
		return
	}

	sites, err := h.repo.ListSitesByCategory(categoryID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch sites"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"sites": sites})
}

// SearchSites searches preset sites by keyword across title, url, and description.
// GET /api/v1/preset-sites/search?q=keyword&limit=50
func (h *PresetHandler) SearchSites(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusOK, gin.H{"results": []interface{}{}})
		return
	}

	limit := 50
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	results, err := h.repo.SearchSites(q, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
	}

	if results == nil {
		results = []model.PresetSiteSearchResult{}
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}
