// Package handler provides HTTP handlers for favicon proxy endpoints.
package handler

import (
	"crypto/sha256"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	faviconCacheDir     = "data/favicon_cache"
	faviconMaxSize      = 512 * 1024 // 512 KB max per icon
	faviconFetchTimeout = 8 * time.Second
)

// FaviconHandler handles HTTP requests for favicon proxy with disk caching.
type FaviconHandler struct {
	cacheDir   string
	httpClient *http.Client
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
	}

	if err := os.MkdirAll(h.cacheDir, 0755); err != nil {
		log.Printf("⚠️  Failed to create favicon cache dir: %v", err)
	}

	return h
}

// Get handles GET /api/v1/favicon?domain=example.com&sz=64
// It returns a cached favicon or fetches one from multiple sources.
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

	// Cache miss — try fetching from multiple sources
	data, contentType, err := h.fetchFavicon(domain, sz)
	if err != nil {
		// Return a 1x1 transparent PNG as fallback
		c.Header("Cache-Control", "public, max-age=86400") // cache fallback for 1 day
		c.Header("X-Favicon-Cache", "MISS")
		c.Data(http.StatusOK, "image/png", transparentPNG())
		return
	}

	// Write to disk cache (best-effort, don't block response)
	go func() {
		if writeErr := h.writeCache(cachePath, data, contentType); writeErr != nil {
			log.Printf("⚠️  Failed to write favicon cache for %s: %v", domain, writeErr)
		}
	}()

	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("X-Favicon-Cache", "MISS")
	c.Data(http.StatusOK, contentType, data)
}

// fetchFavicon tries multiple sources to get a favicon for the domain.
func (h *FaviconHandler) fetchFavicon(domain, sz string) ([]byte, string, error) {
	sources := []string{
		// Source 1: Google S2 service (works well from servers, even if blocked for end users)
		fmt.Sprintf("https://s2.googleusercontent.com/s2/favicons?domain_url=https://%s&sz=%s", url.QueryEscape(domain), sz),
		// Source 2: Direct /favicon.ico from the website
		fmt.Sprintf("https://%s/favicon.ico", domain),
		// Source 3: Try parsing the HTML for <link rel="icon">
		// (handled separately below)
	}

	for _, src := range sources {
		data, contentType, err := h.fetchURL(src)
		if err == nil && len(data) > 0 && isValidImage(data) {
			return data, contentType, nil
		}
	}

	// Source 3: Parse HTML <link rel="icon"> tag
	if iconURL := h.parseHTMLFavicon(domain); iconURL != "" {
		data, contentType, err := h.fetchURL(iconURL)
		if err == nil && len(data) > 0 && isValidImage(data) {
			return data, contentType, nil
		}
	}

	return nil, "", fmt.Errorf("all favicon sources failed for %s", domain)
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
