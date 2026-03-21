package repository

import (
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
)

// LayoutRepository handles DB operations for user layouts.
type LayoutRepository interface {
	GetLayout(userID uuid.UUID) (map[string]interface{}, error)
	UpsertLayout(userID uuid.UUID, layoutData map[string]interface{}) error
}

type postgresLayoutRepository struct {
	db *sql.DB
}

// NewLayoutRepository creates a new LayoutRepository.
func NewLayoutRepository(db *sql.DB) LayoutRepository {
	return &postgresLayoutRepository{db: db}
}

func (r *postgresLayoutRepository) GetLayout(userID uuid.UUID) (map[string]interface{}, error) {
	var data []byte
	err := r.db.QueryRow(`SELECT layout_data FROM desktop_layouts WHERE user_id = $1`, userID).Scan(&data)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return map[string]interface{}{"items": []interface{}{}}, nil // Default empty
		}
		return nil, err
	}
	var layout map[string]interface{}
	if err := json.Unmarshal(data, &layout); err != nil {
		return nil, err
	}
	return layout, nil
}

func (r *postgresLayoutRepository) UpsertLayout(userID uuid.UUID, layoutData map[string]interface{}) error {
	data, err := json.Marshal(layoutData)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO desktop_layouts (user_id, layout_data)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET
			layout_data = EXCLUDED.layout_data,
			updated_at = CURRENT_TIMESTAMP
	`
	_, err = r.db.Exec(query, userID, data)
	return err
}
