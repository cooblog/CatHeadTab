package handler

import "testing"

func TestBuildGithubTrendingURLMatchesOfficialFilters(t *testing.T) {
	got := buildGithubTrendingURL("typescript", "zh", "weekly")
	want := "https://github.com/trending/typescript?since=weekly&spoken_language_code=zh"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestBuildGithubTrendingURLEscapesLanguageSlug(t *testing.T) {
	got := buildGithubTrendingURL("c#", "", "daily")
	want := "https://github.com/trending/c%23?since=daily"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestGithubTrendingCacheKeyIncludesAllFilters(t *testing.T) {
	got := githubTrendingCacheKey("c#", "zh", "monthly")
	want := "github_trending_lang_c%23_spoken_zh_since_monthly"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeGithubSinceOnlyAllowsOfficialRanges(t *testing.T) {
	if got := normalizeGithubSince(" WEEKLY "); got != "weekly" {
		t.Fatalf("expected weekly, got %q", got)
	}
	if got := normalizeGithubSince("yearly"); got != "" {
		t.Fatalf("expected invalid range to be empty, got %q", got)
	}
}
