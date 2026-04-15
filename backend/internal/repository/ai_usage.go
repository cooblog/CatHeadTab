package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// AIUsage represents a daily AI usage record for a user.
type AIUsage struct {
	UserID           uuid.UUID
	UsageDate        time.Time
	RequestCount     int
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	LastRequestAt    time.Time
}

// AIUsageRepository handles AI usage tracking in the database.
type AIUsageRepository interface {
	// GetTodayUsage 获取用户今天的用量
	GetTodayUsage(userID uuid.UUID) (*AIUsage, error)
	// IncrementUsage 增加用户今天的用量（upsert）
	IncrementUsage(userID uuid.UUID, promptTokens, completionTokens, totalTokens int) error
	// CleanupOldUsage 清理超过指定天数的旧记录
	CleanupOldUsage(retentionDays int) (int64, error)
}

type postgresAIUsageRepository struct {
	db *sql.DB
}

// NewAIUsageRepository creates a new AIUsageRepository.
func NewAIUsageRepository(db *sql.DB) AIUsageRepository {
	return &postgresAIUsageRepository{db: db}
}

func (r *postgresAIUsageRepository) GetTodayUsage(userID uuid.UUID) (*AIUsage, error) {
	var u AIUsage
	err := r.db.QueryRow(
		`SELECT user_id, usage_date, request_count, prompt_tokens, completion_tokens, total_tokens, last_request_at
		 FROM ai_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
		userID,
	).Scan(&u.UserID, &u.UsageDate, &u.RequestCount, &u.PromptTokens, &u.CompletionTokens, &u.TotalTokens, &u.LastRequestAt)

	if err == sql.ErrNoRows {
		return &AIUsage{UserID: userID, UsageDate: time.Now()}, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *postgresAIUsageRepository) IncrementUsage(userID uuid.UUID, promptTokens, completionTokens, totalTokens int) error {
	_, err := r.db.Exec(
		`INSERT INTO ai_usage (user_id, usage_date, request_count, prompt_tokens, completion_tokens, total_tokens, last_request_at)
		 VALUES ($1, CURRENT_DATE, 1, $2, $3, $4, NOW())
		 ON CONFLICT (user_id, usage_date) DO UPDATE SET
		   request_count = ai_usage.request_count + 1,
		   prompt_tokens = ai_usage.prompt_tokens + $2,
		   completion_tokens = ai_usage.completion_tokens + $3,
		   total_tokens = ai_usage.total_tokens + $4,
		   last_request_at = NOW()`,
		userID, promptTokens, completionTokens, totalTokens,
	)
	return err
}

func (r *postgresAIUsageRepository) CleanupOldUsage(retentionDays int) (int64, error) {
	res, err := r.db.Exec(
		`DELETE FROM ai_usage WHERE usage_date < CURRENT_DATE - $1::interval`,
		fmt.Sprintf("%d days", retentionDays),
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
