package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
)

type fakeAPIAccessStatsRepository struct {
	mu    sync.Mutex
	stats []repository.APIAccessStatInput
	wg    sync.WaitGroup
}

func (r *fakeAPIAccessStatsRepository) Increment(ctx context.Context, stat repository.APIAccessStatInput) error {
	r.mu.Lock()
	r.stats = append(r.stats, stat)
	r.mu.Unlock()
	r.wg.Done()
	return nil
}

func TestAPIAccessStatsRecordsRoutePattern(t *testing.T) {
	gin.SetMode(gin.TestMode)

	repo := &fakeAPIAccessStatsRepository{}
	repo.wg.Add(1)

	router := gin.New()
	router.Use(APIAccessStats(repo))
	router.POST("/api/v1/items/:id", func(c *gin.Context) {
		c.Status(http.StatusCreated)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/items/123", nil)
	router.ServeHTTP(httptest.NewRecorder(), req)

	waitForAPIStats(t, &repo.wg)

	repo.mu.Lock()
	defer repo.mu.Unlock()
	if len(repo.stats) != 1 {
		t.Fatalf("expected 1 stat row, got %d", len(repo.stats))
	}

	got := repo.stats[0]
	if got.Method != http.MethodPost {
		t.Fatalf("unexpected method: %s", got.Method)
	}
	if got.Path != "/api/v1/items/:id" {
		t.Fatalf("unexpected path: %s", got.Path)
	}
	if got.StatusCode != http.StatusCreated {
		t.Fatalf("unexpected status: %d", got.StatusCode)
	}
}

func TestAPIAccessStatsSkipsNonAPIRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	repo := &fakeAPIAccessStatsRepository{}
	router := gin.New()
	router.Use(APIAccessStats(repo))
	router.GET("/health", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	router.ServeHTTP(httptest.NewRecorder(), req)

	repo.mu.Lock()
	defer repo.mu.Unlock()
	if len(repo.stats) != 0 {
		t.Fatalf("expected no stats, got %d", len(repo.stats))
	}
}

func waitForAPIStats(t *testing.T, wg *sync.WaitGroup) {
	t.Helper()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for api stats")
	}
}
