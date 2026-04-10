import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useLayoutStore, DesktopItem } from '../store/layoutStore';
import { useConfigStore } from '../store/configStore';
import { useTranslation } from '../i18n/useTranslation';
import { getSmartFaviconUrl, extractDomain } from '../utils/favicon';

/** URL prefixes that are considered unsupported (browser internal pages). */
const UNSUPPORTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'brave://',
  'vivaldi://',
  'opera://',
  'firefox://',
  'devtools://',
];

/** Check whether a URL is a normal web page that can be added. */
const isSupportedPage = (pageUrl?: string): boolean => {
  if (!pageUrl) return false;
  return !UNSUPPORTED_PREFIXES.some((prefix) => pageUrl.startsWith(prefix));
};

// Fetch website title from URL
const fetchWebsiteTitle = async (rawUrl: string): Promise<string | null> => {
  try {
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
};

// Wait for stores to hydrate before rendering
function useStoreHydrated() {
  const configHydrated = useSyncExternalStore(
    (cb) => useConfigStore.persist.onFinishHydration(cb),
    () => useConfigStore.persist.hasHydrated(),
    () => false,
  );
  const layoutHydrated = useSyncExternalStore(
    (cb) => useLayoutStore.persist.onFinishHydration(cb),
    () => useLayoutStore.persist.hasHydrated(),
    () => false,
  );
  return configHydrated && layoutHydrated;
}

/** Popup component shown when clicking the extension toolbar icon. */
export const Popup: React.FC = () => {
  const hydrated = useStoreHydrated();
  const { addDesktopItem, checkDuplicate } = useLayoutStore();
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [customIcon, setCustomIcon] = useState('');
  const [faviconPreview, setFaviconPreview] = useState('');
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [titleAutoFilled, setTitleAutoFilled] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const titleFetchAbortRef = useRef<AbortController | null>(null);

  // Auto-fill current tab URL + title on mount
  useEffect(() => {
    if (!hydrated) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!isSupportedPage(tab?.url)) {
        setUnsupported(true);
        return;
      }
      if (tab?.url) {
        setUrl(tab.url);
        if (tab.title) {
          setTitle(tab.title);
          setTitleAutoFilled(true);
        }
        // Favicon preview
        const domain = extractDomain(tab.url);
        if (domain) {
          setFaviconPreview(getSmartFaviconUrl(domain, 128));
        }
      }
    });
  }, [hydrated]);

  // Auto-fetch favicon when URL changes manually
  useEffect(() => {
    if (url.trim()) {
      const domain = extractDomain(url.trim());
      if (domain) {
        setFaviconPreview(getSmartFaviconUrl(domain, 128));
      } else {
        setFaviconPreview('');
      }
    } else {
      setFaviconPreview('');
    }
  }, [url]);

  // Auto-fetch website title when URL changes (debounced)
  const fetchTitle = useCallback(async (rawUrl: string) => {
    if (!rawUrl.trim()) return;
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
    if (!url.trim()) return;
    if (title.trim() && !titleAutoFilled) return;
    const timer = setTimeout(() => {
      fetchTitle(url);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fetchTitle, titleAutoFilled]);

  const doAdd = (skipDupCheck: boolean) => {
    const finalTitle = title.trim() || 'Untitled';
    const finalUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;

    // Check for duplicate
    if (!skipDupCheck && finalUrl) {
      const existing = checkDuplicate(finalUrl);
      if (existing) {
        setDuplicateWarning(t('desktop.duplicateHint', { title: existing.title }));
        return;
      }
    }

    const newItem: DesktopItem = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'link',
      title: finalTitle,
      url: finalUrl,
      icon: customIcon.trim() || undefined,
    };
    addDesktopItem(newItem);
    setSaved(true);
    setTimeout(() => window.close(), 800);
  };

  const handleSave = () => doAdd(false);
  const handleForceAdd = () => doAdd(true);

  const isCustomIconUrl = customIcon.startsWith('http');

  if (!hydrated) {
    return (
      <div className="w-[360px] min-h-[200px] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Unsupported page state
  if (unsupported) {
    return (
      <div className="w-[360px] p-8 flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-white/[0.08] flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <span className="text-[14px] font-semibold text-white/80">{t('desktop.unsupportedPage')}</span>
        <span className="text-[12px] text-white/40 text-center leading-relaxed max-w-[280px]">{t('desktop.unsupportedPageDesc')}</span>
      </div>
    );
  }

  // Success state
  if (saved) {
    return (
      <div className="w-[360px] p-6 flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-[#72d565]/20 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#72d565" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span className="text-[14px] font-semibold text-white/90">{t('desktop.save')} ✓</span>
      </div>
    );
  }

  return (
    <div className="w-[360px] flex flex-col select-none">
      {/* Header */}
      <div className="h-11 border-b border-white/10 flex items-center justify-center shrink-0 bg-white/[0.02]">
        <span className="text-[13px] font-semibold text-white/70">
          {t('desktop.addLink')}
        </span>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-4">
        {/* Live Preview */}
        <div className="flex flex-col items-center">
          <div className="w-[56px] h-[56px] rounded-2xl bg-white/[0.15] backdrop-blur-xl border border-white/20 shadow-lg flex items-center justify-center overflow-hidden mb-1.5">
            {customIcon ? (
              isCustomIconUrl ? (
                <img src={customIcon} className="w-9 h-9 object-cover rounded-xl" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span className="text-2xl">{customIcon}</span>
              )
            ) : faviconPreview ? (
              <img src={faviconPreview} className="w-9 h-9 object-cover rounded-xl" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
            )}
          </div>
          <span className="text-[11px] text-white/60 font-medium truncate max-w-[200px]">{title || 'Untitled'}</span>
        </div>

        {/* Form Fields */}
        <div className="space-y-3">
          {/* URL */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1.5 ml-1">{t('desktop.url')}</label>
            <input
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setTitleAutoFilled(false); setDuplicateWarning(null); }}
              placeholder={t('desktop.urlPlaceholder')}
              className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all shadow-inner placeholder-white/30"
              autoFocus
            />
          </div>

          {/* Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 ml-1">{t('desktop.name')}</label>
              {isFetchingTitle && (
                <span className="text-[10px] text-[#72d565]/70 font-medium animate-pulse">{t('desktop.fetchingTitle')}</span>
              )}
            </div>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setTitleAutoFilled(false); }}
              placeholder={t('desktop.namePlaceholder')}
              className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all shadow-inner placeholder-white/30"
            />
          </div>

          {/* Custom Icon */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1.5 ml-1">{t('desktop.icon')}</label>
            <input
              type="text"
              value={customIcon}
              onChange={e => setCustomIcon(e.target.value)}
              placeholder="🎯 / https://..."
              className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all shadow-inner placeholder-white/30"
            />
          </div>
        </div>

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-amber-400 text-[12px] font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>{duplicateWarning}</span>
            </div>
          </div>
        )}

        {/* Save button */}
        <div className={`flex gap-2 ${duplicateWarning ? '' : 'mt-1'}`}>
          {duplicateWarning && (
            <button
              onClick={handleForceAdd}
              className="flex-1 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold text-[12px] transition-colors"
            >
              {t('desktop.addAnyway')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!url.trim()}
            className={`${duplicateWarning ? 'flex-1' : 'w-full'} py-2.5 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] border border-[#5bb84f] text-black font-bold text-[13px] transition-colors shadow-[0_0_15px_rgba(114,213,101,0.3)] hover:shadow-[0_0_20px_rgba(114,213,101,0.5)] disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {t('desktop.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
