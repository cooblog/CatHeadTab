package middleware

import "testing"

func TestLoginRateLimiterBlocksAfterFailuresAndClearsOnSuccess(t *testing.T) {
	limiter := NewLoginRateLimiter(10)
	key := "login_id:admin@example.com"

	for i := 0; i < 4; i++ {
		limiter.RecordFailure(key)
		if allowed, retryAfter := limiter.CheckBlock(key); !allowed || retryAfter != 0 {
			t.Fatalf("failure %d should not block yet: allowed=%v retryAfter=%d", i+1, allowed, retryAfter)
		}
	}

	limiter.RecordFailure(key)
	allowed, retryAfter := limiter.CheckBlock(key)
	if allowed {
		t.Fatal("expected account to be blocked after five failures")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected positive retry_after, got %d", retryAfter)
	}

	limiter.RecordSuccess(key)
	allowed, retryAfter = limiter.CheckBlock(key)
	if !allowed || retryAfter != 0 {
		t.Fatalf("success should clear block: allowed=%v retryAfter=%d", allowed, retryAfter)
	}
}

func TestLoginRateLimiterBurstLimit(t *testing.T) {
	limiter := NewLoginRateLimiter(2)
	ip := "203.0.113.10"

	for i := 0; i < 2; i++ {
		if allowed, retryAfter := limiter.CheckBurst(ip); !allowed || retryAfter != 0 {
			t.Fatalf("request %d should be allowed: allowed=%v retryAfter=%d", i+1, allowed, retryAfter)
		}
	}

	allowed, retryAfter := limiter.CheckBurst(ip)
	if allowed {
		t.Fatal("expected third request in the same minute to be rate-limited")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected positive retry_after, got %d", retryAfter)
	}
}

func TestNormalizeLoginIdentifier(t *testing.T) {
	got := normalizeLoginIdentifier("  Admin@Example.COM  ")
	if got != "admin@example.com" {
		t.Fatalf("unexpected normalized identifier: %q", got)
	}
}
