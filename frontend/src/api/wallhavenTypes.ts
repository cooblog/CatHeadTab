/** Shared types for the wallpaper feature — used by both the backend-proxy path and the direct-fetch path. */

export type WallpaperPurity = 'sfw' | 'sketchy' | 'nsfw';

export interface WallpaperItem {
  id: string;
  source: string;
  url: string;
  thumbSmall: string;
  thumbLarge: string;
  fullUrl: string;
  width: number;
  height: number;
  fileSize: number;
  fileType: string;
  purity: WallpaperPurity;
  category: string;
  colors?: string[];
  views: number;
  favorites: number;
  createdAt?: string;
}

export interface WallpaperSearchResult {
  wallpapers: WallpaperItem[];
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  seed?: string;
}

export type WallpaperSorting = 'toplist' | 'date_added' | 'random' | 'views' | 'favorites' | 'relevance';
export type WallpaperCategoryFilter = 'general' | 'anime' | 'people';
