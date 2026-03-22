// Package model defines domain models for the application.
package model

import (
	"time"

	"github.com/google/uuid"
)

// PresetCategory represents a category of preset websites (e.g. Video, AI, News).
type PresetCategory struct {
	ID        uuid.UUID    `json:"id"`
	Name      string       `json:"name"`
	Icon      string       `json:"icon"`
	SortOrder int          `json:"sort_order"`
	Sites     []PresetSite `json:"sites,omitempty"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}

// PresetSite represents a single preset website within a category.
type PresetSite struct {
	ID          uuid.UUID `json:"id"`
	CategoryID  uuid.UUID `json:"category_id"`
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Icon        string    `json:"icon"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
}
