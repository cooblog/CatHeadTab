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

	// Start background goroutine to periodically clean up expired tokens
	// (email verifications and used/expired password resets).
	go func() {
		ticker := time.NewTicker(cfg.TokenCleanupInterval)
		defer ticker.Stop()
		for range ticker.C {
			deleted, err := verifyRepo.CleanupExpiredTokens()
			if err != nil {
				log.Printf("[token-cleanup] error: %v", err)
			} else if deleted > 0 {
				log.Printf("[token-cleanup] removed %d expired token(s)", deleted)
			}
		}
	}()

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
	faviconHandler := handler.NewFaviconHandler(presetRepo)
	wallpaperHandler := handler.NewWallpaperHandler(wallpaperSvc)

	// Rate limiter for email-sending endpoints (1 request per 60 seconds per IP)
	emailRateLimiter := middleware.NewRateLimiter(60 * time.Second)

	// Public routes (no auth) — Preset sites (available to all users)
	r.GET("/api/v1/preset-sites", presetHandler.ListAll)                       // Legacy: returns everything
	r.GET("/api/v1/preset-sites/search", presetHandler.SearchSites)            // New: search sites by keyword
	r.GET("/api/v1/preset-categories", presetHandler.ListCategories)            // New: categories with site count
	r.GET("/api/v1/preset-categories/:id/sites", presetHandler.ListSitesByCategory) // New: sites for one category

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
		auth.POST("/forgot-password", middleware.EmailRateLimit(emailRateLimiter), authHandler.ForgotPassword)
		auth.POST("/reset-password", authHandler.ResetPassword)
		auth.GET("/oauth-config", authHandler.GetOAuthConfig)
		auth.POST("/resend-verification", middleware.EmailRateLimit(emailRateLimiter), authHandler.ResendVerificationPublic)

		// OAuth login (public — user is not yet authenticated)
		auth.POST("/github", authHandler.GitHubLogin)
		auth.POST("/google", authHandler.GoogleLogin)
		// OAuth callback endpoints (GitHub/Google redirect here after authorization)
		auth.GET("/callback/github", authHandler.GitHubOAuthCallback)
		auth.GET("/callback/google", authHandler.GoogleOAuthCallback)
	}

	// Protected routes (JWT required)
	api := r.Group("/api/v1")
	api.Use(middleware.Auth(cfg.JWTSecret))
	{
		// User profile & preferences (no email verification required — users
		// need to see their profile to trigger verification from the UI)
		user := api.Group("/user")
		{
			user.GET("/profile", userHandler.GetProfile)
			user.GET("/preferences", userHandler.GetPreferences)
			user.PUT("/preferences", userHandler.UpdatePreferences)

			// Account management (authenticated, no verification required)
			user.POST("/change-password", authHandler.ChangePassword)
			user.POST("/resend-verification", middleware.EmailRateLimit(emailRateLimiter), authHandler.ResendVerification)
			user.GET("/linked-accounts", authHandler.GetLinkedAccounts)
			user.POST("/link/github", authHandler.GitHubLinkAccount)
			user.POST("/link/google", authHandler.GoogleLinkAccount)
			user.DELETE("/link/:provider", authHandler.UnlinkAccount)
		}

		// Routes below require verified email
		verified := api.Group("")
		verified.Use(middleware.RequireVerified(userRepo))
		{
			// Bookmarks
			bookmarks := verified.Group("/bookmarks")
			{
				bookmarks.GET("", bookmarkHandler.List)
				bookmarks.POST("", bookmarkHandler.Create)
				bookmarks.PUT("/:id", bookmarkHandler.Update)
				bookmarks.DELETE("/:id", bookmarkHandler.Delete)
				bookmarks.POST("/sync", bookmarkHandler.Sync)
			}

			// Desktop Layout
			verified.GET("/layout", layoutHandler.Get)
			verified.PUT("/layout", layoutHandler.Update)

			// Background (upload/download/delete)
			verified.POST("/user/background", bgHandler.Upload)
			verified.GET("/user/background", bgHandler.Download)
			verified.DELETE("/user/background", bgHandler.Delete)
		}
	}

	return r
}
