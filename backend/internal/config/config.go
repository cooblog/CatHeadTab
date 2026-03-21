package config

import (
	"os"
)

// Config holds the application configuration loaded from environment variables.
type Config struct {
	DBDSN     string
	JWTSecret string
	Port      string
	GinMode   string

	// Frontend URL for building callback links (email verification, password reset)
	FrontendURL string

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
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		DBDSN:     getEnv("DB_DSN", "postgres://catheadtab:secretpassword@localhost:5432/catheadtab?sslmode=disable"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-me"),
		Port:      getEnv("PORT", "8080"),
		GinMode:   getEnv("GIN_MODE", "debug"),

		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:5173"),

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@catheadtab.com"),

		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),

		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
