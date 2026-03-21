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
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		DBDSN:     getEnv("DB_DSN", "postgres://catheadtab:secretpassword@localhost:5432/catheadtab?sslmode=disable"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-me"),
		Port:      getEnv("PORT", "8080"),
		GinMode:   getEnv("GIN_MODE", "debug"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
