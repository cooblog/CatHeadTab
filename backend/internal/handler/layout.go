package handler

import (
	"net/http"

	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// LayoutHandler handles desktop layout operations.
type LayoutHandler struct {
	layoutRepo repository.LayoutRepository
}

// NewLayoutHandler creates a new LayoutHandler.
func NewLayoutHandler(repo repository.LayoutRepository) *LayoutHandler {
	return &LayoutHandler{layoutRepo: repo}
}

// Get returns the desktop layout for the authenticated user.
// GET /api/v1/layout
func (h *LayoutHandler) Get(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	data, err := h.layoutRepo.GetLayout(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve layout"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"layout": data})
}

// Update saves the desktop layout for the authenticated user.
// PUT /api/v1/layout
func (h *LayoutHandler) Update(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid layout data"})
		return
	}

	if err := h.layoutRepo.UpsertLayout(userID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save layout"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Layout saved successfully"})
}
