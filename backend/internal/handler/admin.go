package handler

import (
	"net/http"

	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
)

// AdminHandler handles admin-only operational endpoints.
type AdminHandler struct {
	dashboardRepo repository.AdminDashboardRepository
}

// NewAdminHandler creates an AdminHandler.
func NewAdminHandler(dashboardRepo repository.AdminDashboardRepository) *AdminHandler {
	return &AdminHandler{dashboardRepo: dashboardRepo}
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

	c.JSON(http.StatusOK, dashboard)
}
