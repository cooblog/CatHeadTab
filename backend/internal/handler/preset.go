// Package handler provides HTTP handlers for preset site endpoints.
package handler

import (
	"net/http"

	"github.com/CatHeadTab/backend/internal/repository"

	"github.com/gin-gonic/gin"
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
// This is the main endpoint used by the frontend Explore World page.
func (h *PresetHandler) ListAll(c *gin.Context) {
	categories, err := h.repo.ListAllWithSites()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch preset sites"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"categories": categories})
}
