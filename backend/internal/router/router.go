package router

import (
	"github.com/gin-gonic/gin"

	"github.com/CatHeadTab/backend/internal/handler"
	"github.com/CatHeadTab/backend/internal/middleware"
	"github.com/CatHeadTab/backend/internal/repository"
)

// Setup configures all API routes and middleware.
func Setup(jwtSecret string) *gin.Engine {
	r := gin.Default()

	// Global middleware
	r.Use(middleware.CORS())

	// Health check (no auth required)
	r.GET("/api/v1/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "CatHeadTab API",
			"version": "1.0.0",
		})
	})

	// Initialize handlers
	userRepo := repository.NewUserRepository(repository.DB)
	layoutRepo := repository.NewLayoutRepository(repository.DB)

	authHandler := handler.NewAuthHandler(userRepo, jwtSecret)
	bookmarkHandler := handler.NewBookmarkHandler(repository.NewBookmarkRepository())
	layoutHandler := handler.NewLayoutHandler(layoutRepo)
	userHandler := handler.NewUserHandler(userRepo)

	// Public routes (no auth)
	auth := r.Group("/api/v1/auth")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/github", authHandler.GitHubLogin)
		auth.POST("/google", authHandler.GoogleLogin)
	}

	// Protected routes (JWT required)
	api := r.Group("/api/v1")
	api.Use(middleware.Auth(jwtSecret))
	{
		// Bookmarks
		bookmarks := api.Group("/bookmarks")
		{
			bookmarks.GET("", bookmarkHandler.List)
			bookmarks.POST("", bookmarkHandler.Create)
			bookmarks.PUT("/:id", bookmarkHandler.Update)
			bookmarks.DELETE("/:id", bookmarkHandler.Delete)
			bookmarks.POST("/sync", bookmarkHandler.Sync)
		}

		// Desktop Layout
		api.GET("/layout", layoutHandler.Get)
		api.PUT("/layout", layoutHandler.Update)

		// User
		user := api.Group("/user")
		{
			user.GET("/profile", userHandler.GetProfile)
			user.GET("/preferences", userHandler.GetPreferences)
			user.PUT("/preferences", userHandler.UpdatePreferences)
		}
	}

	return r
}
