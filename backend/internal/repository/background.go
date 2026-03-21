package repository

import (
	"database/sql"
	"errors"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/google/uuid"
)

// BackgroundRepository handles database operations for user background images.
type BackgroundRepository interface {
	Upsert(userID uuid.UUID, imageData []byte, contentType string) error
	GetByUserID(userID uuid.UUID) (*model.UserBackground, error)
	DeleteByUserID(userID uuid.UUID) error
}

type postgresBackgroundRepository struct {
	db *sql.DB
}

// NewBackgroundRepository creates a new BackgroundRepository connected to the database.
func NewBackgroundRepository(db *sql.DB) BackgroundRepository {
	return &postgresBackgroundRepository{db: db}
}

// Upsert inserts or updates the user's background image.
func (r *postgresBackgroundRepository) Upsert(userID uuid.UUID, imageData []byte, contentType string) error {
	query := `
		INSERT INTO user_backgrounds (user_id, image_data, content_type, file_size, updated_at)
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id)
		DO UPDATE SET image_data = $2, content_type = $3, file_size = $4, updated_at = CURRENT_TIMESTAMP
	`
	_, err := r.db.Exec(query, userID, imageData, contentType, len(imageData))
	return err
}

// GetByUserID retrieves the user's background image binary data.
func (r *postgresBackgroundRepository) GetByUserID(userID uuid.UUID) (*model.UserBackground, error) {
	query := `
		SELECT user_id, image_data, content_type, file_size, updated_at
		FROM user_backgrounds WHERE user_id = $1
	`
	var bg model.UserBackground
	err := r.db.QueryRow(query, userID).Scan(
		&bg.UserID, &bg.ImageData, &bg.ContentType, &bg.FileSize, &bg.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &bg, nil
}

// DeleteByUserID removes the user's background image.
func (r *postgresBackgroundRepository) DeleteByUserID(userID uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM user_backgrounds WHERE user_id = $1`, userID)
	return err
}
