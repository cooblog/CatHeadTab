package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/tencentyun/cos-go-sdk-v5"

	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/model"
)

const (
	cosProvider   = "cos"
	cosTimeout    = 15 * time.Second
	cosPresignTTL = 2 * time.Hour
	cosPageSize   = 24
)

// imageExtensions contains the set of file extensions considered as images.
var imageExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".gif":  true,
	".bmp":  true,
	".avif": true,
}

// COSProvider implements WallpaperProvider for Tencent Cloud COS.
// It uses two separate directory prefixes:
//   - originalPrefix (e.g. "0000-c/") — full-size wallpaper images
//   - thumbPrefix    (e.g. "0000-s/") — corresponding thumbnail images
//
// Files in both directories must share the same filenames.
// The provider lists objects from the originalPrefix directory and generates
// pre-signed URLs for both originals and thumbnails.
type COSProvider struct {
	client         *cos.Client
	bucket         string
	region         string
	originalPrefix string
	thumbPrefix    string
	secretID       string
	secretKey      string
}

// NewCOSProvider creates a new COSProvider.
// All four credential parameters (secretID, secretKey, bucket, region) must be
// non-empty for the provider to be available.
// originalPrefix is the key prefix for full-size images (e.g. "0000-c/").
// thumbPrefix is the key prefix for thumbnails (e.g. "0000-s/").
func NewCOSProvider(secretID, secretKey, bucket, region, originalPrefix, thumbPrefix string) *COSProvider {
	bucketURL, _ := url.Parse(fmt.Sprintf("https://%s.cos.%s.myqcloud.com", bucket, region))
	serviceURL, _ := url.Parse(fmt.Sprintf("https://cos.%s.myqcloud.com", region))

	baseURL := &cos.BaseURL{BucketURL: bucketURL, ServiceURL: serviceURL}
	client := cos.NewClient(baseURL, &http.Client{
		Timeout: cosTimeout,
		Transport: &cos.AuthorizationTransport{
			SecretID:  secretID,
			SecretKey: secretKey,
		},
	})

	return &COSProvider{
		client:         client,
		bucket:         bucket,
		region:         region,
		originalPrefix: originalPrefix,
		thumbPrefix:    thumbPrefix,
		secretID:       secretID,
		secretKey:      secretKey,
	}
}

// Name returns the provider identifier.
func (c *COSProvider) Name() string {
	return cosProvider
}

// Available reports whether the COS provider is configured and ready.
func (c *COSProvider) Available() bool {
	return c.secretID != "" && c.secretKey != "" && c.bucket != "" && c.region != ""
}

// HasAPIKey reports whether COS credentials are configured.
func (c *COSProvider) HasAPIKey() bool {
	return c.Available()
}

// AllowedPurity returns the purity levels for COS. Since COS wallpapers are
// self-managed, only SFW is reported (no content classification).
func (c *COSProvider) AllowedPurity() []string {
	return []string{string(model.PuritySFW)}
}

// PurityKey returns a fixed purity key since COS does not support purity filtering.
func (c *COSProvider) PurityKey() string {
	return "100"
}

// Search lists image objects in the COS bucket with pagination support.
// It scans the originalPrefix directory for image files, then builds
// pre-signed URLs for both the original and the matching thumbnail.
func (c *COSProvider) Search(params model.WallpaperSearchParams) (*model.WallpaperSearchResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), cosTimeout)
	defer cancel()

	// Build effective prefix: originalPrefix + optional query sub-filter
	effectivePrefix := c.originalPrefix
	if params.Query != "" {
		effectivePrefix = effectivePrefix + params.Query
	}

	logger.Debug("[COS] Search", "bucket", c.bucket, "region", c.region, "effectivePrefix", effectivePrefix, "originalPrefix", c.originalPrefix, "thumbPrefix", c.thumbPrefix)

	// List all image objects under the original directory.
	// COS doesn't have native page-number pagination, so we list all
	// matching keys and paginate in-memory.
	var allKeys []cos.Object
	var marker string
	for {
		opt := &cos.BucketGetOptions{
			Prefix:  effectivePrefix,
			MaxKeys: 1000,
			Marker:  marker,
		}
		result, resp, err := c.client.Bucket.Get(ctx, opt)
		if err != nil {
			logger.Error("[COS] Bucket.Get error", "error", err)
			return nil, fmt.Errorf("failed to list COS objects: %w", err)
		}
		logger.Debug("[COS] Bucket.Get", "status", resp.StatusCode, "contents", len(result.Contents), "isTruncated", result.IsTruncated, "prefix", result.Prefix)
		if len(result.Contents) > 0 {
			logger.Debug("[COS] keys range", "first", result.Contents[0].Key, "last", result.Contents[len(result.Contents)-1].Key)
		}
		for _, obj := range result.Contents {
			ext := strings.ToLower(path.Ext(obj.Key))
			if imageExtensions[ext] {
				allKeys = append(allKeys, obj)
			}
		}
		if !result.IsTruncated {
			break
		}
		marker = result.NextMarker
		if marker == "" && len(result.Contents) > 0 {
			marker = result.Contents[len(result.Contents)-1].Key
		}
	}

	logger.Debug("[COS] Total image keys found", "count", len(allKeys))

	// Sort by key (alphabetical)
	sort.Slice(allKeys, func(i, j int) bool {
		return allKeys[i].Key < allKeys[j].Key
	})

	total := len(allKeys)
	page := max(params.Page, 1)
	lastPage := max((total+cosPageSize-1)/cosPageSize, 1)
	if page > lastPage {
		page = lastPage
	}

	start := (page - 1) * cosPageSize
	end := min(start+cosPageSize, total)

	pageObjects := allKeys[start:end]
	wallpapers := make([]model.Wallpaper, 0, len(pageObjects))

	for _, obj := range pageObjects {
		// Generate pre-signed URL for the full-size original image
		originalURL, err := c.generatePresignedURL(obj.Key)
		if err != nil {
			continue
		}

		// Derive the thumbnail key by replacing the originalPrefix with thumbPrefix.
		// e.g. "0000-c/sunset.jpg" → "0000-s/sunset.jpg"
		thumbKey := c.deriveThumbKey(obj.Key)
		thumbURL, err := c.generatePresignedURL(thumbKey)
		if err != nil {
			// Fallback: use original URL if thumbnail generation fails
			thumbURL = originalURL
		}

		// Extract file extension for the file type field
		ext := strings.TrimPrefix(strings.ToLower(path.Ext(obj.Key)), ".")

		wallpapers = append(wallpapers, model.Wallpaper{
			ID:         obj.Key,
			Source:     cosProvider,
			URL:        originalURL,
			ThumbSmall: thumbURL,
			ThumbLarge: thumbURL,
			FullURL:    originalURL,
			FileSize:   obj.Size,
			FileType:   ext,
			Purity:     model.PuritySFW,
			Category:   "cos",
			CreatedAt:  obj.LastModified,
			Colors:     []string{},
			Views:      0,
			Favorites:  0,
		})
	}

	return &model.WallpaperSearchResult{
		Wallpapers:  wallpapers,
		CurrentPage: page,
		LastPage:    lastPage,
		PerPage:     cosPageSize,
		Total:       total,
	}, nil
}

// deriveThumbKey replaces the originalPrefix in a COS key with the thumbPrefix
// to get the corresponding thumbnail key.
// Example: originalPrefix="0000-c/", thumbPrefix="0000-s/"
//
//	"0000-c/sunset.jpg" → "0000-s/sunset.jpg"
//
// If thumbPrefix is empty, the original key is returned unchanged.
func (c *COSProvider) deriveThumbKey(originalKey string) string {
	if c.thumbPrefix == "" || c.originalPrefix == "" {
		return originalKey
	}
	if after, found := strings.CutPrefix(originalKey, c.originalPrefix); found {
		return c.thumbPrefix + after
	}
	return originalKey
}

// generatePresignedURL creates a time-limited pre-signed URL for a COS object.
func (c *COSProvider) generatePresignedURL(key string) (string, error) {
	ctx := context.Background()
	presignedURL, err := c.client.Object.GetPresignedURL(
		ctx,
		http.MethodGet,
		key,
		c.secretID,
		c.secretKey,
		cosPresignTTL,
		nil,
	)
	if err != nil {
		return "", fmt.Errorf("failed to generate pre-signed URL for %s: %w", key, err)
	}
	return presignedURL.String(), nil
}

// GeneratePresignedURL is the public variant of generatePresignedURL.
// It is used by the handler layer to create fresh pre-signed URLs for
// individual COS objects (e.g. the image proxy endpoint).
func (c *COSProvider) GeneratePresignedURL(key string) (string, error) {
	return c.generatePresignedURL(key)
}
