// Package handler provides HTTP handlers for trending/hot content endpoints.
package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/gin-gonic/gin"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
	"golang.org/x/sync/singleflight"

	"github.com/CatHeadTab/backend/internal/logger"
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
// and cached for 1 hour. Uses singleflight to prevent duplicate
// concurrent requests to upstream data sources.
type TrendingHandler struct {
	mu    sync.RWMutex
	cache map[string]*cacheEntry
	ttl   time.Duration
	sf    singleflight.Group
}

// NewTrendingHandler creates a TrendingHandler with default 1-hour TTL.
func NewTrendingHandler() *TrendingHandler {
	return &TrendingHandler{
		cache: make(map[string]*cacheEntry),
		ttl:   1 * time.Hour,
	}
}

func (h *TrendingHandler) getCached(key string, ttl time.Duration) (interface{}, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.cache[key]
	if !ok || time.Since(entry.fetchedAt) > ttl {
		return nil, false
	}
	return entry.data, true
}

func (h *TrendingHandler) setCache(key string, data interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cache[key] = &cacheEntry{data: data, fetchedAt: time.Now()}
}

// getOrFetch 先检查缓存，缓存未命中时通过 singleflight 确保同一 key
// 只有一个请求在飞，避免对上游数据源造成重复请求压力。
func (h *TrendingHandler) getOrFetch(key string, ttl time.Duration, fetchFn func() (interface{}, error)) (data interface{}, cached bool, err error) {
	if d, ok := h.getCached(key, ttl); ok {
		return d, true, nil
	}

	val, err, _ := h.sf.Do(key, func() (interface{}, error) {
		// 再次检查缓存，可能在等待 singleflight 的过程中已经被其他请求填充
		if d, ok := h.getCached(key, ttl); ok {
			return d, nil
		}
		result, fetchErr := fetchFn()
		if fetchErr != nil {
			return nil, fetchErr
		}
		h.setCache(key, result)
		return result, nil
	})
	if err != nil {
		return nil, false, err
	}
	return val, false, nil
}

// ── GitHub Trending ──────────────────────────────────────────────────

// GithubTrending returns the current GitHub trending repositories.
//
//	GET /api/v1/trending/github
func (h *TrendingHandler) GithubTrending(c *gin.Context) {
	lang := c.Query("lang")
	since := c.Query("since")

	cacheKey := "github_trending"
	if lang != "" {
		cacheKey += "_lang_" + lang
	}
	if since != "" {
		cacheKey += "_since_" + since
	}

	data, cached, err := h.getOrFetch(cacheKey, h.ttl, func() (interface{}, error) {
		return fetchGithubTrending(lang, since)
	})
	if err != nil {
		logger.Error("[trending] github fetch error", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch GitHub trending"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
}

// numberRe 用于从文本中提取带逗号的数字，如 "28,530" 或 "5,733 stars today"
var numberRe = regexp.MustCompile(`[\d,]+`)

func fetchGithubTrending(lang string, since string) ([]GithubTrendingRepo, error) {
	if since != "" {
		return fetchGithubTrendingWithParams(lang, since)
	}

	// Try daily first; if too few results, fall back to weekly
	repos, err := fetchGithubTrendingWithParams(lang, "daily")
	if err == nil && len(repos) >= 15 {
		return repos, nil
	}
	logger.Info("[trending] github daily returned few repos, trying weekly", "count", len(repos))

	weeklyRepos, weeklyErr := fetchGithubTrendingWithParams(lang, "weekly")
	if weeklyErr != nil {
		// If weekly also fails, return whatever daily gave us (or its error)
		if err != nil {
			return nil, err
		}
		return repos, nil
	}
	return weeklyRepos, nil
}

func fetchGithubTrendingWithParams(lang string, since string) ([]GithubTrendingRepo, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	
	urlStr := "https://github.com/trending"
	if lang != "" {
		urlStr += "/" + url.PathEscape(lang)
	}
	if since != "" {
		urlStr += "?since=" + since
	}
	
	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return nil, fmt.Errorf("github trending request failed: %w", err)
	}
	// Use standard browser headers to avoid GitHub Cloudflare / anti-bot blocking (which sometimes returns 200 OK with captcha HTML or 504)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

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

	if len(repos) > 30 {
		repos = repos[:30]
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

	data, cached, err := h.getOrFetch(cacheKey, h.ttl, func() (interface{}, error) {
		return fetchBilibiliHot()
	})
	if err != nil {
		logger.Error("[trending] bilibili fetch error", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch Bilibili hot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
}

// ── Xiaohongshu Hot ──────────────────────────────────────────────────

// XiaohongshuHotItem 表示一条小红书热搜条目。
type XiaohongshuHotItem struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	Score string `json:"score"`
	Rank  int    `json:"rank"`
}

// XiaohongshuHot 返回小红书热搜榜数据。
//
//	GET /api/v1/trending/xiaohongshu
func (h *TrendingHandler) XiaohongshuHot(c *gin.Context) {
	const cacheKey = "xiaohongshu_hot"

	data, cached, err := h.getOrFetch(cacheKey, h.ttl, func() (interface{}, error) {
		return fetchXiaohongshuHot()
	})
	if err != nil {
		logger.Error("[trending] xiaohongshu fetch error", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch Xiaohongshu hot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
}

func fetchXiaohongshuHot() ([]XiaohongshuHotItem, error) {
	// 优先使用 60s API（开源、稳定、实时）
	items, err := fetchXiaohongshuFrom60sAPI()
	if err == nil && len(items) > 0 {
		return items, nil
	}
	logger.Warn("[trending] xiaohongshu 60s API failed, trying vvhan", "error", err)

	// 备选1：vvhan 聚合 API
	items, err = fetchXiaohongshuFromVvhanAPI()
	if err == nil && len(items) > 0 {
		return items, nil
	}
	logger.Warn("[trending] xiaohongshu vvhan API failed, trying web scrape", "error", err)

	// 备选2：通过爬取网页获取
	return fetchXiaohongshuHotFallback()
}

// fetchXiaohongshuFrom60sAPI 使用 60s 开源 API 获取小红书热搜。
// 接口文档：https://docs.60s-api.viki.moe/
// 开源地址：https://github.com/vikiboss/60s
func fetchXiaohongshuFrom60sAPI() ([]XiaohongshuHotItem, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequest("GET", "https://60s.viki.moe/v2/rednote", nil)
	if err != nil {
		return nil, fmt.Errorf("xiaohongshu 60s API request build failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("xiaohongshu 60s API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("xiaohongshu 60s API returned status %d", resp.StatusCode)
	}

	var result struct {
		Code int `json:"code"`
		Data []struct {
			Rank     int    `json:"rank"`
			Title    string `json:"title"`
			Score    string `json:"score"`
			WordType string `json:"word_type"`
			Link     string `json:"link"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("xiaohongshu 60s API decode failed: %w", err)
	}

	if result.Code != 200 || len(result.Data) == 0 {
		return nil, fmt.Errorf("xiaohongshu 60s API returned code %d with %d items", result.Code, len(result.Data))
	}

	items := make([]XiaohongshuHotItem, 0, len(result.Data))
	for _, entry := range result.Data {
		if entry.Title == "" {
			continue
		}
		url := entry.Link
		if url == "" {
			url = "https://www.xiaohongshu.com/search_result?keyword=" + entry.Title
		}
		items = append(items, XiaohongshuHotItem{
			Title: entry.Title,
			URL:   url,
			Score: entry.Score,
			Rank:  entry.Rank,
		})
		if len(items) >= 30 {
			break
		}
	}

	return items, nil
}

// fetchXiaohongshuFromVvhanAPI 使用 vvhan 聚合 API 获取小红书热搜（备选）。
func fetchXiaohongshuFromVvhanAPI() ([]XiaohongshuHotItem, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequest("GET", "https://api.vvhan.com/api/hotlist/xiaohongshu", nil)
	if err != nil {
		return nil, fmt.Errorf("xiaohongshu vvhan API request build failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("xiaohongshu vvhan API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("xiaohongshu vvhan API returned status %d", resp.StatusCode)
	}

	var result struct {
		Success bool `json:"success"`
		Data    []struct {
			Title string `json:"title"`
			URL   string `json:"url"`
			Hot   string `json:"hot"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("xiaohongshu vvhan API decode failed: %w", err)
	}

	if !result.Success || len(result.Data) == 0 {
		return nil, fmt.Errorf("xiaohongshu vvhan API returned empty data")
	}

	items := make([]XiaohongshuHotItem, 0, len(result.Data))
	for i, entry := range result.Data {
		if entry.Title == "" {
			continue
		}
		url := entry.URL
		if url == "" {
			url = "https://www.xiaohongshu.com/search_result?keyword=" + entry.Title
		}
		items = append(items, XiaohongshuHotItem{
			Title: entry.Title,
			URL:   url,
			Score: entry.Hot,
			Rank:  i + 1,
		})
		if len(items) >= 30 {
			break
		}
	}

	return items, nil
}

// fetchXiaohongshuHotFallback 通过爬取网页获取小红书热搜（最终备选）。
func fetchXiaohongshuHotFallback() ([]XiaohongshuHotItem, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", "https://www.xiaohongshu.com/explore", nil)
	if err != nil {
		return nil, fmt.Errorf("xiaohongshu fallback request build failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("xiaohongshu fallback request failed: %w", err)
	}
	defer resp.Body.Close()

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("xiaohongshu fallback parse failed: %w", err)
	}

	var items []XiaohongshuHotItem
	doc.Find("a.title, a.cover").Each(func(i int, s *goquery.Selection) {
		title := strings.TrimSpace(s.Text())
		href, _ := s.Attr("href")
		if title != "" && href != "" {
			url := href
			if strings.HasPrefix(href, "/") {
				url = "https://www.xiaohongshu.com" + href
			}
			items = append(items, XiaohongshuHotItem{
				Title: title,
				URL:   url,
				Rank:  len(items) + 1,
			})
		}
	})

	if len(items) > 30 {
		items = items[:30]
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("no xiaohongshu hot items found in webpage")
	}

	return items, nil
}

// ── Weibo Hot ────────────────────────────────────────────────────────

// WeiboHotItem 表示一条微博热搜条目。
type WeiboHotItem struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	HotNum  int64  `json:"hotNum"`
	Tag     string `json:"tag"`
	Rank    int    `json:"rank"`
}

// WeiboHot 返回微博热搜榜数据。
//
//	GET /api/v1/trending/weibo
func (h *TrendingHandler) WeiboHot(c *gin.Context) {
	const cacheKey = "weibo_hot"

	data, cached, err := h.getOrFetch(cacheKey, h.ttl, func() (interface{}, error) {
		return fetchWeiboHot()
	})
	if err != nil {
		logger.Error("[trending] weibo fetch error", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch Weibo hot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
}

func fetchWeiboHot() ([]WeiboHotItem, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", "https://weibo.com/ajax/side/hotSearch", nil)
	if err != nil {
		return nil, fmt.Errorf("weibo request build failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")
	req.Header.Set("Referer", "https://weibo.com")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("weibo request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("weibo returned status %d", resp.StatusCode)
	}

	var result struct {
		OK   int `json:"ok"`
		Data struct {
			Realtime []struct {
				Word    string `json:"word"`
				RawHot  int64  `json:"raw_hot"`
				LabelName string `json:"label_name"`
			} `json:"realtime"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("weibo decode failed: %w", err)
	}

	items := make([]WeiboHotItem, 0, len(result.Data.Realtime))
	for i, entry := range result.Data.Realtime {
		if entry.Word == "" {
			continue
		}
		items = append(items, WeiboHotItem{
			Title:  entry.Word,
			URL:    "https://s.weibo.com/weibo?q=" + entry.Word,
			HotNum: entry.RawHot,
			Tag:    entry.LabelName,
			Rank:   i + 1,
		})
		if len(items) >= 50 {
			break
		}
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("no weibo hot items found")
	}

	return items, nil
}

// ── BBC News ─────────────────────────────────────────────────────────

// BBCNewsItem 表示一条 BBC 新闻条目。
type BBCNewsItem struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Section     string `json:"section"`
	Rank        int    `json:"rank"`
}

// BBCNews 返回 BBC 新闻头条数据。
//
//	GET /api/v1/trending/bbc
func (h *TrendingHandler) BBCNews(c *gin.Context) {
	const cacheKey = "bbc_news"

	data, cached, err := h.getOrFetch(cacheKey, h.ttl, func() (interface{}, error) {
		return fetchBBCNews()
	})
	if err != nil {
		logger.Error("[trending] bbc fetch error", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch BBC News"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
}

func fetchBBCNews() ([]BBCNewsItem, error) {
	// 优先尝试爬取 BBC 新闻网页（RSS feed 在部分网络环境下不可用）
	items, err := fetchBBCNewsFromWebpage()
	if err == nil && len(items) > 0 {
		return items, nil
	}
	logger.Warn("[trending] bbc webpage scrape failed, trying RSS feed", "error", err)

	// 备选：RSS feed
	return fetchBBCNewsFromRSS()
}

// fetchBBCNewsFromWebpage 通过爬取 BBC News 网页获取新闻头条。
func fetchBBCNewsFromWebpage() ([]BBCNewsItem, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", "https://www.bbc.com/news", nil)
	if err != nil {
		return nil, fmt.Errorf("bbc webpage request build failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bbc webpage request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("bbc webpage returned status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("bbc webpage parse failed: %w", err)
	}

	seen := make(map[string]bool)
	var items []BBCNewsItem

	// BBC 网页使用 data-testid="card-headline" 的 h2 标签展示新闻标题，
	// 对应的 <a> 链接在父级元素中。
	doc.Find(`h2[data-testid="card-headline"]`).Each(func(_ int, h2 *goquery.Selection) {
		title := strings.TrimSpace(h2.Text())
		if title == "" {
			return
		}

		// 去重
		if seen[title] {
			return
		}

		// 向上查找最近的 <a> 标签获取链接
		var link string
		parent := h2.Parent()
		for i := 0; i < 5 && parent.Length() > 0; i++ {
			if parent.Is("a") {
				href, exists := parent.Attr("href")
				if exists {
					link = href
				}
				break
			}
			parent = parent.Parent()
		}

		// 如果 h2 内部或相邻有 <a> 标签
		if link == "" {
			h2.Find("a").Each(func(_ int, a *goquery.Selection) {
				if href, exists := a.Attr("href"); exists && link == "" {
					link = href
				}
			})
		}

		// 补全相对路径
		if link != "" && strings.HasPrefix(link, "/") {
			link = "https://www.bbc.com" + link
		}

		if link == "" {
			return
		}

		seen[title] = true

		// 从 URL 中提取 section 信息
		section := ""
		if strings.Contains(link, "/news/articles/") {
			section = "News"
		} else if strings.Contains(link, "/sport/") {
			section = "Sport"
		} else if strings.Contains(link, "/business/") {
			section = "Business"
		} else if strings.Contains(link, "/technology/") {
			section = "Technology"
		}

		items = append(items, BBCNewsItem{
			Title:   title,
			URL:     link,
			Section: section,
			Rank:    len(items) + 1,
		})
	})

	if len(items) > 30 {
		items = items[:30]
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("no BBC news items found in webpage")
	}

	return items, nil
}

// fetchBBCNewsFromRSS 通过 BBC RSS feed 获取新闻（备选方案）。
func fetchBBCNewsFromRSS() ([]BBCNewsItem, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", "http://feeds.bbci.co.uk/news/rss.xml", nil)
	if err != nil {
		return nil, fmt.Errorf("bbc rss request build failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bbc rss request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("bbc rss returned status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("bbc rss parse failed: %w", err)
	}

	var items []BBCNewsItem
	doc.Find("item").Each(func(i int, s *goquery.Selection) {
		title := strings.TrimSpace(s.Find("title").Text())
		link := strings.TrimSpace(s.Find("link").Text())
		desc := strings.TrimSpace(s.Find("description").Text())

		if title == "" || link == "" {
			return
		}

		items = append(items, BBCNewsItem{
			Title:       title,
			Description: desc,
			URL:         link,
			Rank:        len(items) + 1,
		})
	})

	if len(items) > 30 {
		items = items[:30]
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("no BBC news items found in RSS")
	}

	return items, nil
}

// ── Exchange Rate ─────────────────────────────────────────────────────

// ExchangeRateRequest 汇率请求参数。
type ExchangeRateRequest struct {
	Pairs []struct {
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"pairs"`
}

// ExchangeRateItem 汇率数据项。
type ExchangeRateItem struct {
	From   string  `json:"from"`
	To     string  `json:"to"`
	Rate   float64 `json:"rate"`
	Change float64 `json:"change"`
}

// ExchangeRate 返回指定货币对的汇率数据（使用 Frankfurter API）。
// POST /api/v1/finance/exchange-rate
func (h *TrendingHandler) ExchangeRate(c *gin.Context) {
	var req ExchangeRateRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Pairs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request, pairs required"})
		return
	}

	// 按照 pairs 生成缓存 key
	cacheKey := "exchange_rate_"
	for _, p := range req.Pairs {
		cacheKey += p.From + "_" + p.To + ","
	}

	data, cached, err := h.getOrFetch(cacheKey, 2*time.Minute, func() (interface{}, error) {
		return fetchExchangeRates(req)
	})
	if err != nil {
		logger.Error("[finance] exchange rate fetch error", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch exchange rates"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
}

// fetchExchangeRates 从 Frankfurter API 获取汇率数据。
func fetchExchangeRates(req ExchangeRateRequest) ([]ExchangeRateItem, error) {
	if len(req.Pairs) == 0 {
		return nil, fmt.Errorf("no currency pairs provided")
	}

	// 按基准货币分组以减少 API 调用
	byBase := make(map[string][]string)
	for _, p := range req.Pairs {
		if p.From == "" || p.To == "" {
			continue
		}
		targets := byBase[p.From]
		found := false
		for _, t := range targets {
			if t == p.To {
				found = true
				break
			}
		}
		if !found {
			byBase[p.From] = append(targets, p.To)
		}
	}

	client := &http.Client{Timeout: 10 * time.Second}

	type rateResult struct {
		key  string
		rate float64
	}
	type prevResult struct {
		key  string
		rate float64
	}

	var mu sync.Mutex
	latestRates := make(map[string]float64)
	prevRates := make(map[string]float64)

	// 获取昨日日期（跳过周末）
	yesterday := time.Now().AddDate(0, 0, -1)
	if yesterday.Weekday() == time.Sunday {
		yesterday = yesterday.AddDate(0, 0, -2)
	} else if yesterday.Weekday() == time.Saturday {
		yesterday = yesterday.AddDate(0, 0, -1)
	}
	dateStr := yesterday.Format("2006-01-02")

	var wg sync.WaitGroup

	for base, targets := range byBase {
		to := strings.Join(targets, ",")

		// 获取最新汇率
		wg.Add(1)
		go func(base, to string) {
			defer wg.Done()
			url := fmt.Sprintf("https://api.frankfurter.dev/v1/latest?from=%s&to=%s", base, to)
			reqHTTP, err := http.NewRequest("GET", url, nil)
			if err != nil {
				logger.Error("[finance] frankfurter latest request build failed", "error", err)
				return
			}
			reqHTTP.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")

			resp, err := client.Do(reqHTTP)
			if err != nil {
				logger.Error("[finance] frankfurter latest request failed", "error", err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != 200 {
				logger.Warn("[finance] frankfurter latest returned non-200 status", "status", resp.StatusCode)
				return
			}

			var result struct {
				Rates map[string]float64 `json:"rates"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				logger.Error("[finance] frankfurter latest decode failed", "error", err)
				return
			}

			mu.Lock()
			for code, rate := range result.Rates {
				latestRates[base+"_"+code] = rate
			}
			mu.Unlock()
		}(base, to)

		// 获取昨日汇率
		wg.Add(1)
		go func(base, to, date string) {
			defer wg.Done()
			url := fmt.Sprintf("https://api.frankfurter.dev/v1/%s?from=%s&to=%s", date, base, to)
			reqHTTP, err := http.NewRequest("GET", url, nil)
			if err != nil {
				return
			}
			reqHTTP.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")

			resp, err := client.Do(reqHTTP)
			if err != nil {
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != 200 {
				return
			}

			var result struct {
				Rates map[string]float64 `json:"rates"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				return
			}

			mu.Lock()
			for code, rate := range result.Rates {
				prevRates[base+"_"+code] = rate
			}
			mu.Unlock()
		}(base, to, dateStr)
	}

	wg.Wait()

	items := make([]ExchangeRateItem, 0, len(req.Pairs))
	for _, p := range req.Pairs {
		key := p.From + "_" + p.To
		rate := latestRates[key]
		prev := prevRates[key]
		change := 0.0
		if prev > 0 {
			change = ((rate - prev) / prev) * 100
		}
		items = append(items, ExchangeRateItem{
			From:   p.From,
			To:     p.To,
			Rate:   rate,
			Change: change,
		})
	}

	return items, nil
}

// ── Stock Quotes ─────────────────────────────────────────────────────

// StockQuoteRequest 股票行情请求参数。
type StockQuoteRequest struct {
	Items    []StockRequestItem `json:"items"`
	Language string             `json:"language"`
}

// StockRequestItem 请求的单个股票。
type StockRequestItem struct {
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
	Market string `json:"market"` // US, HK, CN
}

// StockQuoteItem 股票行情响应数据。
type StockQuoteItem struct {
	Symbol        string  `json:"symbol"`
	Name          string  `json:"name"`
	Market        string  `json:"market"`
	Price         float64 `json:"price"`
	Change        float64 `json:"change"`
	ChangePercent float64 `json:"changePercent"`
	Open          float64 `json:"open"`
	High          float64 `json:"high"`
	Low           float64 `json:"low"`
	PrevClose     float64 `json:"prevClose"`
	Volume        float64 `json:"volume"`
	MarketCap     float64 `json:"marketCap"`
	Currency      string  `json:"currency"`
	Error         bool    `json:"error,omitempty"`
}

// StockQuotes 返回指定股票的行情数据。
// POST /api/v1/finance/stock-quotes
func (h *TrendingHandler) StockQuotes(c *gin.Context) {
	var req StockQuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request, items required"})
		return
	}

	// 生成缓存 key，包含语言和所有股票代码
	cacheKey := "stock_quotes_" + req.Language + "_"
	for _, item := range req.Items {
		cacheKey += item.Symbol + ","
	}

	data, cached, err := h.getOrFetch(cacheKey, 2*time.Minute, func() (interface{}, error) {
		return fetchStockQuotes(req)
	})
	if err != nil {
		logger.Error("[finance] stock quotes fetch error", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch stock quotes"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
}

// sinaIndexMap Yahoo → Sina 指数符号映射。
var sinaIndexMap = map[string]string{
	"^GSPC":    "int_sp500",
	"^DJI":     "int_dji",
	"^IXIC":    "int_nasdaq",
	"^HSI":     "int_hangseng",
	"^HSCE":    "int_hscei",
	"^HSTECH":  "int_hstech",
}

// toSinaSymbol 将 Yahoo 格式股票代码转换为新浪财经格式。
func toSinaSymbol(symbol, market string) string {
	if mapped, ok := sinaIndexMap[symbol]; ok {
		return mapped
	}
	switch market {
	case "US":
		return "gb_" + strings.ToLower(symbol)
	case "HK":
		code := strings.TrimSuffix(symbol, ".HK")
		for len(code) < 5 {
			code = "0" + code
		}
		return "hk" + code
	case "CN":
		if strings.HasSuffix(symbol, ".SS") {
			return "sh" + strings.TrimSuffix(symbol, ".SS")
		}
		if strings.HasSuffix(symbol, ".SZ") {
			return "sz" + strings.TrimSuffix(symbol, ".SZ")
		}
		return symbol
	default:
		return symbol
	}
}

// defaultCurrencyForMarket 获取市场对应的默认货币。
func defaultCurrencyForMarket(market string) string {
	switch market {
	case "US":
		return "USD"
	case "HK":
		return "HKD"
	case "CN":
		return "CNY"
	default:
		return "USD"
	}
}

// fetchStockQuotes 获取股票行情，中文优先使用新浪财经，英文优先使用 Yahoo Finance。
func fetchStockQuotes(req StockQuoteRequest) ([]StockQuoteItem, error) {
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("no stock items provided")
	}

	isZh := req.Language == "zh"

	var primary func([]StockRequestItem) ([]StockQuoteItem, error)
	var fallback func([]StockRequestItem) ([]StockQuoteItem, error)

	if isZh {
		primary = fetchStockQuotesSina
		fallback = fetchStockQuotesYahoo
	} else {
		primary = fetchStockQuotesYahoo
		fallback = fetchStockQuotesSina
	}

	result, err := primary(req.Items)
	if err == nil {
		return result, nil
	}
	logger.Warn("[finance] stock primary source failed, trying fallback", "error", err)

	return fallback(req.Items)
}

// fetchStockQuotesSina 通过新浪财经 API 批量获取股票行情。
func fetchStockQuotesSina(items []StockRequestItem) ([]StockQuoteItem, error) {
	sinaSymbols := make([]string, len(items))
	for i, item := range items {
		sinaSymbols[i] = toSinaSymbol(item.Symbol, item.Market)
	}

	url := "https://hq.sinajs.cn/list=" + strings.Join(sinaSymbols, ",")

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("sina request build failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Referer", "https://finance.sina.com.cn/")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sina request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("sina returned status %d", resp.StatusCode)
	}

	// 新浪 API 返回 GBK 编码，需要使用 golang.org/x/text 转换为 UTF-8
	gbkReader := transform.NewReader(resp.Body, simplifiedchinese.GBK.NewDecoder())
	bodyBytes, err := io.ReadAll(gbkReader)
	if err != nil {
		return nil, fmt.Errorf("sina response read failed: %w", err)
	}
	text := string(bodyBytes)

	lines := strings.Split(text, "\n")
	var validLines []string
	for _, l := range lines {
		if strings.TrimSpace(l) != "" {
			validLines = append(validLines, l)
		}
	}

	quotes := make([]StockQuoteItem, len(items))
	for i, item := range items {
		quotes[i] = makeErrorQuote(item)
		if i >= len(validLines) {
			continue
		}
		line := validLines[i]
		sinaSymbol := toSinaSymbol(item.Symbol, item.Market)

		var parsed *StockQuoteItem
		if strings.HasPrefix(sinaSymbol, "int_") {
			parsed = parseSinaIndex(line, item)
		} else {
			switch item.Market {
			case "CN":
				parsed = parseSinaCN(line, item)
			case "HK":
				parsed = parseSinaHK(line, item)
			case "US":
				parsed = parseSinaUS(line, item)
			}
		}

		if parsed != nil {
			quotes[i] = *parsed
		}
	}

	// 如果全部失败则返回错误
	allError := true
	for _, q := range quotes {
		if !q.Error {
			allError = false
			break
		}
	}
	if allError {
		return nil, fmt.Errorf("all sina requests failed")
	}

	return quotes, nil
}

// makeErrorQuote 创建错误占位报价。
func makeErrorQuote(item StockRequestItem) StockQuoteItem {
	return StockQuoteItem{
		Symbol:   item.Symbol,
		Name:     item.Name,
		Market:   item.Market,
		Currency: defaultCurrencyForMarket(item.Market),
		Error:    true,
	}
}

// parseSinaFields 从新浪 API 响应行中提取字段。
func parseSinaFields(line string) []string {
	idx := strings.Index(line, `="`)
	if idx == -1 {
		return nil
	}
	data := line[idx+2:]
	data = strings.TrimSuffix(data, `";`)
	data = strings.TrimSuffix(data, `"`)
	if data == "" {
		return nil
	}
	return strings.Split(data, ",")
}

// parseSinaIndex 解析新浪国际指数数据。
func parseSinaIndex(line string, item StockRequestItem) *StockQuoteItem {
	parts := parseSinaFields(line)
	if len(parts) < 2 {
		return nil
	}

	price := parseFloat(parts[1])
	if price == 0 {
		return nil
	}

	change := 0.0
	changePercent := 0.0
	open := 0.0
	high := 0.0
	low := 0.0
	prevClose := 0.0

	if len(parts) >= 9 {
		change = parseFloat(parts[3])
		changePercent = parseFloat(parts[4])
		open = parseFloat(parts[5])
		high = parseFloat(parts[6])
		low = parseFloat(parts[7])
		prevClose = parseFloat(parts[8])
	} else if len(parts) >= 5 {
		change = parseFloat(parts[3])
		changePercent = parseFloat(parts[4])
		prevClose = price - change
	}

	return &StockQuoteItem{
		Symbol:        item.Symbol,
		Name:          item.Name,
		Market:        item.Market,
		Price:         price,
		Change:        change,
		ChangePercent: changePercent,
		Open:          open,
		High:          high,
		Low:           low,
		PrevClose:     prevClose,
		Currency:      defaultCurrencyForMarket(item.Market),
	}
}

// parseSinaCN 解析新浪 A 股数据。
func parseSinaCN(line string, item StockRequestItem) *StockQuoteItem {
	parts := parseSinaFields(line)
	if len(parts) < 32 {
		return nil
	}

	name := parts[0]
	if name == "" {
		name = item.Name
	}
	price := parseFloat(parts[3])
	prevClose := parseFloat(parts[2])
	if price == 0 {
		return nil
	}
	change := price - prevClose
	changePercent := 0.0
	if prevClose > 0 {
		changePercent = (change / prevClose) * 100
	}

	return &StockQuoteItem{
		Symbol:        item.Symbol,
		Name:          name,
		Market:        "CN",
		Price:         price,
		Change:        change,
		ChangePercent: changePercent,
		Open:          parseFloat(parts[1]),
		High:          parseFloat(parts[4]),
		Low:           parseFloat(parts[5]),
		PrevClose:     prevClose,
		Volume:        parseFloat(parts[8]),
		Currency:      "CNY",
	}
}

// parseSinaHK 解析新浪港股数据。
func parseSinaHK(line string, item StockRequestItem) *StockQuoteItem {
	parts := parseSinaFields(line)
	if len(parts) < 13 {
		return nil
	}

	name := parts[1]
	if name == "" {
		name = item.Name
	}
	price := parseFloat(parts[6])
	if price == 0 {
		return nil
	}
	prevClose := parseFloat(parts[3])
	change := parseFloat(parts[7])
	if change == 0 {
		change = price - prevClose
	}
	changePercent := parseFloat(parts[8])
	if changePercent == 0 && prevClose > 0 {
		changePercent = (change / prevClose) * 100
	}

	return &StockQuoteItem{
		Symbol:        item.Symbol,
		Name:          name,
		Market:        "HK",
		Price:         price,
		Change:        change,
		ChangePercent: changePercent,
		Open:          parseFloat(parts[2]),
		High:          parseFloat(parts[4]),
		Low:           parseFloat(parts[5]),
		PrevClose:     prevClose,
		Volume:        parseFloat(parts[12]),
		Currency:      "HKD",
	}
}

// parseSinaUS 解析新浪美股数据。
func parseSinaUS(line string, item StockRequestItem) *StockQuoteItem {
	parts := parseSinaFields(line)
	if len(parts) < 18 {
		return nil
	}

	name := parts[0]
	if name == "" {
		name = item.Name
	}
	price := parseFloat(parts[1])
	if price == 0 {
		return nil
	}

	return &StockQuoteItem{
		Symbol:        item.Symbol,
		Name:          name,
		Market:        "US",
		Price:         price,
		Change:        parseFloat(parts[2]),
		ChangePercent: parseFloat(parts[4]),
		Open:          parseFloat(parts[5]),
		High:          parseFloat(parts[6]),
		Low:           parseFloat(parts[7]),
		PrevClose:     parseFloat(parts[17]),
		Volume:        parseFloat(parts[10]),
		MarketCap:     parseFloat(parts[12]),
		Currency:      "USD",
	}
}

// fetchStockQuotesYahoo 通过 Yahoo Finance v8 chart API 获取股票行情。
func fetchStockQuotesYahoo(items []StockRequestItem) ([]StockQuoteItem, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("no items")
	}

	type indexedQuote struct {
		index int
		quote StockQuoteItem
	}

	results := make([]StockQuoteItem, len(items))
	for i := range items {
		results[i] = makeErrorQuote(items[i])
	}

	var wg sync.WaitGroup
	var mu2 sync.Mutex

	for i, item := range items {
		wg.Add(1)
		go func(idx int, it StockRequestItem) {
			defer wg.Done()
			quote := fetchSingleYahooChart(it)
			mu2.Lock()
			results[idx] = quote
			mu2.Unlock()
		}(i, item)
	}
	wg.Wait()

	allError := true
	for _, q := range results {
		if !q.Error {
			allError = false
			break
		}
	}
	if allError {
		return nil, fmt.Errorf("all yahoo requests failed")
	}

	return results, nil
}

// fetchSingleYahooChart 通过 Yahoo Finance v8 chart 端点获取单只股票行情。
func fetchSingleYahooChart(item StockRequestItem) StockQuoteItem {
	hosts := []string{"query1.finance.yahoo.com", "query2.finance.yahoo.com"}
	client := &http.Client{Timeout: 8 * time.Second}

	for _, host := range hosts {
		url := fmt.Sprintf("https://%s/v8/finance/chart/%s?interval=1d&range=1d", host, item.Symbol)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")

		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			continue
		}

		var chartResp struct {
			Chart struct {
				Result []struct {
					Meta struct {
						RegularMarketPrice float64 `json:"regularMarketPrice"`
						ChartPreviousClose float64 `json:"chartPreviousClose"`
						PreviousClose      float64 `json:"previousClose"`
						Currency           string  `json:"currency"`
					} `json:"meta"`
					Indicators struct {
						Quote []struct {
							Open   []interface{} `json:"open"`
							High   []interface{} `json:"high"`
							Low    []interface{} `json:"low"`
							Volume []interface{} `json:"volume"`
						} `json:"quote"`
					} `json:"indicators"`
				} `json:"result"`
			} `json:"chart"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&chartResp); err != nil {
			continue
		}

		if len(chartResp.Chart.Result) == 0 {
			continue
		}

		meta := chartResp.Chart.Result[0].Meta
		price := meta.RegularMarketPrice
		prevClose := meta.ChartPreviousClose
		if prevClose == 0 {
			prevClose = meta.PreviousClose
		}
		change := price - prevClose
		changePercent := 0.0
		if prevClose > 0 {
			changePercent = (change / prevClose) * 100
		}

		currency := meta.Currency
		if currency == "" {
			currency = defaultCurrencyForMarket(item.Market)
		}

		// 提取 OHLCV
		open := 0.0
		high := 0.0
		low := 0.0
		volume := 0.0

		if len(chartResp.Chart.Result[0].Indicators.Quote) > 0 {
			q := chartResp.Chart.Result[0].Indicators.Quote[0]
			if len(q.Open) > 0 {
				open = toFloat64(q.Open[len(q.Open)-1])
			}
			for _, v := range q.High {
				f := toFloat64(v)
				if f > high {
					high = f
				}
			}
			for _, v := range q.Low {
				f := toFloat64(v)
				if f > 0 && (low == 0 || f < low) {
					low = f
				}
			}
			for _, v := range q.Volume {
				volume += toFloat64(v)
			}
		}

		return StockQuoteItem{
			Symbol:        item.Symbol,
			Name:          item.Name,
			Market:        item.Market,
			Price:         price,
			Change:        change,
			ChangePercent: changePercent,
			Open:          open,
			High:          high,
			Low:           low,
			PrevClose:     prevClose,
			Volume:        volume,
			Currency:      currency,
		}
	}

	return makeErrorQuote(item)
}

// parseFloat 安全地将字符串转换为 float64。
func parseFloat(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	var result float64
	fmt.Sscanf(s, "%f", &result)
	return result
}

// toFloat64 将 interface{} 转换为 float64。
func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case nil:
		return 0
	default:
		return 0
	}
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

	if len(videos) == 0 {
		return nil, fmt.Errorf("no bilibili hot videos found")
	}

	return videos, nil
}
