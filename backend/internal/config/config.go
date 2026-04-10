package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds the application configuration loaded from environment variables.
type Config struct {
	DBDSN     string
	JWTSecret string
	Port      string
	GinMode   string

	// Frontend URL for building callback links (email verification, password reset)
	FrontendURL string

	// BackendURL is the externally accessible base URL of this backend server.
	// Used as the OAuth redirect_uri so that GitHub/Google always callback to
	// the backend regardless of where the frontend is hosted (web or extension).
	BackendURL string

	// SMTP email settings
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string

	// GitHub OAuth
	GitHubClientID     string
	GitHubClientSecret string

	// Google OAuth
	GoogleClientID     string
	GoogleClientSecret string

	// Wallpaper source: Wallhaven
	WallhavenAPIKey string
	// WallhavenPurity controls the allowed purity levels for wallhaven results.
	// Comma-separated values: "sfw", "sketchy". Default: "sfw".
	// "sketchy" requires a valid API key to work on wallhaven.cc.
	WallhavenPurity string

	// Wallpaper source: Tencent Cloud COS (Cloud Object Storage)
	// When all four fields are set, the COS wallpaper provider becomes available.
	COSSecretID  string
	COSSecretKey string
	COSBucket    string
	COSRegion    string
	// COSOriginalPrefix is the key prefix for full-size wallpaper images (e.g. "0000-c/").
	COSOriginalPrefix string
	// COSThumbPrefix is the key prefix for thumbnail images (e.g. "0000-s/").
	// Thumbnail filenames must match the originals exactly.
	COSThumbPrefix string

	// Token TTL settings
	// EmailVerifyTokenTTL controls how long email verification tokens remain valid.
	EmailVerifyTokenTTL time.Duration
	// PasswordResetTokenTTL controls how long password reset tokens remain valid.
	PasswordResetTokenTTL time.Duration
	// JWTTokenTTL controls how long JWT login tokens remain valid.
	JWTTokenTTL time.Duration
	// TokenCleanupInterval controls how often expired tokens are purged from the database.
	TokenCleanupInterval time.Duration
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		DBDSN:     getEnv("DB_DSN", "postgres://catheadtab:secretpassword@localhost:5432/catheadtab?sslmode=disable"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-me"),
		Port:      getEnv("PORT", "8080"),
		GinMode:   getEnv("GIN_MODE", "debug"),

		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:5173"),
		BackendURL:  getEnv("BACKEND_URL", ""),

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@catheadtab.com"),

		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),

		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),

		WallhavenAPIKey: getEnv("WALLHAVEN_API_KEY", ""),
		WallhavenPurity: getEnv("WALLHAVEN_PURITY", "sfw"),

		COSSecretID:       getEnv("COS_SECRET_ID", ""),
		COSSecretKey:      getEnv("COS_SECRET_KEY", ""),
		COSBucket:         getEnv("COS_BUCKET", ""),
		COSRegion:         getEnv("COS_REGION", ""),
		COSOriginalPrefix: getEnv("COS_ORIGINAL_PREFIX", ""),
		COSThumbPrefix:    getEnv("COS_THUMB_PREFIX", ""),

		EmailVerifyTokenTTL:   getDurationEnv("EMAIL_VERIFY_TOKEN_TTL_HOURS", 24) * time.Hour,
		PasswordResetTokenTTL: getDurationEnv("PASSWORD_RESET_TOKEN_TTL_HOURS", 1) * time.Hour,
		JWTTokenTTL:           getDurationEnv("JWT_TOKEN_TTL_DAYS", 30) * 24 * time.Hour,
		TokenCleanupInterval:  getDurationEnv("TOKEN_CLEANUP_INTERVAL_HOURS", 6) * time.Hour,
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// GetBackendURL returns the externally accessible base URL of the backend.
// If BACKEND_URL is not explicitly set, it falls back to http://localhost:{Port}.
func (c *Config) GetBackendURL() string {
	if c.BackendURL != "" {
		return c.BackendURL
	}
	return "http://localhost:" + c.Port
}

// getDurationEnv reads an integer from the environment variable identified by
// key and returns it as a time.Duration. If the variable is not set or cannot
// be parsed, fallback is returned.
func getDurationEnv(key string, fallback int) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return time.Duration(fallback)
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return time.Duration(fallback)
	}
	return time.Duration(n)
}
