package model

import (
	"time"

	"github.com/google/uuid"
)

// Bookmark represents a single bookmark or folder in the tree.
type Bookmark struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Title     string    `json:"title"`
	URL       string    `json:"url,omitempty"`
	Path      string    `json:"path"`
	IsFolder  bool      `json:"is_folder"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BookmarkTree is used for returning nested structures to the frontend.
type BookmarkTree struct {
	Bookmark
	Children []BookmarkTree `json:"children,omitempty"`
}
