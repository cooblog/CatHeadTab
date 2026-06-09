package handler

import (
	"errors"
	"net/http"
	"unicode/utf8"

	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const maxStickyNoteContentLength = 1000

var errStickyNoteContentTooLong = errors.New("sticky note content exceeds 1000 characters")

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
	if err := validateStickyNoteContentLimit(req); err != nil {
		if errors.Is(err, errStickyNoteContentTooLong) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Sticky note content must be 1000 characters or fewer"})
			return
		}
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

func validateStickyNoteContentLimit(value interface{}) error {
	return validateStickyNoteContentLimitWithWidgetType(value, "")
}

func validateStickyNoteContentLimitWithWidgetType(value interface{}, fallbackWidgetType string) error {
	switch v := value.(type) {
	case map[string]interface{}:
		widgetType := fallbackWidgetType
		if currentWidgetType, _ := v["widgetType"].(string); currentWidgetType != "" {
			widgetType = currentWidgetType
		}
		if widgetType == "stickyNote" {
			if content, ok := v["content"].(string); ok && utf8.RuneCountInString(content) > maxStickyNoteContentLength {
				return errStickyNoteContentTooLong
			}
		}
		for key, child := range v {
			childFallbackWidgetType := ""
			if key == "widgetConfig" {
				childFallbackWidgetType = widgetType
			}
			if err := validateStickyNoteContentLimitWithWidgetType(child, childFallbackWidgetType); err != nil {
				return err
			}
		}
	case []interface{}:
		for _, child := range v {
			if err := validateStickyNoteContentLimitWithWidgetType(child, ""); err != nil {
				return err
			}
		}
	}
	return nil
}
