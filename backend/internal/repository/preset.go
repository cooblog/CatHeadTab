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
	ListCategoriesWithCount() ([]model.PresetCategorySummary, error)
	ListSitesByCategory(categoryID uuid.UUID) ([]model.PresetSite, error)
	ListAllWithSites() ([]model.PresetCategory, error)
	SearchSites(query string, limit int) ([]model.PresetSiteSearchResult, error)
	DeleteSiteByDomain(domain string) (int64, error)
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

// ListCategoriesWithCount returns all categories with site count (no site details).
func (r *postgresPresetRepository) ListCategoriesWithCount() ([]model.PresetCategorySummary, error) {
	rows, err := r.db.Query(`
		SELECT pc.id, pc.name, pc.icon, pc.sort_order, COUNT(ps.id) AS site_count
		FROM preset_categories pc
		LEFT JOIN preset_sites ps ON ps.category_id = pc.id
		GROUP BY pc.id, pc.name, pc.icon, pc.sort_order
		ORDER BY pc.sort_order ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []model.PresetCategorySummary
	for rows.Next() {
		var c model.PresetCategorySummary
		if err := rows.Scan(&c.ID, &c.Name, &c.Icon, &c.SortOrder, &c.SiteCount); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}
	return categories, rows.Err()
}

// ListSitesByCategory returns all preset sites for a given category.
func (r *postgresPresetRepository) ListSitesByCategory(categoryID uuid.UUID) ([]model.PresetSite, error) {
	rows, err := r.db.Query(`
		SELECT id, category_id, title, url, icon, description, sort_order, created_at
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
		if err := rows.Scan(&s.ID, &s.CategoryID, &s.Title, &s.URL, &s.Icon, &s.Description, &s.SortOrder, &s.CreatedAt); err != nil {
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
		SELECT id, category_id, title, url, icon, description, sort_order, created_at
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
		if err := rows.Scan(&s.ID, &s.CategoryID, &s.Title, &s.URL, &s.Icon, &s.Description, &s.SortOrder, &s.CreatedAt); err != nil {
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

// SearchSites performs a fuzzy search across title, url, and description fields.
// Results are ordered by relevance (similarity score) and limited.
// Requires pg_trgm extension to be enabled for similarity() ranking.
func (r *postgresPresetRepository) SearchSites(query string, limit int) ([]model.PresetSiteSearchResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	pattern := "%" + query + "%"

	rows, err := r.db.Query(`
		SELECT ps.id, ps.title, ps.url, ps.icon, ps.description, ps.sort_order,
		       pc.id AS category_id, pc.name AS category_name, pc.icon AS category_icon
		FROM preset_sites ps
		JOIN preset_categories pc ON pc.id = ps.category_id
		WHERE ps.title ILIKE $1
		   OR ps.url ILIKE $1
		   OR ps.description ILIKE $1
		ORDER BY
			GREATEST(
				similarity(ps.title, $2),
				similarity(ps.description, $2)
			) DESC,
			ps.sort_order ASC
		LIMIT $3
	`, pattern, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.PresetSiteSearchResult
	for rows.Next() {
		var r model.PresetSiteSearchResult
		if err := rows.Scan(
			&r.ID, &r.Title, &r.URL, &r.Icon, &r.Description, &r.SortOrder,
			&r.CategoryID, &r.CategoryName, &r.CategoryIcon,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// DeleteSiteByDomain deletes preset sites whose URL contains the given domain.
// Returns the number of rows deleted.
func (r *postgresPresetRepository) DeleteSiteByDomain(domain string) (int64, error) {
	pattern := "%" + domain + "%"
	result, err := r.db.Exec(`DELETE FROM preset_sites WHERE url ILIKE $1`, pattern)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
