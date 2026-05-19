package handler

import (
	"net/http"

	"github.com/CatHeadTab/backend/internal/cache"
	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/CatHeadTab/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// AdminHandler handles admin-only operational endpoints.
type AdminHandler struct {
	dashboardRepo repository.AdminDashboardRepository
	wallpaperSvc  *service.WallpaperService
}

// AdminCacheStats wraps runtime cache statistics for admin dashboard responses.
type AdminCacheStats struct {
	Enabled bool              `json:"enabled"`
	Stats   *cache.CacheStats `json:"stats,omitempty"`
	Message string            `json:"message,omitempty"`
}

// AdminDashboardResponse combines database aggregates with runtime-only metrics.
type AdminDashboardResponse struct {
	*repository.AdminDashboard
	WallpaperCacheRuntime AdminCacheStats `json:"wallpaper_cache_runtime"`
}

// NewAdminHandler creates an AdminHandler.
func NewAdminHandler(dashboardRepo repository.AdminDashboardRepository, wallpaperSvc *service.WallpaperService) *AdminHandler {
	return &AdminHandler{dashboardRepo: dashboardRepo, wallpaperSvc: wallpaperSvc}
}

// GetDashboard returns aggregated data for the admin dashboard.
// GET /api/v1/admin/dashboard
func (h *AdminHandler) GetDashboard(c *gin.Context) {
	dashboard, err := h.dashboardRepo.GetDashboard(c.Request.Context())
	if err != nil {
		logger.Error("failed to load admin dashboard", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load dashboard"})
		return
	}

	c.JSON(http.StatusOK, AdminDashboardResponse{
		AdminDashboard:        dashboard,
		WallpaperCacheRuntime: h.wallpaperCacheStats(),
	})
}

func (h *AdminHandler) wallpaperCacheStats() AdminCacheStats {
	if h.wallpaperSvc == nil {
		return AdminCacheStats{
			Enabled: false,
			Message: "wallpaper service is not available",
		}
	}

	stats := h.wallpaperSvc.CacheStats()
	if stats == nil {
		return AdminCacheStats{
			Enabled: false,
			Message: "cache is not enabled",
		}
	}

	return AdminCacheStats{
		Enabled: true,
		Stats:   stats,
	}
}
