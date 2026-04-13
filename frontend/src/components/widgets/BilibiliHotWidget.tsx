import React, { useEffect, useState, useCallback } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { useTranslation } from '../../i18n/useTranslation';

interface BilibiliHotWidgetProps {
  size: WidgetSize;
}

interface HotVideo {
  title: string;
  bvid: string;
  owner: string;
  view: number;
  danmaku: number;
  duration: number;
  url: string;
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const BilibiliHotWidget: React.FC<BilibiliHotWidgetProps> = ({ size }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const serverUrl = useConfigStore(s => s.getEffectiveServerUrl());
  const [videos, setVideos] = useState<HotVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!serverUrl) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const resp = await fetch(`${serverUrl}/api/v1/trending/bilibili`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setVideos(json.data || []);
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
            <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 01-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 01.16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906l-1.174 1.12zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.764-.28-1.396-.786-1.894a2.619 2.619 0 00-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" fill="#00A1D6"/>
          </svg>
          <span className="text-[13px] font-semibold text-white/80">{isZh ? '哔哩哔哩热门' : 'Bilibili Hot'}</span>
        </div>
        <button onClick={load} disabled={loading} className="text-white/30 hover:text-white/60 transition-colors p-1 rounded" title={isZh ? '刷新' : 'Refresh'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 11-6.22-8.56" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-1.5 pb-2">
        {loading && videos.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin opacity-30">
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/>
            </svg>
          </div>
        )}
        {error && !loading && (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <span className="text-white/30 text-[12px]">{!serverUrl ? (isZh ? '请先配置服务器地址' : 'Configure server URL first') : (isZh ? '加载失败' : 'Failed to load')}</span>
            <button onClick={load} className="text-[11px] text-[#00A1D6]/70 hover:text-[#00A1D6]">{isZh ? '重试' : 'Retry'}</button>
          </div>
        )}
        {videos.map((video, i) => (
          <a
            key={video.bvid}
            href={video.url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="block px-2.5 py-1.5 rounded-lg transition-colors group cursor-pointer"
          >
            <div>
              <p className="text-[12px] font-medium text-white/80 group-hover:text-[#00A1D6] transition-colors line-clamp-2 leading-tight">{video.title}</p>
              <div className="flex items-center gap-2.5 mt-1">
                <span className="text-[10px] text-white/30 truncate">{video.owner}</span>
                <span className="text-[10px] text-white/25 flex items-center gap-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {formatNumber(video.view)}
                </span>
                <span className="text-[10px] text-white/25">{formatDuration(video.duration)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
