package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
)

// APIAccessStats records aggregated request counts for API routes.
func APIAccessStats(repo repository.APIAccessStatsRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if repo == nil || c.Request == nil || !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			return
		}

		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}

		stat := repository.APIAccessStatInput{
			Method:     c.Request.Method,
			Path:       path,
			StatusCode: c.Writer.Status(),
		}

		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			if err := repo.Increment(ctx, stat); err != nil {
				logger.Warn("failed to record api access stats", "error", err)
			}
		}()
	}
}
