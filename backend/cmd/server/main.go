package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/CatHeadTab/backend/internal/router"
)

func main() {
	// If a subcommand is provided, dispatch to it; otherwise start the server.
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "user":
			handleUserCommand(os.Args[2:])
			return
		case "serve":
			// Explicit serve subcommand — fall through to server startup.
		default:
			printUsage()
			os.Exit(1)
		}
	}

	runServer()
}

// printUsage prints general CLI usage information.
func printUsage() {
	fmt.Println(`CatHeadTab Server

Usage:
  catheadtab [command]

Available Commands:
  serve                        Start the API server (default)
  user create                  Create a new user interactively
  user reset-password          Reset a user's password interactively
  user set-role                Change an existing user's role

If no command is specified, the server starts by default.`)
}

// printUserUsage prints usage for the "user" subcommand.
func printUserUsage() {
	fmt.Println(`Usage:
  catheadtab user <action>

Available Actions:
  create           Create a new user
  reset-password   Reset an existing user's password
  set-role         Change an existing user's role`)
}

// handleUserCommand dispatches user management subcommands.
func handleUserCommand(args []string) {
	if len(args) == 0 {
		printUserUsage()
		os.Exit(1)
	}

	// 加载配置并初始化日志和数据库连接（CLI 命令只需要数据库连接，不执行 migration）
	cfg := config.Load()
	logger.Init(logger.Config{
		Level:      cfg.LogLevel,
		FilePath:   cfg.LogFile,
		MaxSize:    cfg.LogMaxSize,
		MaxAge:     cfg.LogMaxAge,
		MaxBackups: cfg.LogMaxBackups,
		Compress:   cfg.LogCompress,
	})
	defer logger.Sync()

	if err := repository.Connect(cfg.DBDSN); err != nil {
		logger.Fatal("Failed to connect to database", "error", err)
	}
	defer repository.Close()

	switch args[0] {
	case "create":
		cmdUserCreate()
	case "reset-password":
		cmdUserResetPassword()
	case "set-role":
		cmdUserSetRole()
	default:
		printUserUsage()
		os.Exit(1)
	}
}

// cmdUserCreate interactively creates a new user.
func cmdUserCreate() {
	reader := bufio.NewReader(os.Stdin)

	username := promptInput(reader, "Username: ")
	if username == "" {
		logger.Fatal("Username is required")
	}

	email := promptInput(reader, "Email: ")
	if email == "" {
		logger.Fatal("Email is required")
	}

	password := promptInput(reader, "Password (min 6 chars): ")
	if len(password) < 6 {
		logger.Fatal("Password must be at least 6 characters")
	}

	// Check for duplicate username / email
	userRepo := repository.NewUserRepository(repository.DB)

	existing, err := userRepo.GetByUsername(username)
	if err != nil {
		logger.Fatal("Failed to check username", "error", err)
	}
	if existing != nil {
		logger.Fatal("Username already exists", "username", username)
	}

	existing, err = userRepo.GetByEmail(email)
	if err != nil {
		logger.Fatal("Failed to check email", "error", err)
	}
	if existing != nil {
		logger.Fatal("Email already exists", "email", email)
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		logger.Fatal("Failed to hash password", "error", err)
	}

	user := &model.User{
		Username:      username,
		Email:         email,
		PasswordHash:  string(hashedPassword),
		EmailVerified: true, // Admin-created users are pre-verified
		Role:          model.RoleAdmin, // CLI-created users are admins
	}

	if err := userRepo.Create(user); err != nil {
		logger.Fatal("Failed to create user", "error", err)
	}

	fmt.Printf("✅ User created successfully!\n")
	fmt.Printf("   ID:       %s\n", user.ID)
	fmt.Printf("   Username: %s\n", user.Username)
	fmt.Printf("   Email:    %s\n", user.Email)
}

// cmdUserResetPassword interactively resets a user's password.
func cmdUserResetPassword() {
	reader := bufio.NewReader(os.Stdin)

	identifier := promptInput(reader, "Username or Email: ")
	if identifier == "" {
		logger.Fatal("Username or email is required")
	}

	userRepo := repository.NewUserRepository(repository.DB)

	// Try to find the user by username first, then by email
	user, err := userRepo.GetByUsername(identifier)
	if err != nil {
		logger.Fatal("Failed to query user", "error", err)
	}
	if user == nil {
		user, err = userRepo.GetByEmail(identifier)
		if err != nil {
			logger.Fatal("Failed to query user", "error", err)
		}
	}
	if user == nil {
		logger.Fatal("User not found", "identifier", identifier)
	}

	fmt.Printf("   Found user: %s (%s)\n", user.Username, user.Email)

	newPassword := promptInput(reader, "New Password (min 6 chars): ")
	if len(newPassword) < 6 {
		logger.Fatal("Password must be at least 6 characters")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		logger.Fatal("Failed to hash password", "error", err)
	}

	if err := userRepo.UpdatePassword(user.ID, string(hashedPassword)); err != nil {
		logger.Fatal("Failed to update password", "error", err)
	}

	fmt.Printf("✅ Password updated successfully for user %q\n", user.Username)
}

// cmdUserSetRole interactively changes a user's role.
func cmdUserSetRole() {
	reader := bufio.NewReader(os.Stdin)

	identifier := promptInput(reader, "Username or Email: ")
	if identifier == "" {
		logger.Fatal("Username or email is required")
	}

	userRepo := repository.NewUserRepository(repository.DB)

	// Try to find the user by username first, then by email
	user, err := userRepo.GetByUsername(identifier)
	if err != nil {
		logger.Fatal("Failed to query user", "error", err)
	}
	if user == nil {
		user, err = userRepo.GetByEmail(identifier)
		if err != nil {
			logger.Fatal("Failed to query user", "error", err)
		}
	}
	if user == nil {
		logger.Fatal("User not found", "identifier", identifier)
	}

	fmt.Printf("   Found user: %s (%s)\n", user.Username, user.Email)
	fmt.Printf("   Current role: %s\n", user.Role)

	// Build a list of valid roles for display
	validRoles := make([]string, 0, len(model.ValidRoles))
	for r := range model.ValidRoles {
		validRoles = append(validRoles, string(r))
	}
	fmt.Printf("   Available roles: %s\n", strings.Join(validRoles, ", "))

	newRole := promptInput(reader, "New role: ")
	if newRole == "" {
		logger.Fatal("Role is required")
	}

	role := model.UserRole(newRole)
	if !model.ValidRoles[role] {
		logger.Fatal("Invalid role", "role", newRole, "validRoles", strings.Join(validRoles, ", "))
	}

	if user.Role == role {
		fmt.Printf("ℹ️  User %q already has role %q, no change needed\n", user.Username, role)
		return
	}

	if err := userRepo.UpdateRole(user.ID, role); err != nil {
		logger.Fatal("Failed to update role", "error", err)
	}

	fmt.Printf("✅ Role updated: %s → %s (user: %s)\n", user.Role, role, user.Username)
}

// promptInput prints a prompt and reads a line of input from the reader.
func promptInput(reader *bufio.Reader, prompt string) string {
	fmt.Print(prompt)
	input, _ := reader.ReadString('\n')
	return strings.TrimSpace(input)
}

// runServer starts the HTTP API server.
func runServer() {
	cfg := config.Load()

	// 初始化日志系统
	logger.Init(logger.Config{
		Level:      cfg.LogLevel,
		FilePath:   cfg.LogFile,
		MaxSize:    cfg.LogMaxSize,
		MaxAge:     cfg.LogMaxAge,
		MaxBackups: cfg.LogMaxBackups,
		Compress:   cfg.LogCompress,
	})
	defer logger.Sync()

	gin.SetMode(cfg.GinMode)

	if err := repository.Connect(cfg.DBDSN); err != nil {
		logger.Fatal("Failed to connect to database", "error", err)
	}
	defer repository.Close()

	runMigrations()

	r := router.Setup(cfg)

	addr := ":" + cfg.Port
	logger.Info("CatHeadTab API server starting", "addr", addr)
	if err := r.Run(addr); err != nil {
		logger.Fatal("Failed to start server", "error", err)
	}
}

// runMigrations applies database migrations if the migrations directory is found.
func runMigrations() {
	execPath, err := os.Executable()
	if err != nil {
		logger.Warn("Could not determine executable path", "error", err)
	}
	migrationsDir := filepath.Join(filepath.Dir(execPath), "migrations")

	// Also check relative to working directory (for development)
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		migrationsDir = "migrations"
	}

	if _, err := os.Stat(migrationsDir); err == nil {
		if err := repository.RunMigrations(migrationsDir); err != nil {
			logger.Fatal("Failed to run migrations", "error", err)
		}
	} else {
		logger.Warn("Migrations directory not found, skipping", "path", migrationsDir)
	}
}
