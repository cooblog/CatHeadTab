package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// loginAttempt 记录单个 IP/标识符的登录尝试信息
type loginAttempt struct {
	failCount   int       // 连续失败次数
	lastAttempt time.Time // 最近一次尝试时间
	blockedUtil time.Time // 封禁到期时间
}

// LoginRateLimiter 是专门用于登录接口的频控器。
// 采用渐进式封禁策略：连续失败次数越多，封禁时间越长。
// - 5 次失败后：封禁 1 分钟
// - 10 次失败后：封禁 5 分钟
// - 20 次失败后：封禁 15 分钟
// - 30 次以上：封禁 1 小时
type LoginRateLimiter struct {
	mu      sync.Mutex
	entries map[string]*loginAttempt

	// maxPerMinute 限制每分钟最多允许的请求次数（无论成功失败）
	maxPerMinute int
	// ipBurstEntries 记录 IP 维度的滑动窗口请求时间戳
	ipBurst map[string][]time.Time
}

// NewLoginRateLimiter 创建一个新的登录频控器。
func NewLoginRateLimiter(maxPerMinute int) *LoginRateLimiter {
	lr := &LoginRateLimiter{
		entries:      make(map[string]*loginAttempt),
		maxPerMinute: maxPerMinute,
		ipBurst:      make(map[string][]time.Time),
	}
	go lr.cleanupLoop()
	return lr
}

// calcBlockDuration 根据连续失败次数计算封禁时长
func calcBlockDuration(failCount int) time.Duration {
	switch {
	case failCount >= 30:
		return 1 * time.Hour
	case failCount >= 20:
		return 15 * time.Minute
	case failCount >= 10:
		return 5 * time.Minute
	case failCount >= 5:
		return 1 * time.Minute
	default:
		return 0
	}
}

// CheckBurst 检查 IP 的每分钟请求速率。返回 true 表示允许，false 表示被限流。
func (lr *LoginRateLimiter) CheckBurst(ip string) (allowed bool, retryAfter int) {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-1 * time.Minute)

	// 清理过期的时间戳
	timestamps := lr.ipBurst[ip]
	valid := make([]time.Time, 0, len(timestamps))
	for _, ts := range timestamps {
		if ts.After(windowStart) {
			valid = append(valid, ts)
		}
	}

	if len(valid) >= lr.maxPerMinute {
		// 计算最早的请求何时会过期
		oldest := valid[0]
		waitSeconds := int(oldest.Add(1*time.Minute).Sub(now).Seconds()) + 1
		if waitSeconds < 1 {
			waitSeconds = 1
		}
		lr.ipBurst[ip] = valid
		return false, waitSeconds
	}

	valid = append(valid, now)
	lr.ipBurst[ip] = valid
	return true, 0
}

// CheckBlock 检查某个 key 是否处于封禁状态。返回 true 表示允许，false 表示被封禁。
func (lr *LoginRateLimiter) CheckBlock(key string) (allowed bool, retryAfter int) {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	entry, exists := lr.entries[key]
	if !exists {
		return true, 0
	}

	now := time.Now()
	if now.Before(entry.blockedUtil) {
		remaining := int(entry.blockedUtil.Sub(now).Seconds()) + 1
		return false, remaining
	}

	return true, 0
}

// RecordFailure 记录一次登录失败，并可能触发封禁。
func (lr *LoginRateLimiter) RecordFailure(key string) {
	lr.mu.Lock()
	defer lr.mu.Unlock()

	entry, exists := lr.entries[key]
	if !exists {
		entry = &loginAttempt{}
		lr.entries[key] = entry
	}

	entry.failCount++
	entry.lastAttempt = time.Now()

	blockDuration := calcBlockDuration(entry.failCount)
	if blockDuration > 0 {
		entry.blockedUtil = time.Now().Add(blockDuration)
	}
}

// RecordSuccess 记录一次登录成功，清除该 key 的失败记录。
func (lr *LoginRateLimiter) RecordSuccess(key string) {
	lr.mu.Lock()
	defer lr.mu.Unlock()
	delete(lr.entries, key)
}

// cleanupLoop 定期清理过期条目，防止内存泄漏。
func (lr *LoginRateLimiter) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		lr.mu.Lock()
		now := time.Now()
		cutoff := now.Add(-2 * time.Hour)

		for key, entry := range lr.entries {
			if entry.lastAttempt.Before(cutoff) {
				delete(lr.entries, key)
			}
		}

		// 清理 burst 记录
		windowStart := now.Add(-1 * time.Minute)
		for ip, timestamps := range lr.ipBurst {
			valid := make([]time.Time, 0, len(timestamps))
			for _, ts := range timestamps {
				if ts.After(windowStart) {
					valid = append(valid, ts)
				}
			}
			if len(valid) == 0 {
				delete(lr.ipBurst, ip)
			} else {
				lr.ipBurst[ip] = valid
			}
		}

		lr.mu.Unlock()
	}
}

// peekIdentifier 从请求体中读取登录标识符（identifier 字段），并还原 Body。
func peekIdentifier(c *gin.Context) string {
	if c.Request.Body == nil {
		return ""
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return ""
	}
	// 还原 Body 供后续 handler 使用
	c.Request.Body = io.NopCloser(bytes.NewReader(body))

	var payload struct {
		Identifier string `json:"identifier"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return payload.Identifier
}

// LoginRateLimit 返回一个 Gin 中间件，用于限制登录接口的请求频率。
// 采用三层防护：
// 1. IP 维度的每分钟请求速率限制
// 2. IP 维度的连续失败封禁
// 3. 账号标识符维度的连续失败封禁
//
// 该中间件会在 context 中注入 loginRateLimiter 和 loginIdentifier，
// 供后续 handler 在登录成功/失败时调用 RecordSuccess/RecordFailure。
func LoginRateLimit(limiter *LoginRateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		// 第一层：每分钟请求速率限制
		if allowed, retryAfter := limiter.CheckBurst(clientIP); !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "Too many login attempts. Please slow down",
				"retry_after": retryAfter,
			})
			return
		}

		// 第二层：IP 维度的渐进式封禁
		ipKey := "login_ip:" + clientIP
		if allowed, retryAfter := limiter.CheckBlock(ipKey); !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "Too many failed login attempts from this IP. Please try again later",
				"retry_after": retryAfter,
			})
			return
		}

		// 第三层：账号标识符维度的渐进式封禁
		identifier := peekIdentifier(c)
		if identifier != "" {
			identKey := "login_id:" + identifier
			if allowed, retryAfter := limiter.CheckBlock(identKey); !allowed {
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
					"error":       "This account has been temporarily locked due to too many failed attempts. Please try again later",
					"retry_after": retryAfter,
				})
				return
			}
		}

		// 注入 limiter 和 identifier 到 context，供 handler 使用
		c.Set("loginRateLimiter", limiter)
		c.Set("loginIdentifier", identifier)
		c.Set("loginIPKey", ipKey)
		if identifier != "" {
			c.Set("loginIdentKey", "login_id:"+identifier)
		}

		c.Next()
	}
}
