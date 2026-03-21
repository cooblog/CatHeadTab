package model

import (
	"time"

	"github.com/google/uuid"
)

// User represents a registered user with OAuth credentials.
type User struct {
	ID            uuid.UUID              `json:"id"`
	Email         string                 `json:"email"`
	PasswordHash  string                 `json:"-"` // Omit from JSON intentionally
	OAuthProvider *string                `json:"oauth_provider,omitempty"`
	OAuthID       *string                `json:"oauth_id,omitempty"`
	Username      string                 `json:"username"`
	AvatarURL     string                 `json:"avatar_url"`
	Preferences   map[string]interface{} `json:"preferences"`
	CreatedAt     time.Time              `json:"created_at"`
}
