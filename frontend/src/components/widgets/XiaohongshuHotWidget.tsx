import React, { useEffect, useState, useCallback } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { useTranslation } from '../../i18n/useTranslation';

interface XiaohongshuHotWidgetProps {
  size: WidgetSize;
}

interface HotItem {
  title: string;
  url: string;
  score: string;
  rank: number;
}

export const XiaohongshuHotWidget: React.FC<XiaohongshuHotWidgetProps> = ({ size: _size }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const serverUrl = useConfigStore(s => s.getEffectiveServerUrl());
  const [items, setItems] = useState<HotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!serverUrl) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const resp = await fetch(`${serverUrl}/api/v1/trending/xiaohongshu`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setItems(json.data || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-2 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[16px]">📕</span>
          <span className="text-[13px] font-semibold text-white/80">{isZh ? '小红书热搜' : 'Xiaohongshu Hot'}</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); load(); }} disabled={loading} className="text-white/30 hover:text-white/60 transition-colors p-1 rounded" title={isZh ? '刷新' : 'Refresh'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 11-6.22-8.56" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-0.5 pb-2">
        {loading && items.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin opacity-30">
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/>
            </svg>
          </div>
        )}
        {error && !loading && (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <span className="text-white/30 text-[12px]">{!serverUrl ? (isZh ? '请先配置服务器地址' : 'Configure server URL first') : (isZh ? '加载失败' : 'Failed to load')}</span>
            <button onClick={load} className="text-[11px] text-[#FF2442]/70 hover:text-[#FF2442]">{isZh ? '重试' : 'Retry'}</button>
          </div>
        )}
        {items.map((item) => (
          <a
            key={`${item.rank}-${item.title}`}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-start gap-1 px-1 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06] cursor-pointer"
          >
            <span className={`shrink-0 w-3.5 text-[11px] text-right mt-0.5 font-mono ${item.rank <= 3 ? 'font-bold text-[#FF2442]' : 'text-white/25'}`}>{item.rank}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white/80 hover:text-[#FF2442] transition-colors line-clamp-2 leading-tight">{item.title}</p>
              {item.score && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-white/25">🔥 {item.score}</span>
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
