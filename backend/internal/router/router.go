package router

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/CatHeadTab/backend/internal/cache"
	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/handler"
	"github.com/CatHeadTab/backend/internal/middleware"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/CatHeadTab/backend/internal/service"
)

// Setup configures all API routes and middleware.
func Setup(cfg *config.Config) *gin.Engine {
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

	// Initialize repositories
	userRepo := repository.NewUserRepository(repository.DB)
	layoutRepo := repository.NewLayoutRepository(repository.DB)
	bgRepo := repository.NewBackgroundRepository(repository.DB)
	verifyRepo := repository.NewVerificationRepository(repository.DB)
	oauthRepo := repository.NewOAuthRepository(repository.DB)

	// Initialize services
	emailService := service.NewEmailService(cfg)

	// Initialize preset repository
	presetRepo := repository.NewPresetRepository(repository.DB)

	// Initialize wallpaper service (provider-based) with two-level cache:
	// L1: in-memory (ristretto, short TTL) for all requests
	// L2: PostgreSQL (long TTL) for slow-changing sorting types (toplist, views, favorites)
	wallhavenProvider := service.NewWallhavenProvider(cfg.WallhavenAPIKey, cfg.WallhavenPurity)
	wpCacheRepo := repository.NewWallpaperCacheRepository(repository.DB)
	wpCache := cache.NewWallpaperCache(
		cache.WithTTL(cache.DefaultTTL),
		cache.WithMaxEntries(cache.DefaultMaxEntries),
		cache.WithDBStore(wpCacheRepo),
		cache.WithDBTTL(cache.DefaultDBTTL),
	)
	wallpaperSvc := service.NewWallpaperService(wpCache, wallhavenProvider)

	// Start background goroutine that extends the refresh deadline for stale
	// L2 entries that haven't been accessed recently. Entries accessed via
	// GetOrFetch are refreshed on-the-fly (compare & update); this job catches
	// entries sitting stale without being requested and keeps them alive.
	// Runs every hour, processes up to 100 stale entries per tick.
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			processed, err := wpCache.RefreshStale(wallpaperSvc.FetchFromProvider(), 100)
			if err != nil {
				log.Printf("[wallpaper-cache] refresh error: %v", err)
			} else if processed > 0 {
				log.Printf("[wallpaper-cache] refresh completed: %d stale entries processed", processed)
			}
		}
	}()

	// Initialize handlers
	authHandler := handler.NewAuthHandler(userRepo, verifyRepo, oauthRepo, emailService, cfg)
	bookmarkHandler := handler.NewBookmarkHandler(repository.NewBookmarkRepository())
	layoutHandler := handler.NewLayoutHandler(layoutRepo)
	userHandler := handler.NewUserHandler(userRepo)
	bgHandler := handler.NewBackgroundHandler(bgRepo)
	presetHandler := handler.NewPresetHandler(presetRepo)
	faviconHandler := handler.NewFaviconHandler()
	wallpaperHandler := handler.NewWallpaperHandler(wallpaperSvc)

	// Public routes (no auth) — Preset sites (available to all users)
	r.GET("/api/v1/preset-sites", presetHandler.ListAll)

	// Public routes (no auth) — Favicon proxy with disk caching
	r.GET("/api/v1/favicon", faviconHandler.Get)

	// Public routes (no auth) — Wallpaper source browsing
	r.GET("/api/v1/wallpapers/providers", wallpaperHandler.ListProviders)
	r.GET("/api/v1/wallpapers/config", wallpaperHandler.GetConfig)
	r.GET("/api/v1/wallpapers/search", wallpaperHandler.Search)
	r.GET("/api/v1/wallpapers/cache/stats", wallpaperHandler.CacheStats)

	// Public routes (no auth)
	auth := r.Group("/api/v1/auth")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/verify-email", authHandler.VerifyEmail)
		auth.POST("/forgot-password", authHandler.ForgotPassword)
		auth.POST("/reset-password", authHandler.ResetPassword)
		auth.GET("/oauth-config", authHandler.GetOAuthConfig)

		// OAuth login (public — user is not yet authenticated)
		auth.POST("/github", authHandler.GitHubLogin)
		auth.POST("/google", authHandler.GoogleLogin)
	}

	// Protected routes (JWT required)
	api := r.Group("/api/v1")
	api.Use(middleware.Auth(cfg.JWTSecret))
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
			user.POST("/background", bgHandler.Upload)
			user.GET("/background", bgHandler.Download)
			user.DELETE("/background", bgHandler.Delete)

			// Account management (authenticated)
			user.POST("/change-password", authHandler.ChangePassword)
			user.POST("/resend-verification", authHandler.ResendVerification)
			user.GET("/linked-accounts", authHandler.GetLinkedAccounts)
			user.POST("/link/github", authHandler.GitHubLinkAccount)
			user.POST("/link/google", authHandler.GoogleLinkAccount)
			user.DELETE("/link/:provider", authHandler.UnlinkAccount)
		}
	}

	return r
}
