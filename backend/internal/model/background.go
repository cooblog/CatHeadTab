package model

import (
	"time"

	"github.com/google/uuid"
)

// UserBackground represents a user's custom background image stored as binary data.
type UserBackground struct {
	UserID      uuid.UUID `json:"user_id"`
	ImageData   []byte    `json:"-"`
	ContentType string    `json:"content_type"`
	FileSize    int       `json:"file_size"`
	UpdatedAt   time.Time `json:"updated_at"`
}
