import React, { useEffect, useState, useCallback } from 'react';
import type { WidgetSize } from '../../store/layoutStore';
import { useConfigStore } from '../../store/configStore';
import { useTranslation } from '../../i18n/useTranslation';
import { openUrl } from '../../utils/openUrl';

interface GithubTrendingWidgetProps {
  size: WidgetSize;
  config?: import('../../store/layoutStore').GithubTrendingWidgetConfig;
}

interface TrendingRepo {
  fullName: string;
  description: string;
  language: string;
  stars: number;
  todayStars: number;
  url: string;
}

const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
  Ruby: '#701516', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
  PHP: '#4F5D95', Lua: '#000080', Shell: '#89e051', Vue: '#41b883', HTML: '#e34c26',
  CSS: '#563d7c', Jupyter: '#DA5B0B', R: '#198CE7', Scala: '#c22d40',
};

function formatStars(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function getGithubTrendingUrl(config?: import('../../store/layoutStore').GithubTrendingWidgetConfig): string {
  const url = new URL(config?.language ? `https://github.com/trending/${encodeURIComponent(config.language)}` : 'https://github.com/trending');
  if (config?.since) url.searchParams.set('since', config.since);
  return url.toString();
}

export const GithubTrendingWidget: React.FC<GithubTrendingWidgetProps> = ({ size: _size, config }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const serverUrl = useConfigStore(s => s.getEffectiveServerUrl());
  const [repos, setRepos] = useState<TrendingRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!serverUrl) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const url = new URL(`${serverUrl}/api/v1/trending/github`);
      if (config?.language) url.searchParams.set('lang', config.language);
      if (config?.since) url.searchParams.set('since', config.since);
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setRepos(json.data || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, config?.language, config?.since]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 min (server caches for 1 hour, client refreshes more often to stay fresh)
  useEffect(() => {
    const timer = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openUrl(getGithubTrendingUrl(config));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            title={isZh ? '打开 GitHub Trending' : 'Open GitHub Trending'}
            aria-label={isZh ? '打开 GitHub Trending' : 'Open GitHub Trending'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </button>
          <span className="text-[13px] font-semibold text-white/80 flex items-center gap-1.5">
            Trending
            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/60 font-medium">
              {config?.since === 'weekly' ? (isZh ? '本周' : 'Weekly') : config?.since === 'monthly' ? (isZh ? '本月' : 'Monthly') : (isZh ? '今日' : 'Daily')}
            </span>
          </span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); load(); }} disabled={loading} className="text-white/30 hover:text-white/60 transition-colors p-1 rounded" title={isZh ? '刷新' : 'Refresh'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 11-6.22-8.56" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-1.5 pb-2">
        {loading && repos.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="animate-spin opacity-30">
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/>
            </svg>
          </div>
        )}
        {error && !loading && (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <span className="text-white/30 text-[12px]">{!serverUrl ? (isZh ? '请先配置服务器地址' : 'Configure server URL first') : (isZh ? '加载失败' : 'Failed to load')}</span>
            <button onClick={load} className="text-[11px] text-[#72d565]/70 hover:text-[#72d565]">{isZh ? '重试' : 'Retry'}</button>
          </div>
        )}
        {repos.map((repo) => (
          <a
            key={repo.fullName}
            href={repo.url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="block px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06] cursor-pointer"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-white/80 hover:text-[#72d565] transition-colors truncate">{repo.fullName}</span>
              </div>
              {repo.description && (
                <p className="text-[11px] text-white/35 leading-tight mt-0.5 line-clamp-1">{repo.description}</p>
              )}
              <div className="flex items-center gap-3 mt-0.5 flex-nowrap overflow-hidden">
                {repo.language && (
                  <span className="flex items-center gap-1 text-[10px] text-white/30 whitespace-nowrap shrink-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: LANG_COLORS[repo.language] || '#888' }} />
                    {repo.language}
                  </span>
                )}
                <span className="text-[10px] text-white/30 whitespace-nowrap shrink-0">★ {formatStars(repo.stars)}</span>
                {repo.todayStars > 0 && (
                  <span className="text-[10px] text-[#72d565]/60 whitespace-nowrap shrink-0">+{repo.todayStars} today</span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>


    </div>
  );
};
