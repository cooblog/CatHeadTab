// Package handler provides HTTP handlers for favicon proxy endpoints.
package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"image"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	// Register image decoders for size detection.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/semaphore"
	"golang.org/x/sync/singleflight"
)

const (
	faviconCacheDir     = "data/favicon_cache"
	faviconMaxSize      = 512 * 1024 // 512 KB max per icon
	faviconFetchTimeout = 8 * time.Second

	// faviconMinDesiredSize is the minimum acceptable dimension (width or height)
	// for the primary source (Google S2). If the returned icon is smaller than
	// this threshold, we fall through to alternative sources.
	faviconMinDesiredSize = 32

	// faviconMaxConcurrentFetches limits the number of concurrent outbound HTTP
	// requests to external favicon APIs to prevent goroutine explosion.
	faviconMaxConcurrentFetches = 10

	// faviconSemaphoreTimeout is how long we wait to acquire a semaphore slot
	// before giving up on this particular fetch attempt.
	faviconSemaphoreTimeout = 5 * time.Second
)

// faviconResult holds the result of a favicon fetch for singleflight sharing.
type faviconResult struct {
	data        []byte
	contentType string
}

// FaviconHandler handles HTTP requests for favicon proxy with disk caching.
type FaviconHandler struct {
	cacheDir   string
	httpClient *http.Client
	sfGroup    singleflight.Group        // deduplicates concurrent fetches for the same domain+size
	sem        *semaphore.Weighted       // limits concurrent outbound HTTP requests
}

// NewFaviconHandler creates a new FaviconHandler and ensures the cache directory exists.
func NewFaviconHandler() *FaviconHandler {
	h := &FaviconHandler{
		cacheDir: faviconCacheDir,
		httpClient: &http.Client{
			Timeout: faviconFetchTimeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
		sem: semaphore.NewWeighted(faviconMaxConcurrentFetches),
	}

	if err := os.MkdirAll(h.cacheDir, 0755); err != nil {
		log.Printf("⚠️  Failed to create favicon cache dir: %v", err)
	}

	return h
}

// Get handles GET /api/v1/favicon?domain=example.com&sz=64
// It returns a cached favicon or fetches one from multiple sources.
// Concurrent requests for the same domain+size are deduplicated via singleflight.
func (h *FaviconHandler) Get(c *gin.Context) {
	domain := c.Query("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain parameter is required"})
		return
	}

	// Normalize domain: strip protocol and path
	domain = normalizeDomain(domain)
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid domain"})
		return
	}

	sz := c.DefaultQuery("sz", "64")

	// Generate cache key
	cacheKey := fmt.Sprintf("%x", sha256.Sum256([]byte(domain+"_"+sz)))
	cachePath := filepath.Join(h.cacheDir, cacheKey)

	// Check disk cache
	if data, contentType, err := h.readCache(cachePath); err == nil {
		// Set aggressive cache headers — favicon rarely changes
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Header("X-Favicon-Cache", "HIT")
		c.Data(http.StatusOK, contentType, data)
		return
	}

	// Cache miss — use singleflight to deduplicate concurrent requests for the same key
	sfKey := domain + "_" + sz
	v, err, _ := h.sfGroup.Do(sfKey, func() (any, error) {
		// Double-check disk cache inside singleflight (another goroutine may have written it)
		if data, contentType, cacheErr := h.readCache(cachePath); cacheErr == nil {
			return &faviconResult{data: data, contentType: contentType}, nil
		}
		data, contentType, fetchErr := h.fetchFavicon(domain, sz)
		if fetchErr != nil {
			return nil, fetchErr
		}
		// Write to disk cache (best-effort, don't block response)
		go func() {
			if writeErr := h.writeCache(cachePath, data, contentType); writeErr != nil {
				log.Printf("⚠️  Failed to write favicon cache for %s: %v", domain, writeErr)
			}
		}()
		return &faviconResult{data: data, contentType: contentType}, nil
	})

	if err != nil {
		// Return a 1x1 transparent PNG as fallback
		c.Header("Cache-Control", "public, max-age=86400") // cache fallback for 1 day
		c.Header("X-Favicon-Cache", "MISS")
		c.Data(http.StatusOK, "image/png", transparentPNG())
		return
	}

	result := v.(*faviconResult)
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("X-Favicon-Cache", "MISS")
	c.Data(http.StatusOK, result.contentType, result.data)
}

// fetchFavicon tries multiple sources in priority order to get a favicon for the domain.
//
// Source priority:
//  1. Google S2 — with size validation (reject if returned image is smaller than desired)
//  2. DuckDuckGo API — fast response, ico format
//  3. Favicone (Vercel) — modern API with smart fallback, supports size parameter
//  4. Direct /favicon.ico from the website
//  5. HTML <link rel="icon"> parsing
func (h *FaviconHandler) fetchFavicon(domain, sz string) ([]byte, string, error) {
	desiredSize := parseDesiredSize(sz)

	// Source 1: Google S2 — validate returned image dimensions
	googleURL := fmt.Sprintf(
		"https://s2.googleusercontent.com/s2/favicons?domain_url=https://%s&sz=%s",
		url.QueryEscape(domain), sz,
	)
	if data, ct, err := h.fetchWithSemaphore(googleURL); err == nil && len(data) > 0 && isValidImage(data) {
		if isImageLargeEnough(data, desiredSize) {
			return data, ct, nil
		}
		log.Printf("ℹ️  Google S2 returned small icon for %s (%s), trying fallback sources", domain, sz)
	}

	// Source 2: DuckDuckGo API — fast, returns ico format
	duckURL := fmt.Sprintf("https://icons.duckduckgo.com/ip3/%s.ico", domain)
	if data, ct, err := h.fetchWithSemaphore(duckURL); err == nil && len(data) > 0 && isValidImage(data) {
		return data, ct, nil
	}

	// Source 3: Favicone (Vercel) — supports size parameter, smart fallback
	faviconeURL := fmt.Sprintf("https://favicone.com/%s?s=%s", domain, sz)
	if data, ct, err := h.fetchWithSemaphore(faviconeURL); err == nil && len(data) > 0 && isValidImage(data) {
		return data, ct, nil
	}

	// Source 4: Direct /favicon.ico from the website
	directURL := fmt.Sprintf("https://%s/favicon.ico", domain)
	if data, ct, err := h.fetchWithSemaphore(directURL); err == nil && len(data) > 0 && isValidImage(data) {
		return data, ct, nil
	}

	// Source 5: Parse HTML <link rel="icon"> tag
	if iconURL := h.parseHTMLFavicon(domain); iconURL != "" {
		if data, ct, err := h.fetchWithSemaphore(iconURL); err == nil && len(data) > 0 && isValidImage(data) {
			return data, ct, nil
		}
	}

	return nil, "", fmt.Errorf("all favicon sources failed for %s", domain)
}

// fetchWithSemaphore wraps fetchURL with semaphore-based concurrency control.
// It prevents goroutine explosion when many domains are fetched simultaneously.
func (h *FaviconHandler) fetchWithSemaphore(rawURL string) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), faviconSemaphoreTimeout)
	defer cancel()

	if err := h.sem.Acquire(ctx, 1); err != nil {
		return nil, "", fmt.Errorf("semaphore acquire timeout for %s: %w", rawURL, err)
	}
	defer h.sem.Release(1)

	return h.fetchURL(rawURL)
}

// parseDesiredSize converts the sz query parameter to an integer.
// Returns faviconMinDesiredSize as a safe default.
func parseDesiredSize(sz string) int {
	n, err := strconv.Atoi(sz)
	if err != nil || n <= 0 {
		return faviconMinDesiredSize
	}
	return n
}

// isImageLargeEnough decodes the image header and checks whether both
// dimensions meet the desired minimum size. ICO files that fail standard
// Go image decoding are accepted optimistically (they often contain
// multiple sizes).
func isImageLargeEnough(data []byte, desiredSize int) bool {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		// ICO and some other formats are not supported by Go's standard
		// image package. Accept them optimistically rather than rejecting.
		return true
	}
	minDim := faviconMinDesiredSize
	if desiredSize > 0 && desiredSize < minDim {
		minDim = desiredSize
	}
	return cfg.Width >= minDim && cfg.Height >= minDim
}

// fetchURL fetches raw bytes from a URL.
func (h *FaviconHandler) fetchURL(rawURL string) ([]byte, string, error) {
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")
	req.Header.Set("Accept", "image/*,*/*;q=0.8")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, faviconMaxSize))
	if err != nil {
		return nil, "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" || strings.HasPrefix(contentType, "text/") {
		// Try to detect from data
		contentType = http.DetectContentType(data)
	}

	return data, contentType, nil
}

// parseHTMLFavicon fetches the HTML of a domain's homepage and extracts the favicon URL.
func (h *FaviconHandler) parseHTMLFavicon(domain string) string {
	htmlURL := fmt.Sprintf("https://%s", domain)
	req, err := http.NewRequest("GET", htmlURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CatHeadTab/1.0)")
	req.Header.Set("Accept", "text/html")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	// Read up to 64KB of HTML — enough to find the <link> tags in <head>
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return ""
	}

	html := string(body)

	// Simple regex-free parser: look for <link ... rel="icon" ... href="...">
	// We search for patterns like rel="icon", rel="shortcut icon", rel="apple-touch-icon"
	lowerHTML := strings.ToLower(html)
	searchTerms := []string{`rel="icon"`, `rel="shortcut icon"`, `rel="apple-touch-icon"`}

	for _, term := range searchTerms {
		idx := strings.Index(lowerHTML, term)
		if idx == -1 {
			continue
		}

		// Find the enclosing <link ...> tag
		// Search backward for '<'
		tagStart := strings.LastIndex(lowerHTML[:idx], "<")
		if tagStart == -1 {
			continue
		}
		// Search forward for '>'
		tagEnd := strings.Index(lowerHTML[idx:], ">")
		if tagEnd == -1 {
			continue
		}
		tag := html[tagStart : idx+tagEnd+1]

		// Extract href attribute
		href := extractAttr(tag, "href")
		if href == "" {
			continue
		}

		// Make absolute URL
		if strings.HasPrefix(href, "//") {
			href = "https:" + href
		} else if strings.HasPrefix(href, "/") {
			href = fmt.Sprintf("https://%s%s", domain, href)
		} else if !strings.HasPrefix(href, "http") {
			href = fmt.Sprintf("https://%s/%s", domain, href)
		}

		return href
	}

	return ""
}

// extractAttr extracts the value of an HTML attribute from a tag string.
func extractAttr(tag, attr string) string {
	lowerTag := strings.ToLower(tag)
	attrKey := strings.ToLower(attr) + "="

	idx := strings.Index(lowerTag, attrKey)
	if idx == -1 {
		return ""
	}

	rest := tag[idx+len(attrKey):]
	if len(rest) == 0 {
		return ""
	}

	var quote byte
	if rest[0] == '"' || rest[0] == '\'' {
		quote = rest[0]
		rest = rest[1:]
	} else {
		// No quote, read until space or >
		end := strings.IndexAny(rest, " >")
		if end == -1 {
			return rest
		}
		return rest[:end]
	}

	before, _, found := strings.Cut(rest, string(quote))
	if !found {
		return rest
	}
	return before
}

// readCache reads cached favicon data from disk.
func (h *FaviconHandler) readCache(cachePath string) ([]byte, string, error) {
	// Content-type is stored in a companion .meta file
	data, err := os.ReadFile(cachePath)
	if err != nil {
		return nil, "", err
	}

	meta, err := os.ReadFile(cachePath + ".meta")
	if err != nil {
		// Default to image/png if no meta
		return data, "image/png", nil
	}

	return data, string(meta), nil
}

// writeCache writes favicon data and content type to disk.
func (h *FaviconHandler) writeCache(cachePath string, data []byte, contentType string) error {
	if err := os.WriteFile(cachePath, data, 0644); err != nil {
		return err
	}
	return os.WriteFile(cachePath+".meta", []byte(contentType), 0644)
}

// normalizeDomain extracts a clean domain from the input string.
func normalizeDomain(input string) string {
	input = strings.TrimSpace(input)

	// If it looks like a URL, parse it
	if strings.Contains(input, "://") {
		u, err := url.Parse(input)
		if err != nil {
			return ""
		}
		input = u.Hostname()
	}

	// Strip trailing slashes, paths
	if idx := strings.Index(input, "/"); idx != -1 {
		input = input[:idx]
	}

	// Basic validation
	if !strings.Contains(input, ".") || len(input) < 3 {
		return ""
	}

	return strings.ToLower(input)
}

// isValidImage does a simple check to see if the data looks like an image.
func isValidImage(data []byte) bool {
	if len(data) < 4 {
		return false
	}

	ct := http.DetectContentType(data)
	return strings.HasPrefix(ct, "image/")
}

// transparentPNG returns a 1x1 transparent PNG image.
func transparentPNG() []byte {
	return []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
		0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, // RGBA
		0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk
		0x54, 0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x02,
		0x00, 0x01, 0xE5, 0x27, 0xDE, 0xFC, 0x00, 0x00,
		0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, // IEND chunk
		0x60, 0x82,
	}
}
