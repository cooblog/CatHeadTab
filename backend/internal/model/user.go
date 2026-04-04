package model

import (
	"time"

	"github.com/google/uuid"
)

// UserRole represents the role/permission level of a user.
type UserRole string

const (
	// RoleUser is the default role for regular users.
	RoleUser UserRole = "user"
	// RoleAdmin grants administrative privileges (e.g. wallpaper search).
	RoleAdmin UserRole = "admin"
)

// ValidRoles contains all recognised user roles for validation.
var ValidRoles = map[UserRole]bool{
	RoleUser:  true,
	RoleAdmin: true,
}

// IsAdmin reports whether the role has admin privileges.
func (r UserRole) IsAdmin() bool {
	return r == RoleAdmin
}

// User represents a registered user with OAuth credentials.
type User struct {
	ID            uuid.UUID              `json:"id"`
	Email         string                 `json:"email"`
	EmailVerified bool                   `json:"email_verified"`
	PasswordHash  string                 `json:"-"`
	OAuthProvider *string                `json:"oauth_provider,omitempty"`
	OAuthID       *string                `json:"oauth_id,omitempty"`
	Username      string                 `json:"username"`
	AvatarURL     string                 `json:"avatar_url"`
	Role          UserRole               `json:"role"`
	Preferences   map[string]interface{} `json:"preferences"`
	CreatedAt     time.Time              `json:"created_at"`
}

// EmailVerification represents a pending email verification token.
type EmailVerification struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// PasswordReset represents a pending password reset token.
type PasswordReset struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	Used      bool      `json:"used"`
	CreatedAt time.Time `json:"created_at"`
}

// OAuthAccount represents a linked OAuth provider account.
type OAuthAccount struct {
	ID               uuid.UUID `json:"id"`
	UserID           uuid.UUID `json:"user_id"`
	Provider         string    `json:"provider"`
	ProviderUserID   string    `json:"provider_user_id"`
	ProviderEmail    string    `json:"provider_email,omitempty"`
	ProviderUsername string    `json:"provider_username,omitempty"`
	AvatarURL        string    `json:"avatar_url,omitempty"`
	AccessToken      string    `json:"-"`
	RefreshToken     string    `json:"-"`
	LinkedAt         time.Time `json:"linked_at"`
}
