package repository

import (
	"context"
	"database/sql"
	"time"
)

// NamedCount is a generic name/count tuple used by dashboard breakdowns.
type NamedCount struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

// DailyCount is a daily time series row.
type DailyCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

// DailyAIUsage is a daily AI usage time series row.
type DailyAIUsage struct {
	Date         string `json:"date"`
	RequestCount int64  `json:"request_count"`
	TotalTokens  int64  `json:"total_tokens"`
}

// DomainCount is a bookmark-domain aggregate.
type DomainCount struct {
	Domain string `json:"domain"`
	Count  int64  `json:"count"`
}

// PresetCategoryCount is a preset category aggregate.
type PresetCategoryCount struct {
	Category string `json:"category"`
	Count    int64  `json:"count"`
}

// WallpaperCacheBreakdown is a provider/sorting aggregate.
type WallpaperCacheBreakdown struct {
	Provider string `json:"provider"`
	Sorting  string `json:"sorting"`
	Count    int64  `json:"count"`
}

// TopAIUser is a 30-day AI usage aggregate for a user.
type TopAIUser struct {
	UserID       string `json:"user_id"`
	DisplayName  string `json:"display_name"`
	RequestCount int64  `json:"request_count"`
	TotalTokens  int64  `json:"total_tokens"`
}

// TableSize is a PostgreSQL table size aggregate.
type TableSize struct {
	TableName string `json:"table_name"`
	Bytes     int64  `json:"bytes"`
}

// AdminUserStats summarizes registered users.
type AdminUserStats struct {
	Total           int64        `json:"total"`
	Verified        int64        `json:"verified"`
	Unverified      int64        `json:"unverified"`
	PasswordUsers   int64        `json:"password_users"`
	OAuthUsers      int64        `json:"oauth_users"`
	RegisteredToday int64        `json:"registered_today"`
	Registered7d    int64        `json:"registered_7d"`
	Registered30d   int64        `json:"registered_30d"`
	ByRole          []NamedCount `json:"by_role"`
	DailyNewUsers   []DailyCount `json:"daily_new_users"`
}

// AdminBookmarkStats summarizes bookmark data.
type AdminBookmarkStats struct {
	Total      int64         `json:"total"`
	Links      int64         `json:"links"`
	Folders    int64         `json:"folders"`
	Users      int64         `json:"users"`
	Updated7d  int64         `json:"updated_7d"`
	Updated30d int64         `json:"updated_30d"`
	AvgPerUser float64       `json:"avg_per_user"`
	TopDomains []DomainCount `json:"top_domains"`
}

// AdminLayoutStats summarizes cloud desktop layouts.
type AdminLayoutStats struct {
	Total       int64     `json:"total"`
	Users       int64     `json:"users"`
	Updated7d   int64     `json:"updated_7d"`
	Updated30d  int64     `json:"updated_30d"`
	AvgItems    float64   `json:"avg_items"`
	LastUpdated time.Time `json:"last_updated"`
}

// AdminBackgroundStats summarizes uploaded background images.
type AdminBackgroundStats struct {
	Total      int64   `json:"total"`
	TotalBytes int64   `json:"total_bytes"`
	AvgBytes   float64 `json:"avg_bytes"`
	Updated7d  int64   `json:"updated_7d"`
	Updated30d int64   `json:"updated_30d"`
}

// AdminPresetStats summarizes preset site data.
type AdminPresetStats struct {
	Categories    int64                 `json:"categories"`
	Sites         int64                 `json:"sites"`
	TopCategories []PresetCategoryCount `json:"top_categories"`
}

// AdminWallpaperCacheStats summarizes persisted wallpaper cache entries.
type AdminWallpaperCacheStats struct {
	Total       int64                     `json:"total"`
	Fresh       int64                     `json:"fresh"`
	Expired     int64                     `json:"expired"`
	Providers   int64                     `json:"providers"`
	LastCreated time.Time                 `json:"last_created"`
	Breakdown   []WallpaperCacheBreakdown `json:"breakdown"`
}

// AdminAIUsageStats summarizes recorded server-side AI usage.
type AdminAIUsageStats struct {
	TotalRequests int64          `json:"total_requests"`
	TotalTokens   int64          `json:"total_tokens"`
	TokensToday   int64          `json:"tokens_today"`
	Tokens7d      int64          `json:"tokens_7d"`
	Tokens30d     int64          `json:"tokens_30d"`
	UsersToday    int64          `json:"users_today"`
	Users7d       int64          `json:"users_7d"`
	Users30d      int64          `json:"users_30d"`
	DailyUsage    []DailyAIUsage `json:"daily_usage"`
	TopUsers      []TopAIUser    `json:"top_users"`
}

// AdminAuthStats summarizes auth-token and OAuth account data.
type AdminAuthStats struct {
	EmailVerificationPending int64        `json:"email_verification_pending"`
	EmailVerificationExpired int64        `json:"email_verification_expired"`
	PasswordResetPending     int64        `json:"password_reset_pending"`
	PasswordResetUsed        int64        `json:"password_reset_used"`
	PasswordResetExpired     int64        `json:"password_reset_expired"`
	OAuthProviders           []NamedCount `json:"oauth_providers"`
}

// AdminDashboard is the full dashboard payload.
type AdminDashboard struct {
	GeneratedAt    time.Time                `json:"generated_at"`
	Users          AdminUserStats           `json:"users"`
	Bookmarks      AdminBookmarkStats       `json:"bookmarks"`
	Layouts        AdminLayoutStats         `json:"layouts"`
	Backgrounds    AdminBackgroundStats     `json:"backgrounds"`
	Presets        AdminPresetStats         `json:"presets"`
	WallpaperCache AdminWallpaperCacheStats `json:"wallpaper_cache"`
	AIUsage        AdminAIUsageStats        `json:"ai_usage"`
	Auth           AdminAuthStats           `json:"auth"`
	TableSizes     []TableSize              `json:"table_sizes"`
}

// AdminDashboardRepository loads dashboard statistics.
type AdminDashboardRepository interface {
	GetDashboard(ctx context.Context) (*AdminDashboard, error)
}

type postgresAdminDashboardRepository struct {
	db *sql.DB
}

// NewAdminDashboardRepository creates an AdminDashboardRepository.
func NewAdminDashboardRepository(db *sql.DB) AdminDashboardRepository {
	return &postgresAdminDashboardRepository{db: db}
}

func (r *postgresAdminDashboardRepository) GetDashboard(ctx context.Context) (*AdminDashboard, error) {
	dashboard := &AdminDashboard{
		GeneratedAt: time.Now().UTC(),
	}

	if err := r.loadUsers(ctx, &dashboard.Users); err != nil {
		return nil, err
	}
	if err := r.loadBookmarks(ctx, &dashboard.Bookmarks); err != nil {
		return nil, err
	}
	if err := r.loadLayouts(ctx, &dashboard.Layouts); err != nil {
		return nil, err
	}
	if err := r.loadBackgrounds(ctx, &dashboard.Backgrounds); err != nil {
		return nil, err
	}
	if err := r.loadPresets(ctx, &dashboard.Presets); err != nil {
		return nil, err
	}
	if err := r.loadWallpaperCache(ctx, &dashboard.WallpaperCache); err != nil {
		return nil, err
	}
	if err := r.loadAIUsage(ctx, &dashboard.AIUsage); err != nil {
		return nil, err
	}
	if err := r.loadAuth(ctx, &dashboard.Auth); err != nil {
		return nil, err
	}
	if err := r.loadTableSizes(ctx, &dashboard.TableSizes); err != nil {
		return nil, err
	}

	return dashboard, nil
}

func (r *postgresAdminDashboardRepository) loadUsers(ctx context.Context, stats *AdminUserStats) error {
	err := r.db.QueryRowContext(ctx, `
		WITH user_flags AS (
			SELECT
				u.*,
				EXISTS (SELECT 1 FROM oauth_accounts oa WHERE oa.user_id = u.id) AS has_linked_oauth
			FROM users u
		)
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE email_verified),
			COUNT(*) FILTER (WHERE NOT email_verified),
			COUNT(*) FILTER (WHERE password_hash IS NOT NULL AND password_hash <> ''),
			COUNT(*) FILTER (WHERE oauth_provider IS NOT NULL OR has_linked_oauth),
			COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE),
			COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),
			COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')
		FROM user_flags
	`).Scan(
		&stats.Total,
		&stats.Verified,
		&stats.Unverified,
		&stats.PasswordUsers,
		&stats.OAuthUsers,
		&stats.RegisteredToday,
		&stats.Registered7d,
		&stats.Registered30d,
	)
	if err != nil {
		return err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT COALESCE(NULLIF(role, ''), 'user') AS role, COUNT(*)
		FROM users
		GROUP BY role
		ORDER BY role
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var row NamedCount
		if err := rows.Scan(&row.Name, &row.Count); err != nil {
			return err
		}
		stats.ByRole = append(stats.ByRole, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = r.db.QueryContext(ctx, `
		SELECT day::date, COUNT(u.id)
		FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS day
		LEFT JOIN users u ON u.created_at::date = day::date
		GROUP BY day
		ORDER BY day
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var day time.Time
		var count int64
		if err := rows.Scan(&day, &count); err != nil {
			return err
		}
		stats.DailyNewUsers = append(stats.DailyNewUsers, DailyCount{
			Date:  day.Format("2006-01-02"),
			Count: count,
		})
	}
	return rows.Err()
}

func (r *postgresAdminDashboardRepository) loadBookmarks(ctx context.Context, stats *AdminBookmarkStats) error {
	err := r.db.QueryRowContext(ctx, `
		WITH per_user AS (
			SELECT user_id, COUNT(*) AS item_count
			FROM bookmarks
			GROUP BY user_id
		)
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE NOT is_folder),
			COUNT(*) FILTER (WHERE is_folder),
			COUNT(DISTINCT user_id),
			COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days'),
			COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days'),
			COALESCE((SELECT AVG(item_count)::float8 FROM per_user), 0)
		FROM bookmarks
	`).Scan(
		&stats.Total,
		&stats.Links,
		&stats.Folders,
		&stats.Users,
		&stats.Updated7d,
		&stats.Updated30d,
		&stats.AvgPerUser,
	)
	if err != nil {
		return err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT regexp_replace(lower(url), '^https?://(www\.)?([^/:?#]+).*$', '\2') AS domain, COUNT(*)
		FROM bookmarks
		WHERE url IS NOT NULL AND url <> '' AND url ~* '^https?://'
		GROUP BY domain
		ORDER BY COUNT(*) DESC, domain
		LIMIT 10
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var row DomainCount
		if err := rows.Scan(&row.Domain, &row.Count); err != nil {
			return err
		}
		stats.TopDomains = append(stats.TopDomains, row)
	}
	return rows.Err()
}

func (r *postgresAdminDashboardRepository) loadLayouts(ctx context.Context, stats *AdminLayoutStats) error {
	return r.db.QueryRowContext(ctx, `
		WITH layout_counts AS (
			SELECT
				user_id,
				updated_at,
				COALESCE(jsonb_array_length(
					CASE WHEN jsonb_typeof(layout_data->'dock') = 'array' THEN layout_data->'dock' ELSE '[]'::jsonb END
				), 0)
				+
				COALESCE((
					SELECT SUM(jsonb_array_length(page))
					FROM jsonb_array_elements(
						CASE WHEN jsonb_typeof(layout_data->'pages') = 'array' THEN layout_data->'pages' ELSE '[]'::jsonb END
					) AS page
					WHERE jsonb_typeof(page) = 'array'
				), 0) AS item_count
			FROM desktop_layouts
		)
		SELECT
			COUNT(*),
			COUNT(DISTINCT user_id),
			COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days'),
			COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days'),
			COALESCE(AVG(item_count)::float8, 0),
			COALESCE(MAX(updated_at), 'epoch'::timestamptz)
		FROM layout_counts
	`).Scan(
		&stats.Total,
		&stats.Users,
		&stats.Updated7d,
		&stats.Updated30d,
		&stats.AvgItems,
		&stats.LastUpdated,
	)
}

func (r *postgresAdminDashboardRepository) loadBackgrounds(ctx context.Context, stats *AdminBackgroundStats) error {
	return r.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COALESCE(SUM(file_size), 0),
			COALESCE(AVG(file_size)::float8, 0),
			COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days'),
			COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days')
		FROM user_backgrounds
	`).Scan(
		&stats.Total,
		&stats.TotalBytes,
		&stats.AvgBytes,
		&stats.Updated7d,
		&stats.Updated30d,
	)
}

func (r *postgresAdminDashboardRepository) loadPresets(ctx context.Context, stats *AdminPresetStats) error {
	if err := r.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM preset_categories),
			(SELECT COUNT(*) FROM preset_sites)
	`).Scan(&stats.Categories, &stats.Sites); err != nil {
		return err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT c.name, COUNT(s.id)
		FROM preset_categories c
		LEFT JOIN preset_sites s ON s.category_id = c.id
		GROUP BY c.id, c.name, c.sort_order
		ORDER BY COUNT(s.id) DESC, c.sort_order, c.name
		LIMIT 8
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var row PresetCategoryCount
		if err := rows.Scan(&row.Category, &row.Count); err != nil {
			return err
		}
		stats.TopCategories = append(stats.TopCategories, row)
	}
	return rows.Err()
}

func (r *postgresAdminDashboardRepository) loadWallpaperCache(ctx context.Context, stats *AdminWallpaperCacheStats) error {
	err := r.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE refresh_after > NOW()),
			COUNT(*) FILTER (WHERE refresh_after <= NOW()),
			COUNT(DISTINCT provider),
			COALESCE(MAX(created_at), 'epoch'::timestamptz)
		FROM wallpaper_cache
	`).Scan(
		&stats.Total,
		&stats.Fresh,
		&stats.Expired,
		&stats.Providers,
		&stats.LastCreated,
	)
	if err != nil {
		return err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT provider, sorting, COUNT(*)
		FROM wallpaper_cache
		GROUP BY provider, sorting
		ORDER BY COUNT(*) DESC, provider, sorting
		LIMIT 12
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var row WallpaperCacheBreakdown
		if err := rows.Scan(&row.Provider, &row.Sorting, &row.Count); err != nil {
			return err
		}
		stats.Breakdown = append(stats.Breakdown, row)
	}
	return rows.Err()
}

func (r *postgresAdminDashboardRepository) loadAIUsage(ctx context.Context, stats *AdminAIUsageStats) error {
	err := r.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(request_count), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(total_tokens) FILTER (WHERE usage_date = CURRENT_DATE), 0),
			COALESCE(SUM(total_tokens) FILTER (WHERE usage_date >= CURRENT_DATE - INTERVAL '6 days'), 0),
			COALESCE(SUM(total_tokens) FILTER (WHERE usage_date >= CURRENT_DATE - INTERVAL '29 days'), 0),
			COUNT(DISTINCT user_id) FILTER (WHERE usage_date = CURRENT_DATE),
			COUNT(DISTINCT user_id) FILTER (WHERE usage_date >= CURRENT_DATE - INTERVAL '6 days'),
			COUNT(DISTINCT user_id) FILTER (WHERE usage_date >= CURRENT_DATE - INTERVAL '29 days')
		FROM ai_usage
	`).Scan(
		&stats.TotalRequests,
		&stats.TotalTokens,
		&stats.TokensToday,
		&stats.Tokens7d,
		&stats.Tokens30d,
		&stats.UsersToday,
		&stats.Users7d,
		&stats.Users30d,
	)
	if err != nil {
		return err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			day::date,
			COALESCE(SUM(au.request_count), 0),
			COALESCE(SUM(au.total_tokens), 0)
		FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS day
		LEFT JOIN ai_usage au ON au.usage_date = day::date
		GROUP BY day
		ORDER BY day
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var day time.Time
		var row DailyAIUsage
		if err := rows.Scan(&day, &row.RequestCount, &row.TotalTokens); err != nil {
			return err
		}
		row.Date = day.Format("2006-01-02")
		stats.DailyUsage = append(stats.DailyUsage, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = r.db.QueryContext(ctx, `
		SELECT
			au.user_id::text,
			COALESCE(NULLIF(u.username, ''), NULLIF(u.email, ''), au.user_id::text),
			COALESCE(SUM(au.request_count), 0),
			COALESCE(SUM(au.total_tokens), 0)
		FROM ai_usage au
		JOIN users u ON u.id = au.user_id
		WHERE au.usage_date >= CURRENT_DATE - INTERVAL '29 days'
		GROUP BY au.user_id, u.username, u.email
		ORDER BY SUM(au.total_tokens) DESC, SUM(au.request_count) DESC
		LIMIT 10
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var row TopAIUser
		if err := rows.Scan(&row.UserID, &row.DisplayName, &row.RequestCount, &row.TotalTokens); err != nil {
			return err
		}
		stats.TopUsers = append(stats.TopUsers, row)
	}
	return rows.Err()
}

func (r *postgresAdminDashboardRepository) loadAuth(ctx context.Context, stats *AdminAuthStats) error {
	if err := r.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE expires_at > NOW()),
			COUNT(*) FILTER (WHERE expires_at <= NOW())
		FROM email_verifications
	`).Scan(&stats.EmailVerificationPending, &stats.EmailVerificationExpired); err != nil {
		return err
	}

	if err := r.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE NOT used AND expires_at > NOW()),
			COUNT(*) FILTER (WHERE used),
			COUNT(*) FILTER (WHERE NOT used AND expires_at <= NOW())
		FROM password_resets
	`).Scan(&stats.PasswordResetPending, &stats.PasswordResetUsed, &stats.PasswordResetExpired); err != nil {
		return err
	}

	rows, err := r.db.QueryContext(ctx, `
		WITH providers AS (
			SELECT oauth_provider AS provider
			FROM users
			WHERE oauth_provider IS NOT NULL AND oauth_provider <> ''
			UNION ALL
			SELECT provider
			FROM oauth_accounts
			WHERE provider <> ''
		)
		SELECT provider, COUNT(*)
		FROM providers
		GROUP BY provider
		ORDER BY COUNT(*) DESC, provider
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var row NamedCount
		if err := rows.Scan(&row.Name, &row.Count); err != nil {
			return err
		}
		stats.OAuthProviders = append(stats.OAuthProviders, row)
	}
	return rows.Err()
}

func (r *postgresAdminDashboardRepository) loadTableSizes(ctx context.Context, sizes *[]TableSize) error {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.relname, pg_total_relation_size(c.oid)
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
			AND c.relkind = 'r'
			AND c.relname IN (
				'users',
				'bookmarks',
				'desktop_layouts',
				'user_backgrounds',
				'preset_categories',
				'preset_sites',
				'wallpaper_cache',
				'ai_usage',
				'email_verifications',
				'password_resets',
				'oauth_accounts'
			)
		ORDER BY pg_total_relation_size(c.oid) DESC, c.relname
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var row TableSize
		if err := rows.Scan(&row.TableName, &row.Bytes); err != nil {
			return err
		}
		*sizes = append(*sizes, row)
	}
	return rows.Err()
}
