package repository

import (
	"context"
	"database/sql"
	"strings"
)

// APIAccessStatInput is one completed HTTP API request to aggregate.
type APIAccessStatInput struct {
	Method     string
	Path       string
	StatusCode int
}

// APIAccessStatsRepository tracks API request counts.
type APIAccessStatsRepository interface {
	Increment(ctx context.Context, stat APIAccessStatInput) error
}

type postgresAPIAccessStatsRepository struct {
	db *sql.DB
}

// NewAPIAccessStatsRepository creates an APIAccessStatsRepository.
func NewAPIAccessStatsRepository(db *sql.DB) APIAccessStatsRepository {
	return &postgresAPIAccessStatsRepository{db: db}
}

func (r *postgresAPIAccessStatsRepository) Increment(ctx context.Context, stat APIAccessStatInput) error {
	method := strings.ToUpper(strings.TrimSpace(stat.Method))
	path := strings.TrimSpace(stat.Path)
	if method == "" || path == "" {
		return nil
	}

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO api_access_stats (access_date, method, path, status_code, request_count, last_access_at)
		VALUES (CURRENT_DATE, $1, $2, $3, 1, NOW())
		ON CONFLICT (access_date, method, path, status_code) DO UPDATE SET
			request_count = api_access_stats.request_count + 1,
			last_access_at = NOW()
	`, method, path, stat.StatusCode)
	return err
}
