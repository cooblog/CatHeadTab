// Package handler provides HTTP handlers for trending/hot content endpoints.
package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ── Data models ──────────────────────────────────────────────────────

// GithubTrendingRepo represents a single trending GitHub repository.
type GithubTrendingRepo struct {
	FullName    string `json:"fullName"`
	Description string `json:"description"`
	Language    string `json:"language"`
	Stars       int    `json:"stars"`
	TodayStars  int    `json:"todayStars"`
	URL         string `json:"url"`
}

// BilibiliHotVideo represents a single hot video from Bilibili.
type BilibiliHotVideo struct {
	Title    string `json:"title"`
	Bvid     string `json:"bvid"`
	Owner    string `json:"owner"`
	View     int64  `json:"view"`
	Danmaku  int64  `json:"danmaku"`
	Duration int    `json:"duration"`
	URL      string `json:"url"`
}

// ── In-memory cache ──────────────────────────────────────────────────

type cacheEntry struct {
	data      interface{}
	fetchedAt time.Time
}

// TrendingHandler handles trending/hot content API endpoints with
// in-memory caching. Data is fetched from upstream on first request
// and cached for 1 hour.
type TrendingHandler struct {
	mu    sync.RWMutex
	cache map[string]*cacheEntry
	ttl   time.Duration
}

// NewTrendingHandler creates a TrendingHandler with default 1-hour TTL.
func NewTrendingHandler() *TrendingHandler {
	return &TrendingHandler{
		cache: make(map[string]*cacheEntry),
		ttl:   1 * time.Hour,
	}
}

func (h *TrendingHandler) getCached(key string) (interface{}, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.cache[key]
	if !ok || time.Since(entry.fetchedAt) > h.ttl {
		return nil, false
	}
	return entry.data, true
}

func (h *TrendingHandler) setCache(key string, data interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cache[key] = &cacheEntry{data: data, fetchedAt: time.Now()}
}

// ── GitHub Trending ──────────────────────────────────────────────────

// GithubTrending returns the current GitHub trending repositories.
//
//	GET /api/v1/trending/github
func (h *TrendingHandler) GithubTrending(c *gin.Context) {
	const cacheKey = "github_trending"

	if cached, ok := h.getCached(cacheKey); ok {
		c.JSON(http.StatusOK, gin.H{"data": cached, "cached": true})
		return
	}

	repos, err := fetchGithubTrending()
	if err != nil {
		log.Printf("[trending] github fetch error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch GitHub trending"})
		return
	}

	h.setCache(cacheKey, repos)
	c.JSON(http.StatusOK, gin.H{"data": repos, "cached": false})
}

func fetchGithubTrending() ([]GithubTrendingRepo, error) {
	// Use the unofficial GitHub trending API (returns JSON)
	// Fallback: parse HTML page
	resp, err := http.Get("https://github.com/trending?spoken_language_code=")
	if err != nil {
		return nil, fmt.Errorf("github trending request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github trending returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("github trending read body failed: %w", err)
	}

	return parseGithubTrendingHTML(string(body))
}

// parseGithubTrendingHTML extracts trending repos from the GitHub HTML page.
// This is a simple parser that looks for specific patterns in the HTML.
func parseGithubTrendingHTML(html string) ([]GithubTrendingRepo, error) {
	var repos []GithubTrendingRepo

	// Split by article tags
	articles := strings.Split(html, "<article")
	if len(articles) <= 1 {
		return nil, fmt.Errorf("no trending repos found in HTML")
	}

	for _, article := range articles[1:] { // skip first split (before first article)
		repo := GithubTrendingRepo{}

		// Extract repo full name from href
		if idx := strings.Index(article, `<h2`); idx >= 0 {
			segment := article[idx:]
			if hrefIdx := strings.Index(segment, `href="`); hrefIdx >= 0 {
				start := hrefIdx + 6
				end := strings.Index(segment[start:], `"`)
				if end > 0 {
					fullName := strings.TrimSpace(segment[start : start+end])
					fullName = strings.TrimPrefix(fullName, "/")
					repo.FullName = fullName
					repo.URL = "https://github.com/" + fullName
				}
			}
		}

		if repo.FullName == "" {
			continue
		}

		// Extract description
		if idx := strings.Index(article, `<p class="`); idx >= 0 {
			segment := article[idx:]
			if gtIdx := strings.Index(segment, ">"); gtIdx >= 0 {
				inner := segment[gtIdx+1:]
				if endIdx := strings.Index(inner, "</p>"); endIdx >= 0 {
					repo.Description = strings.TrimSpace(inner[:endIdx])
					if len(repo.Description) > 200 {
						repo.Description = repo.Description[:200] + "…"
					}
				}
			}
		}

		// Extract language
		if idx := strings.Index(article, `itemprop="programmingLanguage"`); idx >= 0 {
			segment := article[idx:]
			if gtIdx := strings.Index(segment, ">"); gtIdx >= 0 {
				inner := segment[gtIdx+1:]
				if endIdx := strings.Index(inner, "<"); endIdx >= 0 {
					repo.Language = strings.TrimSpace(inner[:endIdx])
				}
			}
		}

		// Extract stars — look for SVG with star icon followed by number
		if idx := strings.Index(article, `Link--muted`); idx >= 0 {
			segment := article[idx:]
			// Find the number after the closing tag
			if gtIdx := strings.Index(segment, ">"); gtIdx >= 0 {
				inner := segment[gtIdx:]
				// Look through the inner content for a number
				num := extractNumber(inner)
				repo.Stars = num
			}
		}

		// Extract today's stars
		if idx := strings.Index(article, "stars today"); idx >= 0 {
			segment := article[max(0, idx-50):idx]
			repo.TodayStars = extractNumber(segment)
		} else if idx := strings.Index(article, "stars this"); idx >= 0 {
			segment := article[max(0, idx-50):idx]
			repo.TodayStars = extractNumber(segment)
		}

		repos = append(repos, repo)
	}

	if len(repos) > 25 {
		repos = repos[:25]
	}

	return repos, nil
}

// extractNumber finds the first number in a string.
func extractNumber(s string) int {
	var num int
	inNumber := false
	for _, ch := range s {
		if ch >= '0' && ch <= '9' {
			num = num*10 + int(ch-'0')
			inNumber = true
		} else if ch == ',' && inNumber {
			// Skip commas in numbers like "1,234"
			continue
		} else if inNumber {
			break
		}
	}
	return num
}

// ── Bilibili Hot ─────────────────────────────────────────────────────

// BilibiliHot returns the current Bilibili popular videos.
//
//	GET /api/v1/trending/bilibili
func (h *TrendingHandler) BilibiliHot(c *gin.Context) {
	const cacheKey = "bilibili_hot"

	if cached, ok := h.getCached(cacheKey); ok {
		c.JSON(http.StatusOK, gin.H{"data": cached, "cached": true})
		return
	}

	videos, err := fetchBilibiliHot()
	if err != nil {
		log.Printf("[trending] bilibili fetch error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch Bilibili hot"})
		return
	}

	h.setCache(cacheKey, videos)
	c.JSON(http.StatusOK, gin.H{"data": videos, "cached": false})
}

func fetchBilibiliHot() ([]BilibiliHotVideo, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", "https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Referer", "https://www.bilibili.com")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bilibili request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("bilibili returned status %d", resp.StatusCode)
	}

	var result struct {
		Code int `json:"code"`
		Data struct {
			List []struct {
				Title    string `json:"title"`
				Bvid     string `json:"bvid"`
				Duration int    `json:"duration"`
				Owner    struct {
					Name string `json:"name"`
				} `json:"owner"`
				Stat struct {
					View    int64 `json:"view"`
					Danmaku int64 `json:"danmaku"`
				} `json:"stat"`
			} `json:"list"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("bilibili decode failed: %w", err)
	}

	if result.Code != 0 {
		return nil, fmt.Errorf("bilibili API error code: %d", result.Code)
	}

	videos := make([]BilibiliHotVideo, 0, len(result.Data.List))
	for _, item := range result.Data.List {
		videos = append(videos, BilibiliHotVideo{
			Title:    item.Title,
			Bvid:     item.Bvid,
			Owner:    item.Owner.Name,
			View:     item.Stat.View,
			Danmaku:  item.Stat.Danmaku,
			Duration: item.Duration,
			URL:      "https://www.bilibili.com/video/" + item.Bvid,
		})
	}

	return videos, nil
}
