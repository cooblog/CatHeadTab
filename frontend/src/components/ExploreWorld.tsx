import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import ReactDOM from 'react-dom';
import client from '../api/client';
import { useTranslation, TranslationKeys } from '../i18n/useTranslation';
import { useConfigStore } from '../store/configStore';
import { DesktopItem, DesktopItemType, useLayoutStore } from '../store/layoutStore';
import { FaviconImg } from './FaviconImg';
import { openUrl } from '../utils/openUrl';

// ---------------------------------------------------------------------------
// PagePicker — small dropdown to choose which desktop page to add to
// ---------------------------------------------------------------------------
interface PagePickerProps {
  pageCount: number;
  onSelect: (pageIndex: number) => void;
  onClose: () => void;
  pageLabel: string;
  pageSuffix: string;
  /** Ref to the trigger button so we can position the picker via fixed layout */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

function PagePicker({ pageCount, onSelect, onClose, pageLabel, pageSuffix, anchorRef }: PagePickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const pickerHeight = pageCount * 36 + 12; // approximate height
    const pickerWidth = 150;
    // Try to show above the button; if not enough space, show below
    let top = rect.top - pickerHeight - 4;
    if (top < 8) {
      top = rect.bottom + 4;
    }
    let left = rect.right - pickerWidth;
    if (left < 8) left = 8;
    if (left + pickerWidth > window.innerWidth - 8) left = window.innerWidth - pickerWidth - 8;
    setPos({ top, left });
  }, [anchorRef, pageCount]);

  if (!pos) return null;

  return ReactDOM.createPortal(
    <>
      {/* Invisible backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-[9998]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        ref={pickerRef}
        className="fixed z-[9999] bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl py-1.5 min-w-[120px] animate-fadeIn"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {Array.from({ length: pageCount }, (_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(i);
            }}
            className="w-full text-left px-3.5 py-2 text-[12px] text-white/80 hover:bg-white/[0.12] hover:text-white transition-colors flex items-center gap-2"
          >
            <span className="text-[10px] w-4 h-4 rounded bg-white/10 flex items-center justify-center font-bold text-white/50">{i + 1}</span>
            {pageLabel} {i + 1} {pageSuffix}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const INITIAL_RENDER_COUNT = 30;
const RENDER_INCREMENT = 40;

// --- Helper: normalise URL for comparison (mirrors layoutStore logic) ---
function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '';
    return `${host}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

interface PresetSite {
  id: string;
  title: string;
  url: string;
  icon: string;
  description: string;
  sort_order: number;
}

// Lightweight category summary (from /api/v1/preset-categories)
interface CategorySummary {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  site_count: number;
}

// Search result from backend (includes category info)
interface SearchResult {
  id: string;
  title: string;
  url: string;
  icon: string;
  description: string;
  sort_order: number;
  category_id: string;
  category_name: string;
  category_icon: string;
}

// ---------------------------------------------------------------------------
// Memoised site row — avoids re-rendering every row on parent state change
// ---------------------------------------------------------------------------
interface SiteRowProps {
  site: PresetSite | SearchResult;
  isAdded: boolean;
  existsOnDesktop: boolean;
  onAdd: (site: PresetSite | SearchResult, pageIndex: number) => void;
  getCategoryDisplayName: (name: string) => string;
  pageCount: number;
  pageLabel: string;
  pageSuffix: string;
  copyLabel: string;
  addedLabel: string;
  alreadyOnDesktopLabel: string;
  addToDesktopLabel: string;
}

const SiteRow = memo(function SiteRow({
  site,
  isAdded,
  existsOnDesktop,
  onAdd,
  getCategoryDisplayName,
  pageCount,
  pageLabel,
  pageSuffix,
  copyLabel,
  addedLabel,
  alreadyOnDesktopLabel,
  addToDesktopLabel,
}: SiteRowProps) {
  const categoryLabel = 'category_name' in site ? getCategoryDisplayName(site.category_name) : null;
  const categoryIcon = 'category_icon' in site ? site.category_icon : null;
  const [showPagePicker, setShowPagePicker] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pageCount <= 1) {
      // Only one page — add directly without picker
      onAdd(site, 0);
    } else {
      setShowPagePicker(true);
    }
  };

  return (
    <div
      className="explore-row flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer border border-transparent hover:border-white/5 active:scale-[0.99]"
      onClick={() => openUrl(site.url)}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden">
          <FaviconImg
            url={site.url}
            sz={64}
            alt=""
            loading="lazy"
            className="w-4.5 h-4.5 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px]">🌐</span>';
            }}
          />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-white/90 truncate explore-title transition-colors">
            {site.title}
          </span>
          {site.description && (
            <span className="text-[11px] text-white/45 truncate mt-0.5">
              {site.description}
            </span>
          )}
          <span className="text-[11px] text-white/30 truncate mt-0.5">
            {site.url}
          </span>
          {categoryLabel && (
            <span className="text-[11px] text-white/35 truncate mt-0.5">
              {categoryIcon} {categoryLabel}
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons (Hover) */}
      <div className="explore-actions flex items-center gap-1.5 shrink-0 ml-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(site.url);
          }}
          className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/20 text-white/50 hover:text-white flex items-center justify-center transition-colors"
          title={copyLabel}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <div className="relative">
          <button
            ref={addBtnRef}
            onClick={handleAddClick}
            disabled={isAdded || existsOnDesktop}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              isAdded || existsOnDesktop
                ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default'
                : 'bg-blue-500/15 hover:bg-blue-500/90 text-blue-400 hover:text-white border border-blue-500/25 hover:border-blue-500'
            }`}
            title={isAdded ? addedLabel : existsOnDesktop ? alreadyOnDesktopLabel : addToDesktopLabel}
          >
            {isAdded || existsOnDesktop ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            )}
          </button>
          {showPagePicker && (
            <PagePicker
              pageCount={pageCount}
              pageLabel={pageLabel}
              pageSuffix={pageSuffix}
              anchorRef={addBtnRef}
              onSelect={(pi) => {
                onAdd(site, pi);
                setShowPagePicker(false);
              }}
              onClose={() => setShowPagePicker(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ExploreWorldProps {
  onClose: () => void;
}

export function ExploreWorld({ onClose }: ExploreWorldProps) {
  const { t } = useTranslation();
  const effectiveServerUrl = useConfigStore(s => s.getEffectiveServerUrl());
  const { addDesktopItem, layout } = useLayoutStore();

  // Category list (lightweight, loaded first)
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategoryID, setActiveCategoryID] = useState('');

  // Per-category sites cache: categoryID -> PresetSite[]
  const siteCacheRef = useRef<Map<string, PresetSite[]>>(new Map());
  const [activeSites, setActiveSites] = useState<PresetSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  // Search state (powered by backend API)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addedSites, setAddedSites] = useState<Set<string>>(new Set());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);

  // Progressive rendering: only render a slice to avoid heavy DOM mount
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);
  const contentRef = useRef<HTMLDivElement>(null);

  // Collect all URLs already on the desktop for dedup detection
  const existingUrls = useMemo(() => {
    const urls = new Set<string>();
    const collect = (items: DesktopItem[]) => {
      for (const item of items) {
        if (item.url) urls.add(normalizeUrlForCompare(item.url));
        if (item.children) collect(item.children);
      }
    };
    layout.pages.forEach(p => collect(p));
    collect(layout.dock);
    return urls;
  }, [layout]);

  // Step 1: Load category list (lightweight) + first category sites
  useEffect(() => {
    let cancelled = false;
    async function fetchCategories() {
      try {
        const res = await client.get('/api/v1/preset-categories');
        const cats: CategorySummary[] = (res.data?.categories || [])
          .sort((a: CategorySummary, b: CategorySummary) => a.sort_order - b.sort_order);
        if (cancelled) return;
        setCategories(cats);
        if (cats.length > 0) {
          const firstID = cats[0].id;
          setActiveCategoryID(firstID);
          // Immediately load first category's sites
          fetchSitesForCategory(firstID);
        }
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCategories();
    return () => { cancelled = true; };
  }, [effectiveServerUrl]);

  // Fetch sites for a single category (with cache)
  const fetchSitesForCategory = useCallback(async (categoryID: string) => {
    const cached = siteCacheRef.current.get(categoryID);
    if (cached) {
      setActiveSites(cached);
      return;
    }
    setSitesLoading(true);
    try {
      const res = await client.get(`/api/v1/preset-categories/${categoryID}/sites`);
      const sites: PresetSite[] = (res.data?.sites || [])
        .sort((a: PresetSite, b: PresetSite) => a.sort_order - b.sort_order);
      siteCacheRef.current.set(categoryID, sites);
      setActiveSites(sites);
    } catch {
      setActiveSites([]);
    } finally {
      setSitesLoading(false);
    }
  }, []);

  // When active category changes, load its sites
  useEffect(() => {
    if (!activeCategoryID) return;
    fetchSitesForCategory(activeCategoryID);
  }, [activeCategoryID, fetchSitesForCategory]);

  // Debounced search via backend API
  useEffect(() => {
    const q = searchQuery.trim();

    // Clear previous timer and abort
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    if (!q) {
      setSearchResults(null);
      setSearchLoading(false);
      setVisibleCount(INITIAL_RENDER_COUNT);
      return;
    }

    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const res = await client.get(`/api/v1/preset-sites/search`, {
          params: { q, limit: 50 },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSearchResults(res.data?.results || []);
          setVisibleCount(INITIAL_RENDER_COUNT);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError' && err.name !== 'CanceledError') {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Keep active category in sync
  useEffect(() => {
    if (categories.length === 0) {
      if (activeCategoryID !== '') setActiveCategoryID('');
      return;
    }
    const hasActive = categories.some((c) => c.id === activeCategoryID);
    if (!hasActive) setActiveCategoryID(categories[0].id);
  }, [activeCategoryID, categories]);

  // ESC key handling
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (showSidebar) { setShowSidebar(false); return; }
      if (searchQuery) { setSearchQuery(''); return; }
      onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, searchQuery, showSidebar]);

  const activeCategory = useMemo(() => {
    return categories.find((c) => c.id === activeCategoryID) || categories[0] || null;
  }, [activeCategoryID, categories]);

  // displaySites: search results or current category sites
  const displaySites: (PresetSite | SearchResult)[] = searchResults ?? activeSites;

  // Progressive rendering: only mount a visible slice of sites
  const visibleSites = useMemo(
    () => displaySites.slice(0, visibleCount),
    [displaySites, visibleCount],
  );
  const hasMore = visibleCount < displaySites.length;

  // Scroll handler: load more rows when user scrolls near the bottom
  const handleContentScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el || !hasMore) return;
    // Trigger when within 200px of the bottom
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setVisibleCount((prev) => Math.min(prev + RENDER_INCREMENT, displaySites.length));
    }
  }, [hasMore, displaySites.length]);

  const getCategoryDisplayName = useCallback((name: string): string => {
    const key = `explore.cat_${name.toLowerCase()}` as TranslationKeys;
    const translated = t(key);
    return translated === key ? name : translated;
  }, [t]);

  // Desktop page count (for the page picker)
  const pageCount = useMemo(() => {
    const pages = layout.pages;
    // If last page has content, user can also add to a "new" page
    const lastPage = pages[pages.length - 1];
    return lastPage && lastPage.length > 0 ? pages.length + 1 : pages.length;
  }, [layout.pages]);

  const handleAddSite = useCallback((site: PresetSite | SearchResult, pageIndex: number) => {
    const newItem: DesktopItem = {
      id: `preset-${site.id}-${Date.now()}`,
      type: 'link',
      title: site.title,
      url: site.url,
      icon: site.icon || undefined,
    };
    addDesktopItem(newItem, pageIndex);
    setAddedSites((prev) => new Set(prev).add(site.id));
  }, [addDesktopItem]);

  // Add all sites in a category as a folder to the desktop
  const [folderAdded, setFolderAdded] = useState<Set<string>>(new Set());
  const [showFolderPagePicker, setShowFolderPagePicker] = useState(false);
  const folderBtnRef = useRef<HTMLButtonElement>(null);

  function handleAddCategoryAsFolder(category: CategorySummary, pageIndex: number) {
    const categoryName = getCategoryDisplayName(category.name);
    const sites = siteCacheRef.current.get(category.id) || activeSites;
    const children: DesktopItem[] = sites.map((site) => ({
      id: `preset-${site.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'link' as DesktopItemType,
      title: site.title,
      url: site.url,
      icon: site.icon || undefined,
    }));
    const folder: DesktopItem = {
      id: `folder-explore-${category.id}-${Date.now()}`,
      type: 'folder',
      title: `${category.icon} ${categoryName}`,
      children,
    };
    addDesktopItem(folder, pageIndex);
    setFolderAdded((prev) => new Set(prev).add(category.id));
  }

  function handleCategoryClick(categoryID: string) {
    setActiveCategoryID(categoryID);
    setSearchQuery('');
    setShowSidebar(false);
    setVisibleCount(INITIAL_RENDER_COUNT);
    // Reset scroll position
    contentRef.current?.scrollTo({ top: 0 });
  }

  const headerTitle = searchResults
    ? t('explore.searchResults')
    : activeCategory
      ? getCategoryDisplayName(activeCategory.name)
      : t('explore.title');

  const rightPaneCount = searchResults ? searchResults.length : displaySites.length;

  // Reusable search input — use as renderSearchInput() not <SearchInput/>
  // to avoid React remounting the input on every re-render
  const renderSearchInput = (className = '') => (
    <div className={`relative ${className}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('explore.searchPlaceholder')}
        className="w-full bg-[#202324] border border-white/10 focus:border-[#72d565]/50 hover:bg-[#2a2e30] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white/90 placeholder-white/30 outline-none transition-all shadow-inner"
      />
    </div>
  );

  // Category sidebar item
  function renderCategoryItem(category: CategorySummary) {
    const isActive = category.id === activeCategory?.id && !searchResults;
    return (
      <button
        key={category.id}
        onClick={() => handleCategoryClick(category.id)}
        className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${isActive ? 'bg-[#72d565] text-black shadow-lg shadow-[#72d565]/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <span className={`text-[18px] shrink-0 ${isActive ? 'opacity-100' : 'opacity-80'}`}>
            {category.icon}
          </span>
          <span className="text-[14px] font-medium truncate">
            {getCategoryDisplayName(category.name)}
          </span>
        </div>
        <span className={`text-[12px] font-semibold ${isActive ? 'text-black/60' : 'text-white/30 group-hover:text-white/50'}`}>
          {category.site_count}
        </span>
      </button>
    );
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4 sm:p-12" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity"
        onClick={onClose}
      />

      {/* App Window container — same structure as BookmarkBrowser */}
      <div
        className={`bg-black/30 backdrop-blur-xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-[900px] h-[85vh] md:h-[80vh] rounded-[1.5rem] md:rounded-[2rem]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Header — identical to BookmarkBrowser */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none absolute top-0 left-0 right-0 z-20">
          {/* Left: Mac traffic lights on desktop, hamburger on mobile */}
          <div className="flex items-center gap-2 w-auto md:w-24">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
            </button>
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button onClick={() => setIsFullScreen(!isFullScreen)} className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              </button>
            </div>
          </div>

          {/* Center: breadcrumb */}
          <div className="flex-1 flex justify-center drag-region cursor-move opacity-60 hover:opacity-100 transition-opacity min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] md:text-[13px] font-medium text-white/70 truncate max-w-full overflow-hidden">
              <span className="cursor-pointer hover:text-white transition-colors" onClick={() => { setSearchQuery(''); if (categories.length > 0) setActiveCategoryID(categories[0].id); }}>
                {t('explore.title')}
              </span>
              {(activeCategory || searchResults) && <span className="text-white/30 text-[10px] shrink-0">▶</span>}
              {(activeCategory || searchResults) && (
                <span className="text-white font-bold drop-shadow-md truncate">
                  {headerTitle}
                </span>
              )}
            </div>
          </div>

          {/* Right: mobile close */}
          <div className="flex items-center w-auto md:w-24 justify-end">
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-24" />
          </div>
        </div>

        {/* Browser Body — same flex layout as BookmarkBrowser */}
        <div className="flex-1 flex overflow-hidden mt-12 md:mt-14 relative">
          <div className="absolute inset-0 border-t border-white/5 pointer-events-none" />

          {/* Mobile sidebar overlay */}
          {showSidebar && (
            <div className="absolute inset-0 z-30 md:hidden" onClick={() => setShowSidebar(false)}>
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#1c1c1e]/90 backdrop-blur-[64px] border-r border-white/10 flex flex-col z-40 animate-slideIn" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 pb-2">
                  {renderSearchInput()}
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar pl-4 pr-3 pb-8 pt-3 space-y-1">
                  <div className="px-3 text-[11px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                    {t('explore.title')}
                  </div>
                  {categories.map((cat) => (
                    <React.Fragment key={cat.id}>
                      {renderCategoryItem(cat)}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Desktop Sidebar — same as BookmarkBrowser sidebar */}
          <div className="window-sidebar hidden md:flex w-[260px] border-r border-white/10 flex-col shrink-0 relative z-10">
            <div className="p-5 pb-2">
              {renderSearchInput()}
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar pl-5 pr-3 pb-8 pt-3 space-y-1">
              <div className="px-3 text-[11px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                {t('explore.title')}
              </div>
              {categories.map((cat) => (
                <React.Fragment key={cat.id}>
                  {renderCategoryItem(cat)}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Right Main List View — same as BookmarkBrowser */}
          <div ref={contentRef} onScroll={handleContentScroll} className="window-content flex-1 overflow-y-auto">
            {/* Mobile: inline search */}
            <div className="md:hidden p-3 pb-0">
              {renderSearchInput()}
            </div>

            <div className="p-4 md:p-6">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3 md:mb-4 pb-3 border-b border-white/10 pl-1">
                <h1 className="text-base md:text-xl font-bold text-white tracking-tight flex items-center gap-3">
                  {searchResults ? headerTitle : activeCategory ? `${activeCategory.icon} ${headerTitle}` : t('explore.title')}
                </h1>
                <div className="flex items-center gap-2">
                  {activeCategory && !searchResults && (
                    <div className="relative">
                      <button
                        ref={folderBtnRef}
                        onClick={() => {
                          if (folderAdded.has(activeCategory.id)) return;
                          if (pageCount <= 1) {
                            handleAddCategoryAsFolder(activeCategory, 0);
                          } else {
                            setShowFolderPagePicker(true);
                          }
                        }}
                        disabled={folderAdded.has(activeCategory.id)}
                        className={`flex items-center gap-1.5 text-[12px] md:text-[13px] font-medium px-2.5 md:px-3 py-0.5 md:py-1 rounded-full transition-all ${
                          folderAdded.has(activeCategory.id)
                            ? 'bg-green-500/15 text-green-400 border border-green-500/25 cursor-default'
                            : 'bg-blue-500/10 hover:bg-blue-500/25 text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 cursor-pointer'
                        }`}
                        title={t('explore.addCategoryAsFolder')}
                      >
                        {folderAdded.has(activeCategory.id) ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            {t('explore.folderAdded')}
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                            {t('explore.addCategoryAsFolder')}
                          </>
                        )}
                      </button>
                      {showFolderPagePicker && (
                        <PagePicker
                          pageCount={pageCount}
                          pageLabel={t('explore.page')}
                          pageSuffix={t('explore.pageSuffix')}
                          anchorRef={folderBtnRef}
                          onSelect={(pi) => {
                            handleAddCategoryAsFolder(activeCategory, pi);
                            setShowFolderPagePicker(false);
                          }}
                          onClose={() => setShowFolderPagePicker(false)}
                        />
                      )}
                    </div>
                  )}
                  <span className="text-white/40 text-[12px] md:text-[13px] font-medium bg-white/5 px-2.5 md:px-3 py-0.5 md:py-1 rounded-full">
                    {rightPaneCount} {t('explore.sites')}
                  </span>
                </div>
              </div>

              {/* Content */}
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin w-8 h-8 border-3 border-white/20 border-t-white rounded-full" />
                </div>
              ) : categories.length === 0 ? (
                <div className="w-full h-[60%] flex flex-col items-center justify-center text-white/20">
                  <p className="text-5xl mb-4">🔌</p>
                  <p className="text-[15px] font-medium text-white/40">{t('explore.noData')}</p>
                  <p className="text-[13px] mt-2">{t('explore.connectServer')}</p>
                </div>
              ) : sitesLoading || searchLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full" />
                </div>
              ) : displaySites.length > 0 ? (
                <div className="flex flex-col gap-1 w-full">
                  {visibleSites.map((site) => (
                    <SiteRow
                      key={site.id}
                      site={site}
                      isAdded={addedSites.has(site.id)}
                      existsOnDesktop={existingUrls.has(normalizeUrlForCompare(site.url))}
                      onAdd={handleAddSite}
                      getCategoryDisplayName={getCategoryDisplayName}
                      pageCount={pageCount}
                      pageLabel={t('explore.page')}
                      pageSuffix={t('explore.pageSuffix')}
                      copyLabel={t('bookmark.copyUrl')}
                      addedLabel={t('explore.added')}
                      alreadyOnDesktopLabel={t('explore.alreadyOnDesktop')}
                      addToDesktopLabel={t('explore.addToDesktop')}
                    />
                  ))}
                  {hasMore && (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin w-5 h-5 border-2 border-white/15 border-t-white/50 rounded-full" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-[60%] flex flex-col items-center justify-center text-white/20">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-6 opacity-30"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
                  <p className="text-[15px] font-medium text-white/40">
                    {searchQuery ? t('explore.noResults') : t('explore.noData')}
                  </p>
                  <p className="text-[13px] mt-2">
                    {searchQuery ? t('explore.searchPlaceholder') : t('explore.connectServer')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
