package model

import (
	"time"

	"github.com/google/uuid"
)

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
