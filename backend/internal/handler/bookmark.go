package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"
)

// BookmarkHandler handles bookmark CRUD operations.
type BookmarkHandler struct {
	repo *repository.BookmarkRepository
}

// NewBookmarkHandler creates a new BookmarkHandler.
func NewBookmarkHandler(repo *repository.BookmarkRepository) *BookmarkHandler {
	return &BookmarkHandler{repo: repo}
}

// Request models
type createBookmarkReq struct {
	Title     string     `json:"title" binding:"required"`
	URL       string     `json:"url"`
	ParentID  *uuid.UUID `json:"parent_id"`
	IsFolder  bool       `json:"is_folder"`
	SortOrder int        `json:"sort_order"`
}

type updateBookmarkReq struct {
	Title     string `json:"title" binding:"required"`
	URL       string `json:"url"`
	SortOrder int    `json:"sort_order"`
}

// List returns all bookmarks for the authenticated user.
// GET /api/v1/bookmarks
func (h *BookmarkHandler) List(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
		return
	}

	bookmarks, err := h.repo.List(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list bookmarks"})
		return
	}

	if bookmarks == nil {
		bookmarks = []model.Bookmark{}
	}

	c.JSON(http.StatusOK, bookmarks)
}

// Create adds a new bookmark or folder.
// POST /api/v1/bookmarks
func (h *BookmarkHandler) Create(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
		return
	}

	var req createBookmarkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	b := &model.Bookmark{
		UserID:    userID,
		Title:     req.Title,
		URL:       req.URL,
		IsFolder:  req.IsFolder,
		SortOrder: req.SortOrder,
	}

	if err := h.repo.Create(b, req.ParentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, b)
}

// Update modifies an existing bookmark.
// PUT /api/v1/bookmarks/:id
func (h *BookmarkHandler) Update(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
		return
	}

	bookmarkID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid bookmark ID"})
		return
	}

	var req updateBookmarkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	b := &model.Bookmark{
		ID:        bookmarkID,
		UserID:    userID,
		Title:     req.Title,
		URL:       req.URL,
		SortOrder: req.SortOrder,
	}

	if err := h.repo.Update(b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, b)
}

// Delete removes a bookmark or folder.
// DELETE /api/v1/bookmarks/:id
func (h *BookmarkHandler) Delete(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
		return
	}

	bookmarkID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid bookmark ID"})
		return
	}

	if err := h.repo.Delete(bookmarkID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Deleted successfully"})
}

// Sync handles incremental bookmark sync from browser extension.
// POST /api/v1/bookmarks/sync
func (h *BookmarkHandler) Sync(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"message": "Bookmark sync - coming soon",
	})
}
