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

// rateLimitEntry tracks the last request time for a given key.
type rateLimitEntry struct {
	lastRequest time.Time
}

// RateLimiter is an in-memory, per-key rate limiter. Each unique key
// (e.g. IP address or email) is allowed at most one request per Window.
// Stale entries are cleaned up automatically every CleanupEvery interval.
type RateLimiter struct {
	mu           sync.Mutex
	entries      map[string]*rateLimitEntry
	window       time.Duration
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

// Allow returns true if the given key has not been seen within the current
// window, and records the access. Returns false if the key is rate-limited.
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	entry, exists := rl.entries[key]
	if exists && now.Sub(entry.lastRequest) < rl.window {
		return false
	}

	if !exists {
		entry = &rateLimitEntry{}
		rl.entries[key] = entry
	}
	entry.lastRequest = now
	return true
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
		if !limiter.Allow("ip:" + clientIP) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests. Please try again later",
			})
			return
		}

		// Rate-limit by email (peek from request body)
		email := peekEmail(c)
		if email != "" {
			if !limiter.Allow("email:" + email) {
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
					"error": "Too many requests for this email. Please try again later",
				})
				return
			}
		}

		// Fallback: rate-limit by user_id for authenticated endpoints
		// where no email is provided in the body
		if email == "" {
			if userID := c.GetString("user_id"); userID != "" {
				if !limiter.Allow("user:" + userID) {
					c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
						"error": "Too many requests. Please try again later",
					})
					return
				}
			}
		}

		c.Next()
	}
}
