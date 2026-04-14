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
	"golang.org/x/sync/singleflight"
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

// getOrFetch 先检查缓存，缓存未命中时通过 singleflight 确保同一 key
// 只有一个请求在飞，避免对上游数据源造成重复请求压力。
func (h *TrendingHandler) getOrFetch(key string, fetchFn func() (interface{}, error)) (data interface{}, cached bool, err error) {
	if d, ok := h.getCached(key); ok {
		return d, true, nil
	}

	val, err, _ := h.sf.Do(key, func() (interface{}, error) {
		// 再次检查缓存，可能在等待 singleflight 的过程中已经被其他请求填充
		if d, ok := h.getCached(key); ok {
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
	const cacheKey = "github_trending"

	data, cached, err := h.getOrFetch(cacheKey, func() (interface{}, error) {
		return fetchGithubTrending()
	})
	if err != nil {
		log.Printf("[trending] github fetch error: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch GitHub trending"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": data, "cached": cached})
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

	data, cached, err := h.getOrFetch(cacheKey, func() (interface{}, error) {
		return fetchBilibiliHot()
	})
	if err != nil {
		log.Printf("[trending] bilibili fetch error: %v", err)
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

	data, cached, err := h.getOrFetch(cacheKey, func() (interface{}, error) {
		return fetchXiaohongshuHot()
	})
	if err != nil {
		log.Printf("[trending] xiaohongshu fetch error: %v", err)
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
	log.Printf("[trending] xiaohongshu 60s API failed: %v, trying vvhan", err)

	// 备选1：vvhan 聚合 API
	items, err = fetchXiaohongshuFromVvhanAPI()
	if err == nil && len(items) > 0 {
		return items, nil
	}
	log.Printf("[trending] xiaohongshu vvhan API failed: %v, trying web scrape", err)

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

	data, cached, err := h.getOrFetch(cacheKey, func() (interface{}, error) {
		return fetchWeiboHot()
	})
	if err != nil {
		log.Printf("[trending] weibo fetch error: %v", err)
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

	data, cached, err := h.getOrFetch(cacheKey, func() (interface{}, error) {
		return fetchBBCNews()
	})
	if err != nil {
		log.Printf("[trending] bbc fetch error: %v", err)
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
	log.Printf("[trending] bbc webpage scrape failed: %v, trying RSS feed", err)

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
