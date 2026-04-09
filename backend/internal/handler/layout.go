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

	result, err := h.layoutRepo.GetLayout(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve layout"})
		return
	}

	resp := gin.H{"layout": result.Data}
	if result.UpdatedAt != nil {
		resp["updated_at"] = result.UpdatedAt
	}
	c.JSON(http.StatusOK, resp)
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

	updatedAt, err := h.layoutRepo.UpsertLayout(userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save layout"})
		return
	}

	resp := gin.H{"message": "Layout saved successfully"}
	if updatedAt != nil {
		resp["updated_at"] = updatedAt
	}
	c.JSON(http.StatusOK, resp)
}
