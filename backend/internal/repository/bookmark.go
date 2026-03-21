package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/CatHeadTab/backend/internal/model"
)

type BookmarkRepository struct {
	db *sql.DB
}

func NewBookmarkRepository() *BookmarkRepository {
	return &BookmarkRepository{db: DB}
}

// UUIDToLtreeLabel converts a UUID (hyphenated) to a valid ltree label (underscores).
// Ltree labels can contain A-Za-z0-9_
func UUIDToLtreeLabel(id uuid.UUID) string {
	return "id_" + strings.ReplaceAll(id.String(), "-", "_")
}

// List returns all bookmarks for a user, ordered by path and sort_order.
func (r *BookmarkRepository) List(userID uuid.UUID) ([]model.Bookmark, error) {
	query := `
		SELECT id, user_id, title, url, path::text, is_folder, sort_order, created_at, updated_at
		FROM bookmarks
		WHERE user_id = $1
		ORDER BY path, sort_order
	`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query bookmarks: %w", err)
	}
	defer rows.Close()

	var bookmarks []model.Bookmark
	for rows.Next() {
		var b model.Bookmark
		var url sql.NullString
		if err := rows.Scan(&b.ID, &b.UserID, &b.Title, &url, &b.Path, &b.IsFolder, &b.SortOrder, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan bookmark: %w", err)
		}
		if url.Valid {
			b.URL = url.String
		}
		bookmarks = append(bookmarks, b)
	}
	return bookmarks, nil
}

// Create inserts a new bookmark.
func (r *BookmarkRepository) Create(b *model.Bookmark, parentID *uuid.UUID) error {
	// Generate new ID if not set
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}

	label := UUIDToLtreeLabel(b.ID)

	var parentPath string
	if parentID != nil && *parentID != uuid.Nil {
		err := r.db.QueryRow("SELECT path::text FROM bookmarks WHERE id = $1 AND user_id = $2", *parentID, b.UserID).Scan(&parentPath)
		if err != nil {
			return fmt.Errorf("failed to get parent path: %w", err)
		}
		b.Path = parentPath + "." + label
	} else {
		b.Path = label
	}

	query := `
		INSERT INTO bookmarks (id, user_id, title, url, path, is_folder, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING created_at, updated_at
	`
	var url sql.NullString
	if b.URL != "" {
		url = sql.NullString{String: b.URL, Valid: true}
	}

	err := r.db.QueryRow(query, b.ID, b.UserID, b.Title, url, b.Path, b.IsFolder, b.SortOrder).Scan(&b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to insert bookmark: %w", err)
	}

	return nil
}

// Update modifies an existing bookmark's basic info (title, url, sort_order).
func (r *BookmarkRepository) Update(b *model.Bookmark) error {
	query := `
		UPDATE bookmarks
		SET title = $1, url = $2, sort_order = $3, updated_at = CURRENT_TIMESTAMP
		WHERE id = $4 AND user_id = $5
		RETURNING updated_at
	`
	var url sql.NullString
	if b.URL != "" {
		url = sql.NullString{String: b.URL, Valid: true}
	}

	err := r.db.QueryRow(query, b.Title, url, b.SortOrder, b.ID, b.UserID).Scan(&b.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to update bookmark: %w", err)
	}
	return nil
}

// Delete removes a bookmark and all its descendants.
func (r *BookmarkRepository) Delete(id, userID uuid.UUID) error {
	// Find the path of the bookmark to delete
	var path string
	err := r.db.QueryRow("SELECT path::text FROM bookmarks WHERE id = $1 AND user_id = $2", id, userID).Scan(&path)
	if err == sql.ErrNoRows {
		return nil // Already deleted or not found
	} else if err != nil {
		return fmt.Errorf("failed to get path for deletion: %w", err)
	}

	// Delete all bookmarks where path is a descendant of or equal to this path (using ltree <@ operator)
	// Example: path <@ 'id_123.id_456' matches 'id_123.id_456', 'id_123.id_456.id_789'
	query := `DELETE FROM bookmarks WHERE user_id = $1 AND path <@ $2::ltree`
	_, err = r.db.Exec(query, userID, path)
	if err != nil {
		return fmt.Errorf("failed to delete bookmark and descendants: %w", err)
	}

	return nil
}
