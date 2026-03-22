import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useConfigStore } from '../store/configStore';
import { useTranslation } from '../i18n/useTranslation';
import { saveImageBlob, loadImageBlob, compressImageToWebP, getRawBlob } from '../utils/imageStore';
import client from '../api/client';

type Tab = 'appearance' | 'language' | 'system' | 'online-wallpaper';

interface WallpaperItem {
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
  purity: string;
  category: string;
  colors?: string[];
  views: number;
  favorites: number;
  createdAt?: string;
}

interface WallpaperSearchResult {
  wallpapers: WallpaperItem[];
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  seed?: string;
}

type WallpaperSorting = 'toplist' | 'date_added' | 'random' | 'views' | 'favorites' | 'relevance';
type WallpaperCategoryFilter = 'general' | 'anime' | 'people';

const IDB_BG_KEY = 'bg-custom';
// Max original file size allowed before compression (20 MB)
const MAX_ORIGINAL_SIZE = 20 * 1024 * 1024;

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { serverUrl, setServerUrl, backgroundImage, setBackgroundImage, language, setLanguage } = useConfigStore();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<Tab>('appearance');
  const [url, setUrl] = useState(serverUrl);
  const [bg, setBg] = useState(backgroundImage);
  const [bgPreview, setBgPreview] = useState(''); // Object URL for local file preview
  const [isCompressing, setIsCompressing] = useState(false);

  // --- Online Wallpaper state ---
  const [wpQuery, setWpQuery] = useState('');
  const [wpSorting, setWpSorting] = useState<WallpaperSorting>('toplist');
  const [wpCategories, setWpCategories] = useState<Set<WallpaperCategoryFilter>>(new Set(['general', 'anime', 'people']));
  const [wpResult, setWpResult] = useState<WallpaperSearchResult | null>(null);
  const [wpPage, setWpPage] = useState(1);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpError, setWpError] = useState('');
  const [wpPreviewItem, setWpPreviewItem] = useState<WallpaperItem | null>(null);
  const wpScrollRef = useRef<HTMLDivElement>(null);
  const wpInitialLoadDone = useRef(false);

  // Detect mobile viewport for limiting wallpaper grid count
  const [isMobileWp, setIsMobileWp] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const handleResize = () => setIsMobileWp(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchWallpapers = useCallback(async (page: number, query: string, sorting: WallpaperSorting, cats: Set<WallpaperCategoryFilter>) => {
    const { serverUrl: srvUrl } = useConfigStore.getState();
    if (!srvUrl) {
      setWpError(t('settings.wpNeedServer'));
      return;
    }
    setWpLoading(true);
    setWpError('');
    try {
      const params = new URLSearchParams();
      params.set('provider', 'wallhaven');
      params.set('page', String(page));
      params.set('sorting', sorting);
      params.set('purity', 'sfw');
      if (sorting === 'toplist') {
        params.set('topRange', '1M');
      }
      if (query.trim()) {
        params.set('q', query.trim());
      }
      if (cats.size > 0 && cats.size < 3) {
        params.set('categories', Array.from(cats).join(','));
      }
      const resp = await client.get<WallpaperSearchResult>(`/api/v1/wallpapers/search?${params.toString()}`);
      setWpResult(resp.data);
      setWpPage(resp.data.currentPage);
      if (wpScrollRef.current) {
        wpScrollRef.current.scrollTop = 0;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setWpError(msg);
    } finally {
      setWpLoading(false);
    }
  }, [t]);

  // Auto-load wallpapers when switching to the online-wallpaper tab
  useEffect(() => {
    if (activeTab === 'online-wallpaper' && !wpInitialLoadDone.current) {
      wpInitialLoadDone.current = true;
      fetchWallpapers(1, wpQuery, wpSorting, wpCategories);
    }
  }, [activeTab, fetchWallpapers, wpQuery, wpSorting, wpCategories]);

  const handleWpSearch = () => {
    fetchWallpapers(1, wpQuery, wpSorting, wpCategories);
  };

  const handleWpPageChange = (newPage: number) => {
    if (newPage < 1 || (wpResult && newPage > wpResult.lastPage)) return;
    fetchWallpapers(newPage, wpQuery, wpSorting, wpCategories);
  };

  const handleSelectWallpaper = async (item: WallpaperItem) => {
    const wallpaperUrl = item.fullUrl;
    // Apply immediately to store (no need to click "Save" again)
    setBg(wallpaperUrl);
    setBackgroundImage(wallpaperUrl);
    // Close preview modal if open
    setWpPreviewItem(null);

    // If user is logged in, sync URL wallpaper to cloud
    const { jwtToken } = useConfigStore.getState();
    if (jwtToken) {
      try {
        await client.put('/api/v1/user/preferences', { backgroundImage: wallpaperUrl });
      } catch (err) {
        console.error('Failed to sync wallpaper to cloud', err);
      }
    }
  };

  const toggleWpCategory = (cat: WallpaperCategoryFilter) => {
    setWpCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // Resolve idb:// reference to an Object URL on mount
  useEffect(() => {
    if (backgroundImage.startsWith('idb://')) {
      loadImageBlob(IDB_BG_KEY).then(objUrl => {
        if (objUrl) setBgPreview(objUrl);
      });
    }
  }, [backgroundImage]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject files that are absurdly large
    if (file.size > MAX_ORIGINAL_SIZE) {
      alert(t('settings.bgTooLarge'));
      return;
    }

    setIsCompressing(true);
    try {
      // Compress to WebP for efficient storage & cloud sync
      const compressed = await compressImageToWebP(file);
      await saveImageBlob(IDB_BG_KEY, compressed);
      const objUrl = URL.createObjectURL(compressed);
      setBgPreview(objUrl);
      const idbUrl = `idb://${IDB_BG_KEY}?t=${Date.now()}`;
      setBg(idbUrl);
      applyBackground(idbUrl);
    } catch (err) {
      console.error('Failed to compress image', err);
      // Fallback: save original
      await saveImageBlob(IDB_BG_KEY, file);
      const objUrl = URL.createObjectURL(file);
      setBgPreview(objUrl);
      const idbUrl = `idb://${IDB_BG_KEY}?t=${Date.now()}`;
      setBg(idbUrl);
      applyBackground(idbUrl);
    } finally {
      setIsCompressing(false);
    }
  };

  // Immediately apply and sync background whenever it changes
  const applyBackground = useCallback(async (newBg: string) => {
    const trimmed = newBg.trim();
    setBackgroundImage(trimmed);

    const { jwtToken } = useConfigStore.getState();
    if (jwtToken) {
      try {
        if (trimmed.startsWith('idb://')) {
          const rawBlob = await getRawBlob('bg-custom');
          if (rawBlob) {
            const webpBlob = await compressImageToWebP(rawBlob);
            const formData = new FormData();
            formData.append('image', webpBlob, 'background.webp');
            await client.post('/api/v1/user/background', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          }
          await client.put('/api/v1/user/preferences', { backgroundImage: 'cloud://background' });
        } else {
          await client.put('/api/v1/user/preferences', { backgroundImage: trimmed });
        }
      } catch (err) {
        console.error('Failed to sync background to cloud', err);
      }
    }
  }, [setBackgroundImage]);

  // Immediately save server URL
  const applyServerUrl = useCallback((newUrl: string) => {
    setServerUrl(newUrl.trim());
  }, [setServerUrl]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-0 sm:p-6 md:p-12">
      {/* Dimmed Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* App Window container */}
      <div 
        className={`bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden transition-all duration-300 w-full h-full sm:w-auto sm:h-auto ${activeTab === 'online-wallpaper' ? 'sm:w-full sm:max-w-5xl sm:h-[85vh] md:h-[80vh]' : 'sm:w-full sm:max-w-3xl sm:h-[85vh] md:h-[500px]'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Window Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          {/* Left: Mac traffic lights on desktop, spacer on mobile */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            {/* Desktop traffic lights */}
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20">
                <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              </button>
            </div>
          </div>
          
          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">{t('settings.title')}</span>
          </div>
          
          {/* Right spacer */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Sidebar */}
          <div className="w-full md:w-56 bg-black/20 border-b md:border-b-0 md:border-r border-white/10 px-3 py-2 md:p-6 flex flex-col gap-2 shrink-0">
            <div className="flex flex-row md:flex-col gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0 hide-scroll">
              <button 
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'appearance' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('appearance')}
              >
                 {t('settings.appearance')}
              </button>
              <button 
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'language' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('language')}
              >
                 {t('settings.language')}
              </button>
              <button 
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'system' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('system')}
              >
                 {t('settings.system')}
              </button>
              <button 
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'online-wallpaper' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('online-wallpaper')}
              >
                 {t('settings.onlineWallpaper')}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col p-3 sm:p-6 sm:pb-3 md:px-8 md:pt-8 md:pb-3 relative bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">

            <div className="flex-1 min-h-0 overflow-y-auto pr-2 md:pr-4 no-scrollbar">
              {activeTab === 'appearance' && (
                <div className="space-y-8 fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.bgWallpaper')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.bgDesc')}</p>
                    
                    <input 
                      type="text"
                      value={bg}
                      onChange={e => setBg(e.target.value)}
                      onBlur={() => applyBackground(bg)}
                      onKeyDown={e => { if (e.key === 'Enter') { applyBackground(bg); (e.target as HTMLInputElement).blur(); } }}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner mb-5"
                      placeholder={t('settings.bgPlaceholder')}
                    />
                    
                    <div className="flex flex-wrap gap-4">
                      <button 
                        type="button"
                        onClick={() => { const u = 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?q=80&w=2070&auto=format&fit=crop'; setBg(u); applyBackground(u); }}
                        className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg === 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?q=80&w=2070&auto=format&fit=crop' ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-white/20 hover:scale-105 hover:border-white/50'}`}
                        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1542281286-9e0a16bb7366?q=80&w=2070&auto=format&fit=crop")' }} 
                        title="Green Grass Dew"
                      />
                      <button 
                        type="button"
                        onClick={() => { const u = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop'; setBg(u); applyBackground(u); }}
                        className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg === 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop' ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-white/20 hover:scale-105 hover:border-white/50'}`}
                        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop")' }} 
                        title="Beach Sunset"
                      />
                      <button 
                        type="button"
                        onClick={() => { const u = 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=2070&auto=format&fit=crop'; setBg(u); applyBackground(u); }}
                        className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg === 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=2070&auto=format&fit=crop' ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-white/20 hover:scale-105 hover:border-white/50'}`}
                        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=2070&auto=format&fit=crop")' }} 
                        title="Dark Starry Sky"
                      />
                      {bgPreview && (
                        <button 
                          type="button"
                          onClick={() => { const u = `idb://${IDB_BG_KEY}?t=${Date.now()}`; setBg(u); applyBackground(u); }}
                          className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg.startsWith(`idb://${IDB_BG_KEY}`) ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-[#72d565]/50 hover:scale-105 hover:border-[#72d565]'}`}
                          style={{ backgroundImage: `url("${bgPreview}")` }} 
                          title="Local Custom Image"
                        />
                      )}
                      <label 
                        title="Upload Custom Image"
                        className="w-24 h-16 rounded-xl bg-white/5 hover:bg-white/10 border border-dashed border-white/30 hover:scale-105 hover:border-white/80 transition-all shadow-md flex items-center justify-center cursor-pointer text-white/50 hover:text-white"
                      >
                        {isCompressing ? (
                          <svg className="animate-spin w-5 h-5 text-white/60" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <span className="text-2xl leading-none mb-1">+</span>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isCompressing} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'language' && (
                <div className="space-y-6 fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.langTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.langDesc')}</p>
                    
                    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                      <button 
                        className={`w-full px-5 py-4 border-b border-white/5 text-[14px] font-medium flex justify-between ${language === 'en' ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                        onClick={() => setLanguage('en')}
                      >
                        English (US)
                        {language === 'en' && <span className="text-[#72d565]">✓</span>}
                      </button>
                      <button 
                        className={`w-full px-5 py-4 text-[14px] font-medium flex justify-between ${language === 'zh' ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                        onClick={() => setLanguage('zh')}
                      >
                        简体中文
                        {language === 'zh' && <span className="text-[#72d565]">✓</span>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'system' && (
                <div className="space-y-6 fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.sysTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.sysDesc')}</p>
                    
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('settings.sysLabel')}</label>
                    <input 
                      type="url"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      onBlur={() => applyServerUrl(url)}
                      onKeyDown={e => { if (e.key === 'Enter') { applyServerUrl(url); (e.target as HTMLInputElement).blur(); } }}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner"
                      placeholder="http://localhost:8080"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'online-wallpaper' && (
                <div className="space-y-4 fade-in flex flex-col min-h-full" ref={wpScrollRef}>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">{t('settings.onlineWallpaper')}</h3>
                    <p className="text-[12px] text-white/50">{t('settings.wpDesc')}</p>
                  </div>

                  {/* Search bar */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={wpQuery}
                      onChange={e => setWpQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleWpSearch()}
                      className="flex-1 bg-black/40 border border-white/10 hover:border-white/30 rounded-lg px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all"
                      placeholder={t('settings.wpSearchPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={handleWpSearch}
                      disabled={wpLoading}
                      className="px-4 py-1.5 rounded-lg bg-[#72d565] hover:bg-[#5bb84f] text-black font-semibold text-[13px] transition-colors disabled:opacity-50"
                    >
                      {wpLoading ? '...' : t('settings.wpSearch')}
                    </button>
                  </div>

                  {/* Filters row */}
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Sorting */}
                    <select
                      value={wpSorting}
                      onChange={e => setWpSorting(e.target.value as WallpaperSorting)}
                      className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[12px] text-white/80 focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="toplist">{t('settings.wpSortToplist')}</option>
                      <option value="date_added">{t('settings.wpSortLatest')}</option>
                      <option value="random">{t('settings.wpSortRandom')}</option>
                      <option value="views">{t('settings.wpSortViews')}</option>
                      <option value="favorites">{t('settings.wpSortFavorites')}</option>
                    </select>

                    {/* Category toggles */}
                    <div className="flex gap-1 ml-auto">
                      {(['general', 'anime', 'people'] as WallpaperCategoryFilter[]).map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleWpCategory(cat)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${wpCategories.has(cat) ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
                        >
                          {t(`settings.wpCat_${cat}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Error */}
                  {wpError && (
                    <div className="text-red-400 text-[12px] bg-red-500/10 rounded-lg px-3 py-2">
                      {wpError}
                    </div>
                  )}

                  {/* Loading */}
                  {wpLoading && (
                    <div className="flex justify-center py-8">
                      <svg className="animate-spin w-6 h-6 text-white/50" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  )}

                  {/* Wallpaper grid */}
                  {!wpLoading && wpResult && wpResult.wallpapers.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3.5 content-start">
                      {(isMobileWp ? wpResult.wallpapers.slice(0, 8) : wpResult.wallpapers).map(item => (
                        <div
                          key={item.id}
                          className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-[#72d565]/50 transition-all"
                          onClick={() => setWpPreviewItem(item)}
                        >
                          <div className="w-full pb-[68%] sm:pb-[62%]" />
                          <img
                            src={item.thumbSmall}
                            alt={`Wallpaper ${item.id}`}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <div className="p-2 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
                            </div>
                          </div>
                          {/* Resolution badge */}
                          <div className="absolute bottom-0.5 right-0.5 text-[9px] text-white/60 bg-black/50 px-1 rounded">
                            {item.width}×{item.height}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {!wpLoading && wpResult && wpResult.wallpapers.length === 0 && (
                    <div className="text-center text-white/40 py-8 text-[13px]">
                      {t('settings.wpNoResults')}
                    </div>
                  )}

                  {/* Pagination */}
                  {wpResult && wpResult.lastPage > 1 && (
                    <div className="flex items-center justify-center gap-3 !mt-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleWpPageChange(wpPage - 1)}
                        disabled={wpPage <= 1 || wpLoading}
                        className="px-3 py-1 rounded-lg bg-white/10 text-white/70 text-[12px] hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        ‹ {t('settings.wpPrev')}
                      </button>
                      <span className="text-[12px] text-white/50">
                        {wpPage} / {wpResult.lastPage}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleWpPageChange(wpPage + 1)}
                        disabled={wpPage >= wpResult.lastPage || wpLoading}
                        className="px-3 py-1 rounded-lg bg-white/10 text-white/70 text-[12px] hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('settings.wpNext')} ›
                      </button>
                    </div>
                  )}

                  {/* Fullscreen preview modal */}
                  {wpPreviewItem && (
                    <div
                      className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-md"
                      onClick={() => setWpPreviewItem(null)}
                    >
                      {/* Top bar with info & close */}
                      <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0" onClick={e => e.stopPropagation()}>
                        <div className="text-[11px] sm:text-[13px] text-white/50 truncate mr-3">
                          {wpPreviewItem.width}×{wpPreviewItem.height} · {wpPreviewItem.fileType} · ❤ {wpPreviewItem.favorites} · 👁 {wpPreviewItem.views}
                        </div>
                        <button
                          type="button"
                          onClick={() => setWpPreviewItem(null)}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </div>

                      {/* Full image area */}
                      <div className="flex-1 flex items-center justify-center px-2 sm:px-4 min-h-0" onClick={e => e.stopPropagation()}>
                        <img
                          src={wpPreviewItem.fullUrl}
                          alt={`Preview ${wpPreviewItem.id}`}
                          className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
                        />
                      </div>

                      {/* Bottom action bar */}
                      <div className="flex items-center justify-center gap-3 px-4 py-4 sm:py-5 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleSelectWallpaper(wpPreviewItem)}
                          className="px-6 sm:px-8 py-2.5 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] text-black font-bold text-[13px] sm:text-[14px] transition-colors shadow-lg shadow-[#72d565]/20 active:scale-95"
                        >
                          {t('settings.wpUseThis')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setWpPreviewItem(null)}
                          className="px-5 sm:px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-medium text-[13px] sm:text-[14px] transition-colors active:scale-95"
                        >
                          {t('settings.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
