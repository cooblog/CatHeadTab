// Package repository provides data access for preset sites.
package repository

import (
	"database/sql"

	"github.com/CatHeadTab/backend/internal/model"

	"github.com/google/uuid"
)

// PresetRepository defines the interface for preset site data operations.
type PresetRepository interface {
	ListCategories() ([]model.PresetCategory, error)
	ListSitesByCategory(categoryID uuid.UUID) ([]model.PresetSite, error)
	ListAllWithSites() ([]model.PresetCategory, error)
}

type postgresPresetRepository struct {
	db *sql.DB
}

// NewPresetRepository creates a new PresetRepository backed by PostgreSQL.
func NewPresetRepository(db *sql.DB) PresetRepository {
	return &postgresPresetRepository{db: db}
}

// ListCategories returns all preset categories ordered by sort_order.
func (r *postgresPresetRepository) ListCategories() ([]model.PresetCategory, error) {
	rows, err := r.db.Query(`
		SELECT id, name, icon, sort_order, created_at, updated_at
		FROM preset_categories
		ORDER BY sort_order ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []model.PresetCategory
	for rows.Next() {
		var c model.PresetCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.Icon, &c.SortOrder, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}
	return categories, rows.Err()
}

// ListSitesByCategory returns all preset sites for a given category.
func (r *postgresPresetRepository) ListSitesByCategory(categoryID uuid.UUID) ([]model.PresetSite, error) {
	rows, err := r.db.Query(`
		SELECT id, category_id, title, url, icon, sort_order, created_at
		FROM preset_sites
		WHERE category_id = $1
		ORDER BY sort_order ASC
	`, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []model.PresetSite
	for rows.Next() {
		var s model.PresetSite
		if err := rows.Scan(&s.ID, &s.CategoryID, &s.Title, &s.URL, &s.Icon, &s.SortOrder, &s.CreatedAt); err != nil {
			return nil, err
		}
		sites = append(sites, s)
	}
	return sites, rows.Err()
}

// ListAllWithSites returns all categories with their sites nested inside.
func (r *postgresPresetRepository) ListAllWithSites() ([]model.PresetCategory, error) {
	categories, err := r.ListCategories()
	if err != nil {
		return nil, err
	}

	rows, err := r.db.Query(`
		SELECT id, category_id, title, url, icon, sort_order, created_at
		FROM preset_sites
		ORDER BY sort_order ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	siteMap := make(map[uuid.UUID][]model.PresetSite)
	for rows.Next() {
		var s model.PresetSite
		if err := rows.Scan(&s.ID, &s.CategoryID, &s.Title, &s.URL, &s.Icon, &s.SortOrder, &s.CreatedAt); err != nil {
			return nil, err
		}
		siteMap[s.CategoryID] = append(siteMap[s.CategoryID], s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range categories {
		categories[i].Sites = siteMap[categories[i].ID]
		if categories[i].Sites == nil {
			categories[i].Sites = []model.PresetSite{}
		}
	}

	return categories, nil
}
