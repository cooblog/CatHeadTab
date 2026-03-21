package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/CatHeadTab/backend/internal/router"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Set Gin mode
	gin.SetMode(cfg.GinMode)

	// Connect to database
	if err := repository.Connect(cfg.DBDSN); err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	defer repository.Close()

	// Run migrations
	// Determine migrations directory relative to executable
	execPath, err := os.Executable()
	if err != nil {
		log.Printf("⚠️  Could not determine executable path: %v", err)
	}
	migrationsDir := filepath.Join(filepath.Dir(execPath), "migrations")

	// Also check relative to working directory (for development)
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		migrationsDir = "migrations"
	}

	if _, err := os.Stat(migrationsDir); err == nil {
		if err := repository.RunMigrations(migrationsDir); err != nil {
			log.Fatalf("❌ Failed to run migrations: %v", err)
		}
	} else {
		log.Printf("⚠️  Migrations directory not found, skipping: %s", migrationsDir)
	}

	// Setup router
	r := router.Setup(cfg)

	// Start server
	addr := ":" + cfg.Port
	log.Printf("🚀 CatHeadTab API server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}
