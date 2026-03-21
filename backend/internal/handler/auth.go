package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/CatHeadTab/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	userRepo     repository.UserRepository
	verifyRepo   repository.VerificationRepository
	oauthRepo    repository.OAuthRepository
	emailService *service.EmailService
	cfg          *config.Config
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(
	userRepo repository.UserRepository,
	verifyRepo repository.VerificationRepository,
	oauthRepo repository.OAuthRepository,
	emailService *service.EmailService,
	cfg *config.Config,
) *AuthHandler {
	return &AuthHandler{
		userRepo:     userRepo,
		verifyRepo:   verifyRepo,
		oauthRepo:    oauthRepo,
		emailService: emailService,
		cfg:          cfg,
	}
}

// RegisterInput represents the registration request body.
type RegisterInput struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

// Register handles user registration.
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if user, _ := h.userRepo.GetByEmail(input.Email); user != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already in use"})
		return
	}
	if user, _ := h.userRepo.GetByUsername(input.Username); user != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already taken"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	newUser := &model.User{
		Email:        input.Email,
		Username:     input.Username,
		PasswordHash: string(hashedPassword),
	}

	if err := h.userRepo.Create(newUser); err != nil {
		fmt.Println("DB Create Error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Send verification email
	verification, err := h.verifyRepo.CreateEmailVerification(newUser.ID)
	if err == nil && verification != nil {
		_ = h.emailService.SendVerificationEmail(newUser.Email, verification.Token)
	}

	token, err := h.generateToken(newUser.ID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user": gin.H{
			"id":             newUser.ID,
			"username":       newUser.Username,
			"email":          newUser.Email,
			"email_verified": newUser.EmailVerified,
		},
	})
}

// LoginInput represents the login request body.
type LoginInput struct {
	Identifier string `json:"identifier" binding:"required"`
	Password   string `json:"password" binding:"required"`
}

// Login handles user login.
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.GetByEmail(input.Identifier)
	if user == nil {
		user, err = h.userRepo.GetByUsername(input.Identifier)
	}

	if user == nil || err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email/username or password"})
		return
	}

	if user.PasswordHash == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "This account uses SSO login. Please sign in with GitHub or Google"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email/username or password"})
		return
	}

	token, err := h.generateToken(user.ID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":             user.ID,
			"username":       user.Username,
			"email":          user.Email,
			"email_verified": user.EmailVerified,
		},
	})
}

// VerifyEmail validates the email verification token.
// POST /api/v1/auth/verify-email
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var input struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	verification, err := h.verifyRepo.GetEmailVerification(input.Token)
	if err != nil || verification == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired verification token"})
		return
	}

	if err := h.userRepo.SetEmailVerified(verification.UserID, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify email"})
		return
	}

	_ = h.verifyRepo.DeleteEmailVerifications(verification.UserID)

	c.JSON(http.StatusOK, gin.H{"message": "Email verified successfully"})
}

// ResendVerification resends the email verification link.
// POST /api/v1/auth/resend-verification
func (h *AuthHandler) ResendVerification(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if user.EmailVerified {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email already verified"})
		return
	}

	verification, err := h.verifyRepo.CreateEmailVerification(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create verification token"})
		return
	}

	if err := h.emailService.SendVerificationEmail(user.Email, verification.Token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send verification email"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Verification email sent"})
}

// ForgotPasswordInput represents the forgot password request body.
type ForgotPasswordInput struct {
	Email string `json:"email" binding:"required,email"`
}

// ForgotPassword sends a password reset email.
// POST /api/v1/auth/forgot-password
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var input ForgotPasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Always return success to prevent email enumeration
	user, _ := h.userRepo.GetByEmail(input.Email)
	if user == nil {
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with that email, a reset link has been sent"})
		return
	}

	reset, err := h.verifyRepo.CreatePasswordReset(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create reset token"})
		return
	}

	_ = h.emailService.SendPasswordResetEmail(user.Email, reset.Token)

	c.JSON(http.StatusOK, gin.H{"message": "If an account exists with that email, a reset link has been sent"})
}

// ResetPasswordInput represents the password reset request body.
type ResetPasswordInput struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ResetPassword resets user password with a valid token.
// POST /api/v1/auth/reset-password
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var input ResetPasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reset, err := h.verifyRepo.GetPasswordReset(input.Token)
	if err != nil || reset == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired reset token"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := h.userRepo.UpdatePassword(reset.UserID, string(hashedPassword)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	_ = h.verifyRepo.MarkPasswordResetUsed(input.Token)

	c.JSON(http.StatusOK, gin.H{"message": "Password reset successfully"})
}

// ChangePasswordInput represents the change password request body.
type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=6"`
}

// ChangePassword changes the logged-in user's password.
// POST /api/v1/user/change-password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var input ChangePasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if user.PasswordHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This account uses SSO login and has no password set"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := h.userRepo.UpdatePassword(userID, string(hashedPassword)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

// ---- GitHub OAuth ----

// GitHubLogin handles GitHub OAuth callback.
// POST /api/v1/auth/github
func (h *AuthHandler) GitHubLogin(c *gin.Context) {
	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.cfg.GitHubClientID == "" || h.cfg.GitHubClientSecret == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "GitHub OAuth not configured"})
		return
	}

	// Exchange code for access token
	accessToken, err := h.exchangeGitHubCode(input.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with GitHub"})
		return
	}

	// Get GitHub user info
	ghUser, err := h.getGitHubUser(accessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub user info"})
		return
	}

	h.handleOAuthLogin(c, "github", ghUser.ID, ghUser.Email, ghUser.Login, ghUser.AvatarURL, accessToken, "")
}

// GitHubLinkAccount links GitHub to an existing logged-in user.
// POST /api/v1/user/link/github
func (h *AuthHandler) GitHubLinkAccount(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accessToken, err := h.exchangeGitHubCode(input.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with GitHub"})
		return
	}

	ghUser, err := h.getGitHubUser(accessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub user info"})
		return
	}

	h.linkOAuthAccount(c, userID, "github", ghUser.ID, ghUser.Email, ghUser.Login, ghUser.AvatarURL, accessToken, "")
}

// ---- Google OAuth ----

// GoogleLogin handles Google OAuth callback.
// POST /api/v1/auth/google
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.cfg.GoogleClientID == "" || h.cfg.GoogleClientSecret == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Google OAuth not configured"})
		return
	}

	accessToken, err := h.exchangeGoogleCode(input.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with Google"})
		return
	}

	gUser, err := h.getGoogleUser(accessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get Google user info"})
		return
	}

	h.handleOAuthLogin(c, "google", gUser.ID, gUser.Email, gUser.Name, gUser.Picture, accessToken, "")
}

// GoogleLinkAccount links Google to an existing logged-in user.
// POST /api/v1/user/link/google
func (h *AuthHandler) GoogleLinkAccount(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accessToken, err := h.exchangeGoogleCode(input.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with Google"})
		return
	}

	gUser, err := h.getGoogleUser(accessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get Google user info"})
		return
	}

	h.linkOAuthAccount(c, userID, "google", gUser.ID, gUser.Email, gUser.Name, gUser.Picture, accessToken, "")
}

// GetLinkedAccounts returns the user's linked OAuth accounts.
// GET /api/v1/user/linked-accounts
func (h *AuthHandler) GetLinkedAccounts(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	accounts, err := h.oauthRepo.ListByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get linked accounts"})
		return
	}

	result := make([]gin.H, 0, len(accounts))
	for _, a := range accounts {
		result = append(result, gin.H{
			"provider":          a.Provider,
			"provider_username": a.ProviderUsername,
			"provider_email":    a.ProviderEmail,
			"avatar_url":        a.AvatarURL,
			"linked_at":         a.LinkedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"accounts": result})
}

// UnlinkAccount removes a linked OAuth provider.
// DELETE /api/v1/user/link/:provider
func (h *AuthHandler) UnlinkAccount(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)
	provider := c.Param("provider")

	// Ensure user has a password or at least one other linked account before unlinking
	user, _ := h.userRepo.GetByID(userID)
	accounts, _ := h.oauthRepo.ListByUserID(userID)

	hasPassword := user != nil && user.PasswordHash != ""
	otherAccounts := 0
	for _, a := range accounts {
		if a.Provider != provider {
			otherAccounts++
		}
	}

	if !hasPassword && otherAccounts == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot unlink the only login method. Set a password first"})
		return
	}

	if err := h.oauthRepo.Delete(userID, provider); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlink account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s account unlinked", provider)})
}

// GetOAuthConfig returns the configured OAuth client IDs for the frontend.
// GET /api/v1/auth/oauth-config
func (h *AuthHandler) GetOAuthConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"github_client_id": h.cfg.GitHubClientID,
		"google_client_id": h.cfg.GoogleClientID,
	})
}

// ---- Shared OAuth logic ----

func (h *AuthHandler) handleOAuthLogin(c *gin.Context, provider, providerUserID, email, username, avatarURL, accessToken, refreshToken string) {
	// Check if this OAuth account is already linked
	existing, _ := h.oauthRepo.GetByProviderAndID(provider, providerUserID)
	if existing != nil {
		// User exists — log in
		_ = h.oauthRepo.UpdateTokens(existing.ID, accessToken, refreshToken)

		user, _ := h.userRepo.GetByID(existing.UserID)
		if user == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Linked user not found"})
			return
		}

		token, err := h.generateToken(user.ID.String())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token": token,
			"user": gin.H{
				"id":             user.ID,
				"username":       user.Username,
				"email":          user.Email,
				"email_verified": user.EmailVerified,
				"avatar_url":     user.AvatarURL,
			},
		})
		return
	}

	// Check if user exists with this email
	var user *model.User
	if email != "" {
		user, _ = h.userRepo.GetByEmail(email)
	}

	if user == nil {
		// Create new user
		displayName := username
		if displayName == "" {
			displayName = fmt.Sprintf("%s_user", provider)
		}

		user = &model.User{
			Email:         email,
			Username:      h.ensureUniqueUsername(displayName),
			AvatarURL:     avatarURL,
			EmailVerified: email != "",
		}
		if err := h.userRepo.Create(user); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}
	}

	// Link OAuth account
	oauthAccount := &model.OAuthAccount{
		UserID:           user.ID,
		Provider:         provider,
		ProviderUserID:   providerUserID,
		ProviderEmail:    email,
		ProviderUsername: username,
		AvatarURL:        avatarURL,
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
	}
	if err := h.oauthRepo.Create(oauthAccount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to link OAuth account"})
		return
	}

	// Update user avatar if empty
	if user.AvatarURL == "" && avatarURL != "" {
		_ = h.userRepo.UpdateAvatar(user.ID, avatarURL)
		user.AvatarURL = avatarURL
	}

	token, err := h.generateToken(user.ID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":             user.ID,
			"username":       user.Username,
			"email":          user.Email,
			"email_verified": user.EmailVerified,
			"avatar_url":     user.AvatarURL,
		},
	})
}

func (h *AuthHandler) linkOAuthAccount(c *gin.Context, userID uuid.UUID, provider, providerUserID, email, username, avatarURL, accessToken, refreshToken string) {
	// Check if already linked to someone else
	existing, _ := h.oauthRepo.GetByProviderAndID(provider, providerUserID)
	if existing != nil {
		if existing.UserID == userID {
			c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s account already linked", provider)})
			return
		}
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("This %s account is already linked to another user", provider)})
		return
	}

	oauthAccount := &model.OAuthAccount{
		UserID:           userID,
		Provider:         provider,
		ProviderUserID:   providerUserID,
		ProviderEmail:    email,
		ProviderUsername: username,
		AvatarURL:        avatarURL,
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
	}

	if err := h.oauthRepo.Create(oauthAccount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to link account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s account linked successfully", provider)})
}

func (h *AuthHandler) ensureUniqueUsername(base string) string {
	username := base
	attempt := 0
	for {
		existing, _ := h.userRepo.GetByUsername(username)
		if existing == nil {
			return username
		}
		attempt++
		username = fmt.Sprintf("%s_%d", base, attempt)
	}
}

// ---- GitHub API helpers ----

type githubTokenResponse struct {
	AccessToken string `json:"access_token"`
}

type githubUser struct {
	ID        string `json:"id"`
	Login     string `json:"login"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

func (h *AuthHandler) exchangeGitHubCode(code string) (string, error) {
	req, _ := http.NewRequest("POST", "https://github.com/login/oauth/access_token", nil)
	q := req.URL.Query()
	q.Add("client_id", h.cfg.GitHubClientID)
	q.Add("client_secret", h.cfg.GitHubClientSecret)
	q.Add("code", code)
	req.URL.RawQuery = q.Encode()
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("github token exchange failed: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp githubTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode github token: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("empty access token from github")
	}

	return tokenResp.AccessToken, nil
}

func (h *AuthHandler) getGitHubUser(accessToken string) (*githubUser, error) {
	req, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// GitHub returns id as integer, we need it as string
	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}

	user := &githubUser{
		ID:        fmt.Sprintf("%v", raw["id"]),
		Login:     fmt.Sprintf("%v", raw["login"]),
		AvatarURL: fmt.Sprintf("%v", raw["avatar_url"]),
	}

	if email, ok := raw["email"].(string); ok {
		user.Email = email
	}

	// If email is empty, try to get from /user/emails
	if user.Email == "" {
		user.Email = h.getGitHubPrimaryEmail(accessToken)
	}

	return user, nil
}

func (h *AuthHandler) getGitHubPrimaryEmail(accessToken string) string {
	req, _ := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return ""
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email
		}
	}
	return ""
}

// ---- Google API helpers ----

type googleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type googleUser struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func (h *AuthHandler) exchangeGoogleCode(code string) (string, error) {
	req, _ := http.NewRequest("POST", "https://oauth2.googleapis.com/token", nil)
	q := req.URL.Query()
	q.Add("client_id", h.cfg.GoogleClientID)
	q.Add("client_secret", h.cfg.GoogleClientSecret)
	q.Add("code", code)
	q.Add("grant_type", "authorization_code")
	q.Add("redirect_uri", h.cfg.FrontendURL+"/oauth/callback")
	req.URL.RawQuery = q.Encode()
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("google token exchange failed: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp googleTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode google token: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("empty access token from google")
	}

	return tokenResp.AccessToken, nil
}

func (h *AuthHandler) getGoogleUser(accessToken string) (*googleUser, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var user googleUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}

	return &user, nil
}

func (h *AuthHandler) generateToken(userID string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 72).Unix(),
	})
	return token.SignedString([]byte(h.cfg.JWTSecret))
}
