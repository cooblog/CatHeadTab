import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLayoutStore, DesktopItem } from '../store/layoutStore';
import { useTranslation } from '../i18n/useTranslation';
import { extractDomain } from '../utils/favicon';
import { FaviconImg, ICON_FALLBACK_COLORS, IconFallback, getIconCrossOrigin, shouldUseLetterFallback } from './FaviconImg';
import { useFloatingWindow } from '../hooks/useFloatingWindow';

// Fetch website title from URL (works in Chrome extension context)
const fetchWebsiteTitle = async (rawUrl: string): Promise<string | null> => {
  try {
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    // Only read the first chunk for performance
    const text = await response.text();
    const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
};

interface AddItemModalProps {
  onClose: () => void;
  editItem?: DesktopItem | null;
  parentFolderId?: string;
  pageIndex?: number;
  /** Called when the user taps the "Widget" tab — parent should close this modal and open AddWidgetModal */
  onSwitchToWidget?: () => void;
}

export const AddItemModal: React.FC<AddItemModalProps> = ({ onClose, editItem, parentFolderId, pageIndex, onSwitchToWidget }) => {
  const { addDesktopItem, updateDesktopItem, checkDuplicate } = useLayoutStore();
  const { t } = useTranslation();
  const isEditing = !!editItem;
  const floatingWindow = useFloatingWindow({
    defaultSize: () => ({
      width: 560,
      height: typeof window === 'undefined' ? 620 : Math.min(680, window.innerHeight - 96),
    }),
    minHeight: 420,
    minWidth: 440,
    resizable: false,
  });

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const [mode, setMode] = useState<'link' | 'folder'>(editItem?.type === 'folder' ? 'folder' : 'link');
  const [title, setTitle] = useState(editItem?.title || '');
  const [url, setUrl] = useState(editItem?.url || '');
  const [customIcon, setCustomIcon] = useState(editItem?.icon || '');
  const [iconColor, setIconColor] = useState(editItem?.iconColor || '');
  // Domain derived from URL — used to drive the live FaviconImg preview so
  // that it auto-upgrades when the background HTML scanner discovers a
  // higher-resolution icon (SVG / PWA manifest icons, etc.).
  const [previewDomain, setPreviewDomain] = useState<string>('');
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [titleAutoFilled, setTitleAutoFilled] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [customIconLoadFailed, setCustomIconLoadFailed] = useState(false);
  const titleFetchAbortRef = useRef<AbortController | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Track whether the loaded preview icon is visually non-square (long SVG
  // logos, wide banners, etc.). Non-square icons render poorly with
  // object-cover because their sides get cropped — we switch to a padded
  // "card" layout (background + object-contain) so the full icon is
  // visible. Mirrors the logic used by DesktopIconContent so the edit
  // preview matches the desktop tile.
  const [isNonSquareIcon, setIsNonSquareIcon] = useState(false);
  const handlePreviewIconLoaded = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;

    // SVGs without an intrinsic size report Chrome's default viewport
    // (300x150) — skip the ratio check so vector logos don't get the
    // white-card background by mistake.
    const src = img.currentSrc || img.src || '';
    const isSvg =
      /\.svg(\?|#|$)/i.test(src) || /^data:image\/svg/i.test(src);
    if (isSvg) {
      setIsNonSquareIcon(false);
      return;
    }
    if (src.startsWith('blob:') && w === 300 && h === 150) {
      setIsNonSquareIcon(false);
      return;
    }

    const ratio = w / h;
    // Tolerate small perspective differences (~15%) before flipping modes
    setIsNonSquareIcon(ratio > 1.15 || ratio < 0.87);
  }, []);

  // Auto-fetch favicon when URL changes
  useEffect(() => {
    if (mode === 'link' && url.trim()) {
      const domain = extractDomain(url.trim());
      setPreviewDomain(domain || '');
    } else {
      setPreviewDomain('');
    }
    // Reset the non-square flag whenever the underlying URL/icon changes,
    // so the next icon load is evaluated fresh.
    setIsNonSquareIcon(false);
  }, [url, mode]);

  // Also reset when the custom icon URL changes
  useEffect(() => {
    setIsNonSquareIcon(false);
    setCustomIconLoadFailed(false);
  }, [customIcon, editItem?.icon]);

  // Auto-fetch website title when URL changes (debounced)
  const fetchTitle = useCallback(async (rawUrl: string) => {
    if (!rawUrl.trim()) return;
    
    // Cancel previous fetch
    if (titleFetchAbortRef.current) {
      titleFetchAbortRef.current.abort();
    }
    titleFetchAbortRef.current = new AbortController();

    setIsFetchingTitle(true);
    try {
      const fetchedTitle = await fetchWebsiteTitle(rawUrl.trim());
      if (fetchedTitle) {
        setTitle(fetchedTitle);
        setTitleAutoFilled(true);
      } else {
        // Fallback to hostname
        try {
          const u = new URL(rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`);
          setTitle(u.hostname.replace('www.', ''));
          setTitleAutoFilled(true);
        } catch { /* ignore */ }
      }
    } finally {
      setIsFetchingTitle(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'link' || isEditing || !url.trim()) return;
    // Only auto-fetch if title hasn't been manually edited
    if (title.trim() && !titleAutoFilled) return;

    const timer = setTimeout(() => {
      fetchTitle(url);
    }, 600);
    return () => clearTimeout(timer);
  }, [url, mode, isEditing, fetchTitle, titleAutoFilled, title]);

  const doAdd = (skipDupCheck: boolean) => {
    const finalTitle = title.trim() || (mode === 'folder' ? 'New Folder' : 'Untitled');
    const finalUrl = mode === 'link' ? (url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`) : undefined;

    if (isEditing && editItem) {
      updateDesktopItem(editItem.id, {
        title: finalTitle,
        url: finalUrl,
        icon: customIcon.trim() || undefined,
        iconColor: iconColor || undefined,
      });
      onClose();
      return;
    }

    // Check for duplicate before adding (only for links, skip if forced)
    if (!skipDupCheck && mode === 'link' && finalUrl) {
      const existing = checkDuplicate(finalUrl, parentFolderId);
      if (existing) {
        const msg = parentFolderId
          ? t('desktop.duplicateInFolderHint', { title: existing.title })
          : t('desktop.duplicateHint', { title: existing.title });
        setDuplicateWarning(msg);
        return; // Don't add yet — show the warning first
      }
    }

    const newItem: DesktopItem = {
      id: `${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: mode === 'folder' ? 'folder' : 'link',
      title: finalTitle,
      url: finalUrl,
      icon: customIcon.trim() || undefined,
      iconColor: iconColor || undefined,
      children: mode === 'folder' ? [] : undefined,
    };
    addDesktopItem(newItem, pageIndex, parentFolderId);
    onClose();
  };

  const handleSave = () => doAdd(false);
  const handleForceAdd = () => doAdd(true);

  const isCustomIconUrl = customIcon.startsWith('http');
  const previewFallbackText = title.trim() || previewDomain || url.trim() || (mode === 'folder' ? 'Folder' : 'Untitled');
  const previewFallbackSeed = url.trim() || previewDomain || previewFallbackText;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none p-4 sm:p-12" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* App Window container */}
      <div 
        ref={floatingWindow.shellRef}
        className={`relative w-full max-w-md sm:fixed sm:left-[var(--floating-window-left)] sm:top-[var(--floating-window-top)] sm:w-[var(--floating-window-width)] sm:h-[var(--floating-window-height)] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)] bg-black/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden select-none transition-all ${floatingWindow.isInteracting ? 'duration-0' : 'duration-300'}`}
        style={floatingWindow.style}
        onClick={e => e.stopPropagation()}
      >
        {/* Window Header */}
        <div
          onPointerDown={floatingWindow.handleDragPointerDown}
          className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none sm:cursor-default"
        >
          {/* Left: Mac traffic lights on desktop */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              </button>
            </div>
          </div>
          
          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              {isEditing ? t('desktop.editItem') : (mode === 'link' ? t('desktop.addLink') : t('desktop.addFolder'))}
            </span>
          </div>
          
          {/* Right spacer */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 desktop-scrollbar">
          {/* Mode Toggle (only for new items) */}
          {!isEditing && (
            <div className="flex justify-center mb-6">
              <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full flex gap-1 border border-white/10">
                <button 
                  type="button"
                  className={`px-4 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all whitespace-nowrap ${mode === 'link' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
                  onClick={() => setMode('link')}
                >
                  🔗 {t('desktop.addLink')}
                </button>
                <button 
                  type="button"
                  className={`px-4 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all whitespace-nowrap ${mode === 'folder' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
                  onClick={() => setMode('folder')}
                >
                  📁 {t('desktop.addFolder')}
                </button>
                {onSwitchToWidget && (
                  <button 
                    type="button"
                    className="px-4 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all whitespace-nowrap text-white/50 hover:text-white/80"
                    onClick={onSwitchToWidget}
                  >
                    🧩 {t('desktop.addWidget')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live Preview —— 裸展示图标本身，与桌面渲染保持一致（无毛玻璃外框）。
              正方形图标走 object-cover 铺满；非正方形（扁长 logo 等）走 object-contain +
              浅色卡片背景，避免两侧被裁掉。 */}
          <div className="flex flex-col items-center mb-6">
            <div
              className={
                'w-[72px] h-[72px] rounded-2xl overflow-hidden flex items-center justify-center mb-2 ' +
                (isNonSquareIcon ? 'bg-white/[0.08]' : '')
              }
            >
              {customIcon ? (
                isCustomIconUrl ? (
                  // Custom URL icon: match Desktop.tsx — object-cover for
                  // square icons, object-contain with padding otherwise.
                  customIconLoadFailed ? (
                    <IconFallback
                      className="w-full h-full text-3xl"
                      color={iconColor || undefined}
                      seed={previewFallbackSeed}
                      text={previewFallbackText}
                    />
                  ) : (
                    <img
                      src={customIcon}
                      className={isNonSquareIcon ? 'w-[78%] h-[78%] object-contain' : 'w-full h-full object-cover'}
                      alt=""
                      crossOrigin={getIconCrossOrigin(customIcon)}
                      onLoad={(e) => {
                        if (shouldUseLetterFallback(e.currentTarget)) {
                          setCustomIconLoadFailed(true);
                          return;
                        }
                        handlePreviewIconLoaded(e);
                      }}
                      onError={() => setCustomIconLoadFailed(true)}
                    />
                  )
                ) : (
                  // Emoji fallback needs a subtle backdrop so it stays visible
                  // against the modal background.
                  <div className="w-full h-full flex items-center justify-center bg-white/[0.08] rounded-2xl">
                    <span className="text-3xl">{customIcon}</span>
                  </div>
                )
              ) : mode === 'folder' ? (
                <div className="w-full h-full flex items-center justify-center bg-white/[0.08] rounded-2xl">
                  <span className="text-3xl">📁</span>
                </div>
              ) : previewDomain ? (
                // Live preview subscribes to the background HTML scanner so the
                // image upgrades to a hi-res SVG / apple-touch-icon as soon as
                // one is discovered. Rendered identically to Desktop.tsx so the
                // edit preview matches the actual desktop tile pixel-for-pixel.
                <FaviconImg
                  url={previewDomain}
                  sz={128}
                  className={isNonSquareIcon ? 'w-[78%] h-[78%] object-contain text-3xl' : 'w-full h-full object-cover text-3xl'}
                  fallbackColor={iconColor || undefined}
                  fallbackText={previewFallbackText}
                  fallbackSeed={previewFallbackSeed}
                  alt=""
                  onLoad={handlePreviewIconLoaded}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/[0.08] rounded-2xl">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
                </div>
              )}
            </div>
            <span className="text-[12px] text-white/60 font-medium truncate max-w-[150px]">{title || (mode === 'folder' ? 'Folder' : 'Untitled')}</span>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* URL (first for link mode) */}
            {mode === 'link' && (
              <div>
                <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('desktop.url')}</label>
                <input 
                  ref={urlInputRef}
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setTitleAutoFilled(false); }}
                  placeholder={t('desktop.urlPlaceholder')}
                  className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all shadow-inner placeholder-white/30"
                  autoFocus
                />
              </div>
            )}

            {/* Name */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 ml-1">{t('desktop.name')}</label>
                {isFetchingTitle && (
                  <span className="text-[11px] text-[#72d565]/70 font-medium animate-pulse">{t('desktop.fetchingTitle')}</span>
                )}
              </div>
              <input 
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); setTitleAutoFilled(false); }}
                placeholder={mode === 'folder' ? t('desktop.folderNamePlaceholder') : t('desktop.namePlaceholder')}
                className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all shadow-inner placeholder-white/30"
                autoFocus={mode === 'folder'}
              />
            </div>

            {/* Custom Icon */}
            <div>
              <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('desktop.icon')}</label>
              <input 
                type="text"
                value={customIcon}
                onChange={e => setCustomIcon(e.target.value)}
                placeholder="🎯 / https://..."
                className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all shadow-inner placeholder-white/30"
              />
            </div>

            {mode === 'link' && (
              <div>
                <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">Fallback color</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIconColor('')}
                    className={`h-8 px-3 rounded-lg border text-[12px] font-semibold transition-colors ${
                      !iconColor
                        ? 'border-white/40 bg-white/15 text-white'
                        : 'border-white/10 bg-black/30 text-white/50 hover:text-white/80 hover:border-white/25'
                    }`}
                  >
                    Auto
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {ICON_FALLBACK_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setIconColor(color)}
                        className={`h-8 w-8 rounded-lg border transition-transform hover:scale-105 ${
                          iconColor === color ? 'border-white ring-2 ring-white/35' : 'border-white/20'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                        aria-label={`Use ${color}`}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={iconColor || ICON_FALLBACK_COLORS[0]}
                    onChange={e => setIconColor(e.target.value)}
                    className="h-8 w-8 shrink-0 rounded-lg border border-white/20 bg-transparent p-0"
                    aria-label="Custom fallback color"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-amber-400 text-[13px] font-medium">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>{duplicateWarning}</span>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className={`flex gap-3 ${duplicateWarning ? 'mt-3' : 'mt-6'}`}>
            {duplicateWarning && (
              <button
                onClick={handleForceAdd}
                className="flex-1 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold text-[13px] transition-colors"
              >
                {t('desktop.addAnyway')}
              </button>
            )}
            <button 
              onClick={handleSave}
              disabled={mode === 'link' && !url.trim()}
              className={`${duplicateWarning ? 'flex-1' : 'w-full'} py-3 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] border border-[#5bb84f] text-black font-bold transition-colors shadow-[0_0_15px_rgba(114,213,101,0.3)] hover:shadow-[0_0_20px_rgba(114,213,101,0.5)] disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {duplicateWarning ? t('desktop.save') : t('desktop.save')}
            </button>
          </div>
        </div>
        {floatingWindow.resizeHandle}
      </div>
    </div>
  );
};
