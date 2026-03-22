package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/CatHeadTab/backend/internal/model"
)

const (
	wallhavenBaseURL  = "https://wallhaven.cc/api/v1"
	wallhavenTimeout  = 15 * time.Second
	wallhavenProvider = "wallhaven"
)

// WallhavenProvider implements WallpaperProvider for wallhaven.cc.
type WallhavenProvider struct {
	apiKey string
	client *http.Client
}

// NewWallhavenProvider creates a new WallhavenProvider.
// If apiKey is empty, the provider still works but only SFW content is accessible.
func NewWallhavenProvider(apiKey string) *WallhavenProvider {
	return &WallhavenProvider{
		apiKey: apiKey,
		client: &http.Client{Timeout: wallhavenTimeout},
	}
}

// Name returns the provider identifier.
func (w *WallhavenProvider) Name() string {
	return wallhavenProvider
}

// Available reports whether this provider is ready.
// Wallhaven works without API key (SFW only), so it is always available.
func (w *WallhavenProvider) Available() bool {
	return true
}

// Search queries wallhaven.cc with the given parameters.
// NSFW content is never requested regardless of parameters — the purity bitmask
// is forced to exclude NSFW (bit position 001 is always 0).
func (w *WallhavenProvider) Search(params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error) {
	u, err := url.Parse(wallhavenBaseURL + "/search")
	if err != nil {
		return nil, fmt.Errorf("failed to parse wallhaven URL: %w", err)
	}

	q := u.Query()

	// API key
	if w.apiKey != "" {
		q.Set("apikey", w.apiKey)
	}

	// Search query
	if params.Query != "" {
		q.Set("q", params.Query)
	}

	// Categories bitmask: General=1xx, Anime=x1x, People=xx1
	q.Set("categories", buildCategoryBitmask(params.Categories))

	// Purity bitmask — NEVER allow NSFW (bit 001)
	q.Set("purity", buildPurityBitmask(params.Purity))

	// Sorting
	sorting := params.Sorting
	if sorting == "" {
		sorting = "date_added"
	}
	validSortings := map[string]bool{
		"date_added": true, "relevance": true, "random": true,
		"views": true, "favorites": true, "toplist": true,
	}
	if !validSortings[sorting] {
		sorting = "date_added"
	}
	q.Set("sorting", sorting)

	// topRange is required when sorting=toplist (default: 1M = last 1 month)
	if sorting == "toplist" {
		topRange := params.TopRange
		validRanges := map[string]bool{
			"1d": true, "3d": true, "1w": true,
			"1M": true, "3M": true, "6M": true, "1y": true,
		}
		if !validRanges[topRange] {
			topRange = "1M"
		}
		q.Set("topRange", topRange)
	}

	// Order
	order := params.Order
	if order == "" {
		order = "desc"
	}
	if order != "asc" && order != "desc" {
		order = "desc"
	}
	q.Set("order", order)

	// Minimum resolution
	if params.AtLeast != "" {
		q.Set("atleast", params.AtLeast)
	}

	// Aspect ratios
	if params.Ratios != "" {
		q.Set("ratios", params.Ratios)
	}

	// Color filter
	if params.Colors != "" {
		q.Set("colors", params.Colors)
	}

	// Pagination
	page := params.Page
	if page < 1 {
		page = 1
	}
	q.Set("page", strconv.Itoa(page))

	// Seed for random sorting consistency
	if params.Seed != "" && sorting == "random" {
		q.Set("seed", params.Seed)
	}

	u.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create wallhaven request: %w", err)
	}
	req.Header.Set("User-Agent", "CatHeadTab/1.0")

	resp, err := w.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wallhaven request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("wallhaven rate limit exceeded (429)")
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("wallhaven returned status %d: %s", resp.StatusCode, string(body))
	}

	var apiResp wallhavenSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode wallhaven response: %w", err)
	}

	return convertWallhavenResponse(&apiResp), nil
}

// buildCategoryBitmask creates the 3-digit bitmask for categories.
// Default: all categories enabled (111).
func buildCategoryBitmask(categories []model.WallpaperCategory) string {
	if len(categories) == 0 {
		return "111"
	}
	bits := [3]byte{'0', '0', '0'}
	for _, c := range categories {
		switch c {
		case model.CategoryGeneral:
			bits[0] = '1'
		case model.CategoryAnime:
			bits[1] = '1'
		case model.CategoryPeople:
			bits[2] = '1'
		}
	}
	return string(bits[:])
}

// buildPurityBitmask creates the 3-digit bitmask for purity.
// SFW=1xx, Sketchy=x1x, NSFW=xx1
// NSFW is ALWAYS forced to 0. Default: SFW only (100).
func buildPurityBitmask(purities []model.WallpaperPurity) string {
	if len(purities) == 0 {
		return "100" // SFW only by default
	}
	bits := [3]byte{'0', '0', '0'}
	for _, p := range purities {
		switch p {
		case model.PuritySFW:
			bits[0] = '1'
		case model.PuritySketchy:
			bits[1] = '1'
		// NSFW is intentionally omitted — never set bit[2]
		}
	}
	// If somehow nothing is selected, fall back to SFW
	if bits[0] == '0' && bits[1] == '0' {
		bits[0] = '1'
	}
	return string(bits[:])
}

// --- Wallhaven API response types ---

type wallhavenSearchResponse struct {
	Data []wallhavenWallpaper `json:"data"`
	Meta wallhavenMeta        `json:"meta"`
}

type wallhavenWallpaper struct {
	ID         string           `json:"id"`
	URL        string           `json:"url"`
	ShortURL   string           `json:"short_url"`
	Views      int              `json:"views"`
	Favorites  int              `json:"favorites"`
	Source     string           `json:"source"`
	Purity     string           `json:"purity"`
	Category   string           `json:"category"`
	DimensionX int              `json:"dimension_x"`
	DimensionY int              `json:"dimension_y"`
	Resolution string           `json:"resolution"`
	Ratio      string           `json:"ratio"`
	FileSize   int64            `json:"file_size"`
	FileType   string           `json:"file_type"`
	CreatedAt  string           `json:"created_at"`
	Colors     []string         `json:"colors"`
	Path       string           `json:"path"`
	Thumbs     wallhavenThumbs  `json:"thumbs"`
}

type wallhavenThumbs struct {
	Large    string `json:"large"`
	Original string `json:"original"`
	Small    string `json:"small"`
}

type wallhavenMeta struct {
	CurrentPage json.Number `json:"current_page"`
	LastPage    json.Number `json:"last_page"`
	PerPage     json.Number `json:"per_page"`
	Total       json.Number `json:"total"`
	Seed        string      `json:"seed"`
}

// jsonNumberToInt safely converts a json.Number to int, returning 0 on failure.
func jsonNumberToInt(n json.Number) int {
	v, err := strconv.Atoi(n.String())
	if err != nil {
		return 0
	}
	return v
}

func convertWallhavenResponse(resp *wallhavenSearchResponse) *model.WallpaperSearchResult {
	wallpapers := make([]model.Wallpaper, 0, len(resp.Data))
	for _, w := range resp.Data {
		wallpapers = append(wallpapers, model.Wallpaper{
			ID:         w.ID,
			Source:     wallhavenProvider,
			URL:        w.URL,
			ThumbSmall: w.Thumbs.Small,
			ThumbLarge: w.Thumbs.Large,
			FullURL:    w.Path,
			Width:      w.DimensionX,
			Height:     w.DimensionY,
			FileSize:   w.FileSize,
			FileType:   strings.TrimPrefix(w.FileType, "image/"),
			Purity:     mapWallhavenPurity(w.Purity),
			Category:   w.Category,
			Colors:     w.Colors,
			Views:      w.Views,
			Favorites:  w.Favorites,
			CreatedAt:  w.CreatedAt,
		})
	}
	return &model.WallpaperSearchResult{
		Wallpapers:  wallpapers,
		CurrentPage: jsonNumberToInt(resp.Meta.CurrentPage),
		LastPage:    jsonNumberToInt(resp.Meta.LastPage),
		PerPage:     jsonNumberToInt(resp.Meta.PerPage),
		Total:       jsonNumberToInt(resp.Meta.Total),
		Seed:        resp.Meta.Seed,
	}
}

func mapWallhavenPurity(p string) model.WallpaperPurity {
	switch p {
	case "sketchy":
		return model.PuritySketchy
	default:
		return model.PuritySFW
	}
}
