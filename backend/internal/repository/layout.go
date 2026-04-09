package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

// LayoutResult wraps the layout data together with its last-modification timestamp.
type LayoutResult struct {
	Data      map[string]interface{} `json:"data"`
	UpdatedAt *time.Time             `json:"updated_at,omitempty"`
}

// LayoutRepository handles DB operations for user layouts.
type LayoutRepository interface {
	GetLayout(userID uuid.UUID) (*LayoutResult, error)
	UpsertLayout(userID uuid.UUID, layoutData map[string]interface{}) (*time.Time, error)
}

type postgresLayoutRepository struct {
	db *sql.DB
}

// NewLayoutRepository creates a new LayoutRepository.
func NewLayoutRepository(db *sql.DB) LayoutRepository {
	return &postgresLayoutRepository{db: db}
}

func (r *postgresLayoutRepository) GetLayout(userID uuid.UUID) (*LayoutResult, error) {
	var data []byte
	var updatedAt time.Time
	err := r.db.QueryRow(
		`SELECT layout_data, updated_at FROM desktop_layouts WHERE user_id = $1`, userID,
	).Scan(&data, &updatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &LayoutResult{
				Data: map[string]interface{}{"items": []interface{}{}},
			}, nil // Default empty, no timestamp
		}
		return nil, err
	}
	var layout map[string]interface{}
	if err := json.Unmarshal(data, &layout); err != nil {
		return nil, err
	}
	return &LayoutResult{Data: layout, UpdatedAt: &updatedAt}, nil
}

func (r *postgresLayoutRepository) UpsertLayout(userID uuid.UUID, layoutData map[string]interface{}) (*time.Time, error) {
	data, err := json.Marshal(layoutData)
	if err != nil {
		return nil, err
	}

	query := `
		INSERT INTO desktop_layouts (user_id, layout_data)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET
			layout_data = EXCLUDED.layout_data,
			updated_at = CURRENT_TIMESTAMP
		RETURNING updated_at
	`
	var updatedAt time.Time
	err = r.db.QueryRow(query, userID, data).Scan(&updatedAt)
	if err != nil {
		return nil, err
	}
	return &updatedAt, nil
}
