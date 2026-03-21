package handler

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	// maxUploadSize is the maximum allowed upload size (5 MB).
	// Frontend should compress to WebP before uploading; this is the hard limit.
	maxUploadSize = 5 << 20
)

// BackgroundHandler handles user background image upload and download.
type BackgroundHandler struct {
	bgRepo repository.BackgroundRepository
}

// NewBackgroundHandler creates a new BackgroundHandler.
func NewBackgroundHandler(repo repository.BackgroundRepository) *BackgroundHandler {
	return &BackgroundHandler{bgRepo: repo}
}

// Upload handles background image upload.
// POST /api/v1/user/background
// Accepts multipart/form-data with field "image" or raw binary body with Content-Type header.
func (h *BackgroundHandler) Upload(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	// Limit request body size
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize)

	var imageData []byte
	var contentType string

	// Try multipart form first
	file, header, err := c.Request.FormFile("image")
	if err == nil {
		defer file.Close()

		// Validate file size
		if header.Size > maxUploadSize {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("file too large: %d bytes, max allowed: %d bytes", header.Size, maxUploadSize),
			})
			return
		}

		imageData, err = io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read uploaded file"})
			return
		}
		contentType = header.Header.Get("Content-Type")
	} else {
		// Fallback: read raw body (for binary uploads with Content-Type header)
		imageData, err = io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}
		contentType = c.ContentType()
	}

	if len(imageData) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty image data"})
		return
	}

	// Validate content type
	if contentType == "" {
		contentType = http.DetectContentType(imageData)
	}

	allowedTypes := map[string]bool{
		"image/webp": true,
		"image/jpeg": true,
		"image/png":  true,
		"image/gif":  true,
	}
	if !allowedTypes[contentType] {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("unsupported content type: %s, allowed: image/webp, image/jpeg, image/png, image/gif", contentType),
		})
		return
	}

	if err := h.bgRepo.Upsert(userID, imageData, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save background image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Background image uploaded successfully",
		"file_size":    len(imageData),
		"content_type": contentType,
	})
}

// Download serves the user's background image as binary.
// GET /api/v1/user/background
func (h *BackgroundHandler) Download(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	bg, err := h.bgRepo.GetByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve background image"})
		return
	}
	if bg == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no background image found"})
		return
	}

	// Set cache headers (1 hour)
	c.Header("Cache-Control", "private, max-age=3600")
	c.Header("Last-Modified", bg.UpdatedAt.UTC().Format(time.RFC1123))
	c.Header("Content-Length", fmt.Sprintf("%d", bg.FileSize))

	c.Data(http.StatusOK, bg.ContentType, bg.ImageData)
}

// Delete removes the user's background image.
// DELETE /api/v1/user/background
func (h *BackgroundHandler) Delete(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	if err := h.bgRepo.DeleteByUserID(userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete background image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Background image deleted successfully"})
}
