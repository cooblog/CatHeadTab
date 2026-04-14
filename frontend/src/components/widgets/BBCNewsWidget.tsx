import React, { useEffect, useState, useCallback } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { useTranslation } from '../../i18n/useTranslation';

interface BBCNewsWidgetProps {
  size: WidgetSize;
}

interface NewsItem {
  title: string;
  description: string;
  url: string;
  section: string;
  rank: number;
}

export const BBCNewsWidget: React.FC<BBCNewsWidgetProps> = ({ size: _size }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const serverUrl = useConfigStore(s => s.getEffectiveServerUrl());
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!serverUrl) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const resp = await fetch(`${serverUrl}/api/v1/trending/bbc`);
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
      <div className="shrink-0 flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="4" width="22" height="16" rx="2" fill="#BB1919"/>
            <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" fontFamily="Arial,sans-serif">BBC</text>
          </svg>
          <span className="text-[13px] font-semibold text-white/80">BBC News</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); load(); }} disabled={loading} className="text-white/30 hover:text-white/60 transition-colors p-1 rounded" title={isZh ? '刷新' : 'Refresh'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 11-6.22-8.56" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-1.5 pb-2">
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
            <button onClick={load} className="text-[11px] text-[#BB1919]/70 hover:text-[#BB1919]">{isZh ? '重试' : 'Retry'}</button>
          </div>
        )}
        {items.map((item) => (
          <a
            key={`${item.rank}-${item.title}`}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="block px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06] cursor-pointer"
          >
            <p className="text-[12px] font-medium text-white/80 hover:text-[#BB1919] transition-colors line-clamp-2 leading-tight">{item.title}</p>
            {item.description && (
              <p className="text-[10px] text-white/30 line-clamp-1 mt-0.5 leading-tight">{item.description}</p>
            )}
          </a>
        ))}
      </div>

      {/* Data source */}
      <div className="shrink-0 px-3 pb-1.5">
        <span className="text-[9px] text-white/20">{isZh ? '数据来源：BBC News RSS' : 'Data: BBC News RSS'}</span>
      </div>
    </div>
  );
};
