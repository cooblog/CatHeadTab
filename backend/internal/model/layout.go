package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// DesktopLayout stores the user's desktop icon/widget layout as JSONB.
type DesktopLayout struct {
	ID         uuid.UUID       `json:"id"`
	UserID     uuid.UUID       `json:"user_id"`
	DeviceType string          `json:"device_type"`
	LayoutData json.RawMessage `json:"layout_data"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// LayoutItem represents a single item positioned on the desktop grid.
type LayoutItem struct {
	ID     string `json:"id"`
	Type   string `json:"type"` // "app", "widget", "folder"
	X      int    `json:"x"`
	Y      int    `json:"y"`
	W      int    `json:"w"`
	H      int    `json:"h"`
	Title  string `json:"title,omitempty"`
	URL    string `json:"url,omitempty"`
	Icon   string `json:"icon,omitempty"`
	Config any    `json:"config,omitempty"` // widget-specific config
}
