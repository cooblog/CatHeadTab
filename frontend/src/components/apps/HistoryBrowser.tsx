import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import { getSmartFaviconUrl } from '../../utils/favicon';

// ---------------------------------------------------------------------------
// HistoryItem — lightweight type for chrome.history.HistoryItem
// ---------------------------------------------------------------------------
interface HistoryItem {
  id: string;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
}

// Mock data for local development outside Chrome Extension context
const mockHistory: HistoryItem[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com', lastVisitTime: Date.now() - 60000, visitCount: 42 },
  { id: '2', title: 'Stack Overflow', url: 'https://stackoverflow.com', lastVisitTime: Date.now() - 120000, visitCount: 28 },
  { id: '3', title: 'React Documentation', url: 'https://react.dev', lastVisitTime: Date.now() - 3600000, visitCount: 15 },
  { id: '4', title: 'Tailwind CSS', url: 'https://tailwindcss.com', lastVisitTime: Date.now() - 7200000, visitCount: 12 },
  { id: '5', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', lastVisitTime: Date.now() - 86400000, visitCount: 35 },
  { id: '6', title: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/', lastVisitTime: Date.now() - 86400000 * 2, visitCount: 9 },
  { id: '7', title: 'Vite', url: 'https://vitejs.dev', lastVisitTime: Date.now() - 86400000 * 3, visitCount: 5 },
  { id: '8', title: 'Zustand', url: 'https://zustand-demo.pmnd.rs/', lastVisitTime: Date.now() - 86400000 * 5, visitCount: 3 },
];

// ---------------------------------------------------------------------------
// Time range filters
// ---------------------------------------------------------------------------
type TimeRange = 'today' | 'yesterday' | 'week' | 'month' | 'all';

const getTimeRangeStart = (range: TimeRange): number => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (range) {
    case 'today': return startOfToday;
    case 'yesterday': return startOfToday - 86400000;
    case 'week': return startOfToday - 7 * 86400000;
    case 'month': return startOfToday - 30 * 86400000;
    case 'all': return 0;
  }
};

// ---------------------------------------------------------------------------
// Format relative time
// ---------------------------------------------------------------------------
const formatRelativeTime = (timestamp: number, language: string): string => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (language === 'zh') {
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
  }
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US');
};

// ---------------------------------------------------------------------------
// HistoryBrowser Component
// ---------------------------------------------------------------------------
export const HistoryBrowser: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, language } = useTranslation();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRange, setActiveRange] = useState<TimeRange>('all');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch history from Chrome API or use mock data
  const fetchHistory = useCallback((query: string, range: TimeRange) => {
    setLoading(true);
    const startTime = getTimeRangeStart(range);

    if (typeof chrome !== 'undefined' && chrome.history) {
      chrome.history.search(
        { text: query, maxResults: 200, startTime },
        (results) => {
          setHistoryItems(results as HistoryItem[]);
          setLoading(false);
        }
      );
    } else {
      // Mock data fallback for local development
      const filtered = mockHistory.filter((item) => {
        const matchesQuery = !query ||
          item.title?.toLowerCase().includes(query.toLowerCase()) ||
          item.url?.toLowerCase().includes(query.toLowerCase());
        const matchesTime = !startTime || (item.lastVisitTime && item.lastVisitTime >= startTime);
        return matchesQuery && matchesTime;
      });
      setTimeout(() => {
        setHistoryItems(filtered);
        setLoading(false);
      }, 100);
    }
  }, []);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchHistory(searchQuery, activeRange);
  }, [searchQuery, activeRange, fetchHistory]);

  // Delete a single history entry
  const deleteHistoryItem = useCallback((url: string) => {
    if (typeof chrome !== 'undefined' && chrome.history) {
      chrome.history.deleteUrl({ url }, () => {
        setHistoryItems((prev) => prev.filter((item) => item.url !== url));
      });
    } else {
      setHistoryItems((prev) => prev.filter((item) => item.url !== url));
    }
  }, []);

  // Time range options
  const timeRanges: { id: TimeRange; icon: React.ReactNode }[] = [
    {
      id: 'all',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>,
    },
    {
      id: 'today',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      id: 'yesterday',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>,
    },
    {
      id: 'week',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    },
    {
      id: 'month',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4 sm:p-12" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity"
        onClick={onClose}
      />

      {/* App Window container — same as BookmarkBrowser */}
      <div
        className={`bg-black/30 backdrop-blur-xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-[800px] h-[80vh] md:h-[75vh] rounded-[1.5rem] md:rounded-[2rem]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Header — macOS traffic lights */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none absolute top-0 left-0 right-0 z-20">
          {/* Left: Mac traffic lights on desktop, hamburger on mobile */}
          <div className="flex items-center gap-2 w-auto md:w-24">
            {/* Mobile: hamburger */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
            </button>
            {/* Desktop: traffic lights */}
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

          {/* Center: title */}
          <div className="flex-1 flex justify-center drag-region cursor-move opacity-60 hover:opacity-100 transition-opacity min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] md:text-[13px] font-medium text-white/70 truncate max-w-full overflow-hidden">
              <span className="text-white font-bold drop-shadow-md truncate">
                {t('history.title')}
              </span>
              {activeRange !== 'all' && (
                <>
                  <span className="text-white/30 text-[10px] shrink-0">&#9654;</span>
                  <span className="text-white/60 truncate">{t(`history.range_${activeRange}`)}</span>
                </>
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

        {/* Browser Body */}
        <div className="flex-1 flex overflow-hidden mt-12 md:mt-14 relative">
          <div className="absolute inset-0 border-t border-white/5 pointer-events-none" />

          {/* Mobile sidebar overlay */}
          {showSidebar && (
            <div className="absolute inset-0 z-30 md:hidden" onClick={() => setShowSidebar(false)}>
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#1c1c1e]/90 backdrop-blur-[64px] border-r border-white/10 flex flex-col z-40 animate-slideIn" onClick={(e) => e.stopPropagation()}>
                {/* Search */}
                <div className="p-4 pb-2">
                  <div className="relative">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('history.search')}
                      className="w-full bg-[#202324] border border-white/10 focus:border-blue-500/50 hover:bg-[#2a2e30] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white/90 placeholder-white/30 outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>
                {/* Time range list */}
                <div className="flex-1 overflow-y-auto no-scrollbar pl-4 pr-3 pb-8 pt-3 space-y-1">
                  {timeRanges.map((range) => (
                    <button
                      key={range.id}
                      onClick={() => { setActiveRange(range.id); setShowSidebar(false); }}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeRange === range.id ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className={`shrink-0 ${activeRange === range.id ? 'text-white/80' : 'text-white/40 group-hover:text-blue-400'}`}>
                          {range.icon}
                        </span>
                        <span className="text-[14px] font-medium truncate">{t(`history.range_${range.id}`)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Desktop Sidebar */}
          <div className="window-sidebar hidden md:flex w-[240px] border-r border-white/10 flex-col shrink-0 relative z-10">
            {/* Search Area */}
            <div className="p-5 pb-2">
              <div className="relative">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('history.search')}
                  className="w-full bg-[#202324] border border-white/10 focus:border-blue-500/50 hover:bg-[#2a2e30] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white/90 placeholder-white/30 outline-none transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Time Range List */}
            <div className="flex-1 overflow-y-auto no-scrollbar pl-5 pr-3 pb-8 pt-3 space-y-1">
              {timeRanges.map((range) => (
                <button
                  key={range.id}
                  onClick={() => setActiveRange(range.id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all w-full text-left group ${activeRange === range.id ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`shrink-0 ${activeRange === range.id ? 'text-white/80' : 'text-white/40 group-hover:text-blue-400'}`}>
                      {range.icon}
                    </span>
                    <span className="text-[14px] font-medium truncate">{t(`history.range_${range.id}`)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Main List View */}
          <div className="window-content flex-1 overflow-y-auto">
            {/* Mobile: inline search */}
            <div className="md:hidden p-3 pb-0">
              <div className="relative">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('history.search')}
                  className="w-full bg-[#202324] border border-white/10 focus:border-blue-500/50 hover:bg-[#2a2e30] rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white/90 placeholder-white/30 outline-none transition-all shadow-inner"
                />
              </div>
            </div>
            <div className="p-4 md:p-6">
              <div className="flex items-center justify-between mb-3 md:mb-4 pb-3 border-b border-white/10 pl-1">
                <h1 className="text-base md:text-xl font-bold text-white tracking-tight flex items-center gap-3">
                  {t(`history.range_${activeRange}`)}
                </h1>
                <span className="text-white/40 text-[12px] md:text-[13px] font-medium bg-white/5 px-2.5 md:px-3 py-0.5 md:py-1 rounded-full">
                  {historyItems.length} {t('history.items')}
                </span>
              </div>

              {loading ? (
                <div className="w-full h-[60%] flex flex-col items-center justify-center text-white/20">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-4" />
                  <p className="text-[13px]">{t('history.loading')}</p>
                </div>
              ) : historyItems.length > 0 ? (
                <div className="flex flex-col gap-1 w-full">
                  {historyItems.map((item) => (
                    <div
                      key={`${item.id}-${item.url}`}
                      className="bookmark-row flex items-center px-3 md:px-4 py-2 md:py-2.5 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer border border-transparent hover:border-white/5 active:scale-[0.99]"
                      onClick={() => item.url && window.open(item.url, '_blank')}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden">
                          {item.url ? (
                            <img
                              src={getSmartFaviconUrl(item.url, 64, true)}
                              alt=""
                              className="w-4.5 h-4.5 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px]">🌐</span>';
                              }}
                            />
                          ) : (
                            <span className="text-[10px]">🌐</span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[13px] font-semibold text-white/90 truncate bookmark-title transition-colors">
                            {item.title || (item.url ? new URL(item.url).hostname : t('history.untitled'))}
                          </span>
                          {item.url && (
                            <span className="text-[11px] text-white/30 truncate mt-0.5">
                              {item.url}
                            </span>
                          )}
                          {item.lastVisitTime && (
                            <span className="text-[11px] text-white/25 truncate mt-0.5">
                              {formatRelativeTime(item.lastVisitTime, language)}
                              {item.visitCount && item.visitCount > 1 ? ` · ${item.visitCount} ${t('history.visits')}` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons (Hover) */}
                      <div className="bookmark-actions flex items-center gap-1.5 shrink-0 ml-2">
                        {item.url && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.url!);
                            }}
                            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/20 text-white/50 hover:text-white flex items-center justify-center transition-colors"
                            title={t('history.copyUrl')}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.url) {
                              deleteHistoryItem(item.url);
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-red-500/10 hover:bg-red-500/90 text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 flex items-center justify-center transition-all"
                          title={t('history.deleteItem')}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full h-[60%] flex flex-col items-center justify-center text-white/20">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-6 opacity-30"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <p className="text-[15px] font-medium text-white/40">{searchQuery ? t('history.noResults') : t('history.empty')}</p>
                  <p className="text-[13px] mt-2">{t('history.emptyHint')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
