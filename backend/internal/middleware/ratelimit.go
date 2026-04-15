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

// rateLimitEntry tracks the last request time and consecutive attempts for a given key.
type rateLimitEntry struct {
	lastRequest time.Time
	attempts    int // number of consecutive requests (for exponential backoff)
}

// RateLimiter is an in-memory, per-key rate limiter. Each unique key
// (e.g. IP address or email) is allowed at most one request per Window.
// When exponential backoff is enabled, the cooldown doubles after each
// consecutive request: baseWindow, 2×baseWindow, 4×baseWindow, etc.
// Stale entries are cleaned up automatically every CleanupEvery interval.
type RateLimiter struct {
	mu           sync.Mutex
	entries      map[string]*rateLimitEntry
	window       time.Duration
	maxWindow    time.Duration // 0 means no cap (only relevant for exponential mode)
	exponential  bool
	cleanupEvery time.Duration
}

// NewRateLimiter creates a RateLimiter that allows one request per window
// for each key, and starts a background goroutine to purge stale entries.
func NewRateLimiter(window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		entries:      make(map[string]*rateLimitEntry),
		window:       window,
		cleanupEvery: 5 * time.Minute,
	}
	go rl.cleanupLoop()
	return rl
}

// NewExponentialRateLimiter creates a RateLimiter with exponential backoff.
// The first cooldown is baseWindow, then 2×baseWindow, 4×baseWindow, etc.,
// capped at maxWindow. The attempt counter resets after maxWindow has elapsed
// since the last request.
func NewExponentialRateLimiter(baseWindow, maxWindow time.Duration) *RateLimiter {
	rl := &RateLimiter{
		entries:      make(map[string]*rateLimitEntry),
		window:       baseWindow,
		maxWindow:    maxWindow,
		exponential:  true,
		cleanupEvery: 5 * time.Minute,
	}
	go rl.cleanupLoop()
	return rl
}

// cooldownFor returns the cooldown duration for the given entry.
func (rl *RateLimiter) cooldownFor(entry *rateLimitEntry) time.Duration {
	if !rl.exponential || entry.attempts <= 1 {
		return rl.window
	}
	// baseWindow * 2^(attempts-1)
	d := rl.window
	for i := 1; i < entry.attempts; i++ {
		d *= 2
		if rl.maxWindow > 0 && d > rl.maxWindow {
			d = rl.maxWindow
			break
		}
	}
	return d
}

// Allow returns true if the given key has not been seen within the current
// cooldown window, and records the access. Returns false if the key is
// rate-limited. When rate-limited, retryAfter contains the number of seconds
// the caller must wait before retrying.
func (rl *RateLimiter) Allow(key string) (allowed bool, retryAfter int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	entry, exists := rl.entries[key]

	if exists {
		cooldown := rl.cooldownFor(entry)
		elapsed := now.Sub(entry.lastRequest)

		if elapsed < cooldown {
			// Still in cooldown — reject
			remaining := cooldown - elapsed
			return false, int(remaining.Seconds()) + 1 // round up
		}

		// Cooldown expired. If enough time has passed (beyond maxWindow or 2x window),
		// reset the attempt counter (user "cooled off").
		resetThreshold := 2 * rl.window
		if rl.maxWindow > 0 {
			resetThreshold = 2 * rl.maxWindow
		}
		if elapsed > resetThreshold {
			entry.attempts = 0
		}
	}

	if !exists {
		entry = &rateLimitEntry{}
		rl.entries[key] = entry
	}
	entry.attempts++
	entry.lastRequest = now
	return true, 0
}

// cleanupLoop periodically removes entries that have expired well beyond
// the rate-limit window so the map does not grow without bound.
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanupEvery)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-2 * rl.window)
		for key, entry := range rl.entries {
			if entry.lastRequest.Before(cutoff) {
				delete(rl.entries, key)
			}
		}
		rl.mu.Unlock()
	}
}

// peekEmail reads the request body, extracts the "email" field from the
// JSON payload, and restores the body so downstream handlers can still
// bind it. Returns an empty string if the email cannot be extracted.
func peekEmail(c *gin.Context) string {
	if c.Request.Body == nil {
		return ""
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return ""
	}
	// Restore the body for subsequent handlers
	c.Request.Body = io.NopCloser(bytes.NewReader(body))

	var payload struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return payload.Email
}

// EmailRateLimit returns a Gin middleware that rate-limits requests based
// on the client IP **and** the email address found in the JSON request
// body. Either dimension hitting the limit is enough to reject the
// request. The email field is extracted by peeking at the request body
// without consuming it.
//
// For authenticated endpoints where no email is in the body, the
// middleware also checks the "user_id" context value as a fallback
// identity key.
//
// The middleware expects the request body to contain a JSON object with
// an "email" key. If the email cannot be extracted, rate-limiting falls
// back to IP and/or user_id only.
func EmailRateLimit(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		// Rate-limit by IP
		if allowed, retryAfter := limiter.Allow("ip:" + clientIP); !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "Too many requests. Please try again later",
				"retry_after": retryAfter,
			})
			return
		}

		// Rate-limit by email (peek from request body)
		email := peekEmail(c)
		if email != "" {
			if allowed, retryAfter := limiter.Allow("email:" + email); !allowed {
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
					"error":       "Too many requests for this email. Please try again later",
					"retry_after": retryAfter,
				})
				return
			}
		}

		// Fallback: rate-limit by user_id for authenticated endpoints
		// where no email is provided in the body
		if email == "" {
			if userID := c.GetString("user_id"); userID != "" {
				if allowed, retryAfter := limiter.Allow("user:" + userID); !allowed {
					c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
						"error":       "Too many requests. Please try again later",
						"retry_after": retryAfter,
					})
					return
				}
			}
		}

		c.Next()
	}
}
