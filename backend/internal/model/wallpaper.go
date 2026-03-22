package model

// WallpaperPurity represents the content safety level of a wallpaper.
type WallpaperPurity string

const (
	// PuritySFW indicates safe-for-work content.
	PuritySFW WallpaperPurity = "sfw"
	// PuritySketchy indicates sketchy content (borderline).
	PuritySketchy WallpaperPurity = "sketchy"
)

// WallpaperCategory represents the category of a wallpaper.
type WallpaperCategory string

const (
	// CategoryGeneral represents general wallpapers.
	CategoryGeneral WallpaperCategory = "general"
	// CategoryAnime represents anime wallpapers.
	CategoryAnime WallpaperCategory = "anime"
	// CategoryPeople represents people wallpapers.
	CategoryPeople WallpaperCategory = "people"
)

// Wallpaper represents a single wallpaper item from an external source.
type Wallpaper struct {
	ID         string          `json:"id"`
	Source     string          `json:"source"`
	URL        string          `json:"url"`
	ThumbSmall string          `json:"thumbSmall"`
	ThumbLarge string          `json:"thumbLarge"`
	FullURL    string          `json:"fullUrl"`
	Width      int             `json:"width"`
	Height     int             `json:"height"`
	FileSize   int64           `json:"fileSize"`
	FileType   string          `json:"fileType"`
	Purity     WallpaperPurity `json:"purity"`
	Category   string          `json:"category"`
	Colors     []string        `json:"colors,omitempty"`
	Views      int             `json:"views"`
	Favorites  int             `json:"favorites"`
	CreatedAt  string          `json:"createdAt,omitempty"`
}

// WallpaperSearchParams holds the parameters for searching wallpapers.
type WallpaperSearchParams struct {
	Query      string              `json:"query"`
	Categories []WallpaperCategory `json:"categories,omitempty"`
	Purity     []WallpaperPurity   `json:"purity,omitempty"`
	Sorting    string              `json:"sorting"`
	Order      string              `json:"order"`
	TopRange   string              `json:"topRange,omitempty"` // Required when sorting=toplist: 1d,3d,1w,1M,3M,6M,1y
	AtLeast    string              `json:"atLeast,omitempty"`
	Ratios     string              `json:"ratios,omitempty"`
	Colors     string              `json:"colors,omitempty"`
	Page       int                 `json:"page"`
	Seed       string              `json:"seed,omitempty"`
}

// WallpaperSearchResult holds the paginated result of a wallpaper search.
type WallpaperSearchResult struct {
	Wallpapers  []Wallpaper `json:"wallpapers"`
	CurrentPage int         `json:"currentPage"`
	LastPage    int         `json:"lastPage"`
	PerPage     int         `json:"perPage"`
	Total       int         `json:"total"`
	Seed        string      `json:"seed,omitempty"`
}
