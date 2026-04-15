package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AIRateLimiter 实现 AI 接口的请求频控和每日 Token 限额检查。
type AIRateLimiter struct {
	mu           sync.Mutex
	requests     map[string][]time.Time // user_id -> 最近的请求时间列表
	rpm          int                     // 每分钟最大请求数
	dailyLimit   int                     // 每日最大 Token 数，0 = 不限
	usageRepo    repository.AIUsageRepository
}

// NewAIRateLimiter 创建 AI 频控器。
func NewAIRateLimiter(rpm, dailyTokenLimit int, usageRepo repository.AIUsageRepository) *AIRateLimiter {
	rl := &AIRateLimiter{
		requests:   make(map[string][]time.Time),
		rpm:        rpm,
		dailyLimit: dailyTokenLimit,
		usageRepo:  usageRepo,
	}
	// 定期清理过期请求记录
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()
	return rl
}

// checkRPM 检查每分钟请求速率限制
func (rl *AIRateLimiter) checkRPM(userID string) (allowed bool, retryAfter int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-time.Minute)

	// 清理超过 1 分钟的旧请求记录
	recent := rl.requests[userID]
	var valid []time.Time
	for _, t := range recent {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.rpm {
		// 计算最早的请求何时过期
		oldest := valid[0]
		wait := time.Minute - now.Sub(oldest)
		return false, int(wait.Seconds()) + 1
	}

	rl.requests[userID] = append(valid, now)
	return true, 0
}

// cleanup 清理过期的请求记录
func (rl *AIRateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cutoff := time.Now().Add(-2 * time.Minute)
	for userID, times := range rl.requests {
		var valid []time.Time
		for _, t := range times {
			if t.After(cutoff) {
				valid = append(valid, t)
			}
		}
		if len(valid) == 0 {
			delete(rl.requests, userID)
		} else {
			rl.requests[userID] = valid
		}
	}
}

// AIRateLimit 返回 AI 频控 Gin 中间件。
// Admin 用户不受频控限制。Pro 用户检查：1) 每分钟请求数限制  2) 每日 Token 用量限额
func AIRateLimit(limiter *AIRateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.GetString("user_id")
		if userIDStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		// Admin 用户不受频控限制
		if u, exists := c.Get("user"); exists {
			if user, ok := u.(*model.User); ok && user.Role.IsAdmin() {
				c.Next()
				return
			}
		}

		// 检查请求速率
		if allowed, retryAfter := limiter.checkRPM(userIDStr); !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "AI request rate limit exceeded. Please slow down.",
				"retry_after": retryAfter,
			})
			return
		}

		// 检查每日 Token 限额
		if limiter.dailyLimit > 0 {
			userID, err := uuid.Parse(userIDStr)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
				return
			}

			usage, err := limiter.usageRepo.GetTodayUsage(userID)
			if err != nil {
				// 数据库查询失败时放行，不影响用户体验
				c.Next()
				return
			}

			if usage.TotalTokens >= limiter.dailyLimit {
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
					"error":       "Daily AI token limit reached. Please try again tomorrow.",
					"daily_limit": limiter.dailyLimit,
					"used_tokens": usage.TotalTokens,
				})
				return
			}
		}

		c.Next()
	}
}
