package handler

import (
	"net/http"

	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// UserHandler handles user preference operations.
type UserHandler struct {
	userRepo repository.UserRepository
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(repo repository.UserRepository) *UserHandler {
	return &UserHandler{userRepo: repo}
}

// GetPreferences returns the user's preferences.
// GET /api/v1/user/preferences
func (h *UserHandler) GetPreferences(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"preferences": user.Preferences,
	})
}

// UpdatePreferences updates the user's preferences.
// PUT /api/v1/user/preferences
func (h *UserHandler) UpdatePreferences(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.userRepo.UpdatePreferences(userID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update preferences"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Preferences updated successfully"})
}

// GetProfile returns the user's profile info.
// GET /api/v1/user/profile
func (h *UserHandler) GetProfile(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":        user.ID,
		"email":          user.Email,
		"username":       user.Username,
		"email_verified": user.EmailVerified,
		"avatar_url":     user.AvatarURL,
		"has_password":   user.PasswordHash != "",
	})
}
