// Package service provides business logic services for the application.
package service

import (
	"fmt"

	"github.com/CatHeadTab/backend/internal/model"
)

// WallpaperProvider defines the interface for external wallpaper sources.
// Implementations must be safe for concurrent use.
type WallpaperProvider interface {
	// Name returns the unique identifier of this provider (e.g. "wallhaven").
	Name() string

	// Search queries wallpapers with the given parameters and returns paginated results.
	Search(params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error)

	// Available reports whether the provider is configured and ready to use.
	Available() bool

	// HasAPIKey reports whether an API key is configured for this provider.
	HasAPIKey() bool

	// AllowedPurity returns the purity levels allowed by the server configuration.
	AllowedPurity() []string
}

// WallpaperService manages multiple wallpaper providers and dispatches requests.
type WallpaperService struct {
	providers map[string]WallpaperProvider
}

// NewWallpaperService creates a WallpaperService with the supplied providers.
func NewWallpaperService(providers ...WallpaperProvider) *WallpaperService {
	m := make(map[string]WallpaperProvider, len(providers))
	for _, p := range providers {
		if p.Available() {
			m[p.Name()] = p
		}
	}
	return &WallpaperService{providers: m}
}

// Search dispatches a search to the named provider.
func (s *WallpaperService) Search(providerName string, params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error) {
	p, ok := s.providers[providerName]
	if !ok {
		return nil, fmt.Errorf("wallpaper provider %q not found or not configured", providerName)
	}
	return p.Search(params)
}

// ListProviders returns the names of all available providers.
func (s *WallpaperService) ListProviders() []string {
	names := make([]string, 0, len(s.providers))
	for name := range s.providers {
		names = append(names, name)
	}
	return names
}

// ProviderConfig returns configuration details about a provider so the
// frontend can adapt its UI (e.g. show/hide purity filter options).
func (s *WallpaperService) ProviderConfig(providerName string) (hasKey bool, allowedPurity []string, found bool) {
	p, ok := s.providers[providerName]
	if !ok {
		return false, nil, false
	}
	return p.HasAPIKey(), p.AllowedPurity(), true
}
