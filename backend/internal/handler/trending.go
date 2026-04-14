// Package handler provides HTTP handlers for trending/hot content endpoints.
package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
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
	Cover    string `json:"cover"`
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

// numberRe 用于从文本中提取带逗号的数字，如 "28,530" 或 "5,733 stars today"
var numberRe = regexp.MustCompile(`[\d,]+`)

func fetchGithubTrending() ([]GithubTrendingRepo, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", "https://github.com/trending?since=daily", nil)
	if err != nil {
		return nil, fmt.Errorf("github trending request failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")
	req.Header.Set("Accept", "text/html")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github trending request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github trending returned status %d", resp.StatusCode)
	}

	return parseGithubTrendingHTML(resp)
}

// parseGithubTrendingHTML 使用 goquery 通过 CSS 选择器精确提取 GitHub trending 页面数据。
func parseGithubTrendingHTML(resp *http.Response) ([]GithubTrendingRepo, error) {
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("github trending parse html failed: %w", err)
	}

	var repos []GithubTrendingRepo

	doc.Find("article.Box-row").Each(func(_ int, s *goquery.Selection) {
		repo := GithubTrendingRepo{}

		// 提取仓库名称和 URL — h2 > a[href]
		s.Find("h2 a").Each(func(_ int, a *goquery.Selection) {
			if href, exists := a.Attr("href"); exists {
				fullName := strings.TrimSpace(href)
				fullName = strings.TrimPrefix(fullName, "/")
				if fullName != "" {
					repo.FullName = fullName
					repo.URL = "https://github.com/" + fullName
				}
			}
		})

		if repo.FullName == "" {
			return
		}

		// 提取描述 — p 标签
		desc := strings.TrimSpace(s.Find("p").First().Text())
		if len(desc) > 200 {
			desc = desc[:200] + "…"
		}
		repo.Description = desc

		// 提取编程语言 — span[itemprop="programmingLanguage"]
		repo.Language = strings.TrimSpace(s.Find(`span[itemprop="programmingLanguage"]`).Text())

		// 提取总 star 数 — href 以 /stargazers 结尾的 <a> 标签
		starText := strings.TrimSpace(s.Find(`a[href$="/stargazers"]`).Text())
		repo.Stars = parseFormattedNumber(starText)

		// 提取今日新增 star 数 — 包含 "stars today" 或 "stars this" 的 <span>
		s.Find("span.d-inline-block.float-sm-right").Each(func(_ int, span *goquery.Selection) {
			text := strings.TrimSpace(span.Text())
			if strings.Contains(text, "stars today") || strings.Contains(text, "stars this") {
				repo.TodayStars = parseFormattedNumber(text)
			}
		})

		repos = append(repos, repo)
	})

	if len(repos) == 0 {
		return nil, fmt.Errorf("no trending repos found in HTML")
	}

	if len(repos) > 25 {
		repos = repos[:25]
	}

	return repos, nil
}

// parseFormattedNumber 从字符串中提取第一个带逗号分隔的数字并转为 int。
// 例如 "28,530" → 28530, "5,733 stars today" → 5733
func parseFormattedNumber(s string) int {
	match := numberRe.FindString(s)
	if match == "" {
		return 0
	}
	// 移除逗号后解析
	clean := strings.ReplaceAll(match, ",", "")
	var num int
	for _, ch := range clean {
		if ch >= '0' && ch <= '9' {
			num = num*10 + int(ch-'0')
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
				Pic      string `json:"pic"`
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
			Cover:    item.Pic,
			URL:      "https://www.bilibili.com/video/" + item.Bvid,
		})
	}

	return videos, nil
}
