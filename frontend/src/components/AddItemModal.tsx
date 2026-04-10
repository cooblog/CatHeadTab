import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLayoutStore, DesktopItem } from '../store/layoutStore';
import { useTranslation } from '../i18n/useTranslation';
import { getSmartFaviconUrl, extractDomain } from '../utils/favicon';

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

  const [mode, setMode] = useState<'link' | 'folder'>(editItem?.type === 'folder' ? 'folder' : 'link');
  const [title, setTitle] = useState(editItem?.title || '');
  const [url, setUrl] = useState(editItem?.url || '');
  const [customIcon, setCustomIcon] = useState(editItem?.icon || '');
  const [faviconPreview, setFaviconPreview] = useState('');
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [titleAutoFilled, setTitleAutoFilled] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const titleFetchAbortRef = useRef<AbortController | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Auto-fetch favicon when URL changes
  useEffect(() => {
    if (mode === 'link' && url.trim()) {
      const domain = extractDomain(url.trim());
      if (domain) {
        setFaviconPreview(getSmartFaviconUrl(domain, 128));
      } else {
        setFaviconPreview('');
      }
    } else {
      setFaviconPreview('');
    }
  }, [url, mode]);

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
      children: mode === 'folder' ? [] : undefined,
    };
    addDesktopItem(newItem, pageIndex, parentFolderId);
    onClose();
  };

  const handleSave = () => doAdd(false);
  const handleForceAdd = () => doAdd(true);

  const isCustomIconUrl = customIcon.startsWith('http');

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none p-4 sm:p-12" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* App Window container */}
      <div 
        className="w-full max-w-md bg-black/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden select-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Window Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
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
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 no-scrollbar">
          {/* Mode Toggle (only for new items) */}
          {!isEditing && (
            <div className="flex justify-center mb-6">
              <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full flex gap-1 border border-white/10">
                <button 
                  type="button"
                  className={`px-4 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all ${mode === 'link' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
                  onClick={() => setMode('link')}
                >
                  🔗 {t('desktop.addLink')}
                </button>
                <button 
                  type="button"
                  className={`px-4 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all ${mode === 'folder' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
                  onClick={() => setMode('folder')}
                >
                  📁 {t('desktop.addFolder')}
                </button>
                {onSwitchToWidget && (
                  <button 
                    type="button"
                    className="px-4 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all text-white/50 hover:text-white/80"
                    onClick={onSwitchToWidget}
                  >
                    🧩 {t('desktop.addWidget')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live Preview */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-[72px] h-[72px] rounded-2xl bg-white/[0.15] backdrop-blur-xl border border-white/20 shadow-lg flex items-center justify-center overflow-hidden mb-2">
              {customIcon ? (
                isCustomIconUrl ? (
                  <img src={customIcon} className="w-11 h-11 object-cover rounded-xl" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span className="text-3xl">{customIcon}</span>
                )
              ) : mode === 'folder' ? (
                <span className="text-3xl">📁</span>
              ) : faviconPreview ? (
                <img src={faviconPreview} className="w-11 h-11 object-cover rounded-xl" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
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
      </div>
    </div>
  );
};
