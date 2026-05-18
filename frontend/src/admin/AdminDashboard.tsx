import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactNode } from 'react';
import client from '../api/client';
import { ENV_API_URL, isEnvConfigured, useConfigStore } from '../store/configStore';
import type { UserProfile } from '../store/configStore';

interface NamedCount {
  name: string;
  count: number;
}

interface DailyCount {
  date: string;
  count: number;
}

interface DailyAIUsage {
  date: string;
  request_count: number;
  total_tokens: number;
}

interface DomainCount {
  domain: string;
  count: number;
}

interface PresetCategoryCount {
  category: string;
  count: number;
}

interface WallpaperCacheBreakdown {
  provider: string;
  sorting: string;
  count: number;
}

interface TopAIUser {
  user_id: string;
  display_name: string;
  request_count: number;
  total_tokens: number;
}

interface APIPathCount {
  method: string;
  path: string;
  count: number;
}

interface TableSize {
  table_name: string;
  bytes: number;
}

interface AdminDashboard {
  generated_at: string;
  users: {
    total: number;
    verified: number;
    unverified: number;
    password_users: number;
    oauth_users: number;
    registered_today: number;
    registered_7d: number;
    registered_30d: number;
    by_role: NamedCount[] | null;
    daily_new_users: DailyCount[] | null;
  };
  bookmarks: {
    total: number;
    links: number;
    folders: number;
    users: number;
    updated_7d: number;
    updated_30d: number;
    avg_per_user: number;
    top_domains: DomainCount[] | null;
  };
  layouts: {
    total: number;
    users: number;
    updated_7d: number;
    updated_30d: number;
    avg_items: number;
    last_updated: string;
  };
  backgrounds: {
    total: number;
    total_bytes: number;
    avg_bytes: number;
    updated_7d: number;
    updated_30d: number;
  };
  presets: {
    categories: number;
    sites: number;
    top_categories: PresetCategoryCount[] | null;
  };
  wallpaper_cache: {
    total: number;
    fresh: number;
    expired: number;
    providers: number;
    last_created: string;
    breakdown: WallpaperCacheBreakdown[] | null;
  };
  ai_usage: {
    total_requests: number;
    total_tokens: number;
    tokens_today: number;
    tokens_7d: number;
    tokens_30d: number;
    users_today: number;
    users_7d: number;
    users_30d: number;
    daily_usage: DailyAIUsage[] | null;
    top_users: TopAIUser[] | null;
  };
  api_access: {
    total_requests: number;
    requests_today: number;
    requests_7d: number;
    requests_30d: number;
    error_requests_30d: number;
    unique_paths: number;
    daily_requests: DailyCount[] | null;
    top_paths: APIPathCount[] | null;
    status_breakdown: NamedCount[] | null;
  };
  auth: {
    email_verification_pending: number;
    email_verification_expired: number;
    password_reset_pending: number;
    password_reset_used: number;
    password_reset_expired: number;
    oauth_providers: NamedCount[] | null;
  };
  table_sizes: TableSize[] | null;
}

type LoadState = 'booting' | 'login' | 'ready' | 'forbidden' | 'error';

function useConfigHydrated() {
  return useSyncExternalStore(
    (callback) => useConfigStore.persist.onFinishHydration(callback),
    () => useConfigStore.persist.hasHydrated(),
    () => false,
  );
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

function formatDecimal(value: number | null | undefined, digits = 1) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function formatBytes(value: number | null | undefined) {
  const bytes = value ?? 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${formatDecimal(size, size >= 10 ? 1 : 2)} ${units[index]}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDay(value: string) {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value;
}

function roleLabel(name: string) {
  if (name === 'admin') return '管理员';
  if (name === 'pro') return 'Pro';
  return '普通用户';
}

function statusGroupLabel(name: string) {
  if (name === '2xx') return '成功 2xx';
  if (name === '3xx') return '跳转 3xx';
  if (name === '4xx') return '客户端错误 4xx';
  if (name === '5xx') return '服务端错误 5xx';
  return name;
}

function maxValue(values: number[]) {
  return values.length > 0 ? Math.max(1, ...values) : 1;
}

function StatTile(props: { label: string; value: string; detail: string; tone: 'green' | 'blue' | 'amber' | 'rose' | 'violet' | 'cyan' }) {
  return (
    <div className={`stat-tile stat-${props.tone}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </div>
  );
}

function Section(props: { id?: string; title: string; meta?: string; children: ReactNode }) {
  return (
    <section id={props.id} className="admin-section">
      <div className="section-heading">
        <h2>{props.title}</h2>
        {props.meta && <span>{props.meta}</span>}
      </div>
      {props.children}
    </section>
  );
}

function DataPanel(props: { title: string; children: ReactNode }) {
  return (
    <div className="data-panel">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}

function BarList(props: { rows: { label: string; value: number; suffix?: string }[]; empty: string }) {
  const top = maxValue(props.rows.map((row) => row.value));
  if (props.rows.length === 0) return <div className="empty-row">{props.empty}</div>;

  return (
    <div className="bar-list">
      {props.rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span className="bar-label">{row.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(4, (row.value / top) * 100)}%` }} />
          </div>
          <span className="bar-value">{formatNumber(row.value)}{row.suffix ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

function APIPathList(props: { rows: APIPathCount[]; empty: string }) {
  const top = maxValue(props.rows.map((row) => row.count));
  if (props.rows.length === 0) return <div className="empty-row">{props.empty}</div>;

  return (
    <div className="api-path-list">
      {props.rows.map((row) => (
        <div className="api-path-row" key={`${row.method}:${row.path}`}>
          <div className="api-path-head">
            <span className={`method-badge method-${row.method.toLowerCase()}`}>{row.method}</span>
            <code>{row.path}</code>
            <strong>{formatNumber(row.count)}</strong>
          </div>
          <div className="api-path-track">
            <span style={{ width: `${Math.max(5, (row.count / top) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendBars(props: { rows: { date: string; value: number }[]; valueLabel: string }) {
  const top = maxValue(props.rows.map((row) => row.value));
  return (
    <div className="trend-bars" aria-label={props.valueLabel}>
      {props.rows.map((row) => (
        <div className="trend-item" key={row.date} title={`${row.date}: ${formatNumber(row.value)} ${props.valueLabel}`}>
          <div className="trend-column">
            <span style={{ height: `${row.value === 0 ? 2 : Math.max(8, (row.value / top) * 100)}%` }} />
          </div>
          <small>{formatDay(row.date)}</small>
        </div>
      ))}
    </div>
  );
}

function LoginPanel(props: { onLogin: () => Promise<void> }) {
  const serverUrl = useConfigStore((state) => state.serverUrl);
  const setServerUrl = useConfigStore((state) => state.setServerUrl);
  const [serverInput, setServerInput] = useState(serverUrl || ENV_API_URL);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const normalizedServer = serverInput.trim().replace(/\/+$/, '');
    if (!isEnvConfigured) {
      setServerUrl(normalizedServer);
    }

    try {
      if (normalizedServer) {
        const health = await fetch(`${normalizedServer}/api/v1/health`);
        if (!health.ok) throw new Error('server health check failed');
      }

      const response = await client.post('/api/v1/auth/login', { identifier, password });
      useConfigStore.getState().setJwtToken(response.data.token);
      await props.onLogin();
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请检查账号、密码或服务地址');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">CatHeadTab Admin</p>
          <h1>后台数据看板</h1>
        </div>

        {!isEnvConfigured && (
          <label>
            <span>后端地址</span>
            <input
              value={serverInput}
              onChange={(event) => setServerInput(event.target.value)}
              placeholder="留空使用当前站点，例如 https://api.example.com"
            />
          </label>
        )}

        <label>
          <span>账号</span>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="用户名或邮箱"
            required
            autoComplete="username"
          />
        </label>

        <label>
          <span>密码</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            autoComplete="current-password"
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}

function ForbiddenPanel(props: { onLogout: () => void }) {
  return (
    <main className="auth-shell">
      <div className="auth-panel">
        <p className="eyebrow">403</p>
        <h1>需要管理员权限</h1>
        <p className="muted">当前账号不是 admin 角色，后端已拒绝访问看板数据。</p>
        <button type="button" onClick={props.onLogout}>切换账号</button>
      </div>
    </main>
  );
}

function DashboardContent(props: { dashboard: AdminDashboard; profile: UserProfile | null; loading: boolean; onRefresh: () => void; onLogout: () => void }) {
  const dashboard = props.dashboard;
  const roleRows = (dashboard.users.by_role ?? []).map((row) => ({ label: roleLabel(row.name), value: row.count }));
  const domainRows = (dashboard.bookmarks.top_domains ?? []).map((row) => ({ label: row.domain, value: row.count }));
  const categoryRows = (dashboard.presets.top_categories ?? []).map((row) => ({ label: row.category, value: row.count }));
  const oauthRows = (dashboard.auth.oauth_providers ?? []).map((row) => ({ label: row.name, value: row.count }));
  const cacheRows = (dashboard.wallpaper_cache.breakdown ?? []).map((row) => ({
    label: `${row.provider} / ${row.sorting}`,
    value: row.count,
  }));
  const tableRows = dashboard.table_sizes ?? [];
  const topAIUsers = dashboard.ai_usage.top_users ?? [];
  const apiStatusRows = (dashboard.api_access.status_breakdown ?? []).map((row) => ({
    label: statusGroupLabel(row.name),
    value: row.count,
  }));

  const mainTiles = useMemo(() => {
    const verifiedRate = dashboard.users.total > 0 ? `${formatDecimal((dashboard.users.verified / dashboard.users.total) * 100, 1)}% 已验证` : '暂无用户';
    return [
      { label: '注册用户', value: formatNumber(dashboard.users.total), detail: `${verifiedRate}，30 天新增 ${formatNumber(dashboard.users.registered_30d)}`, tone: 'green' as const },
      { label: '云端书签', value: formatNumber(dashboard.bookmarks.total), detail: `${formatNumber(dashboard.bookmarks.links)} 链接 / ${formatNumber(dashboard.bookmarks.folders)} 文件夹`, tone: 'blue' as const },
      { label: '桌面布局', value: formatNumber(dashboard.layouts.total), detail: `${formatNumber(dashboard.layouts.users)} 个用户，平均 ${formatDecimal(dashboard.layouts.avg_items)} 项`, tone: 'amber' as const },
      { label: '背景图存储', value: formatBytes(dashboard.backgrounds.total_bytes), detail: `${formatNumber(dashboard.backgrounds.total)} 张，平均 ${formatBytes(dashboard.backgrounds.avg_bytes)}`, tone: 'cyan' as const },
      { label: 'AI Token', value: formatNumber(dashboard.ai_usage.tokens_30d), detail: `今日 ${formatNumber(dashboard.ai_usage.tokens_today)}，30 天用户 ${formatNumber(dashboard.ai_usage.users_30d)}`, tone: 'violet' as const },
      { label: 'API 请求', value: formatNumber(dashboard.api_access.requests_30d), detail: `今日 ${formatNumber(dashboard.api_access.requests_today)}，30 天错误 ${formatNumber(dashboard.api_access.error_requests_30d)}`, tone: 'blue' as const },
      { label: '壁纸缓存', value: formatNumber(dashboard.wallpaper_cache.total), detail: `${formatNumber(dashboard.wallpaper_cache.fresh)} 有效 / ${formatNumber(dashboard.wallpaper_cache.expired)} 过期`, tone: 'rose' as const },
    ];
  }, [dashboard]);

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">CatHeadTab</p>
          <h1>后台看板</h1>
        </div>
        <nav>
          <a href="#overview">总览</a>
          <a href="#users">用户</a>
          <a href="#content">数据内容</a>
          <a href="#api">API 访问</a>
          <a href="#ai">AI 用量</a>
          <a href="#storage">存储</a>
        </nav>
        <div className="sidebar-footer">
          <span>{props.profile?.username || 'Admin'}</span>
          <small>{props.profile?.email || props.profile?.role || 'admin'}</small>
          <button type="button" onClick={props.onLogout}>退出</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Generated {formatDateTime(dashboard.generated_at)}</p>
            <h1>数据库运营总览</h1>
          </div>
          <button type="button" onClick={props.onRefresh} disabled={props.loading}>
            {props.loading ? '刷新中...' : '刷新'}
          </button>
        </header>

        <section id="overview" className="stat-grid">
          {mainTiles.map((tile) => (
            <StatTile key={tile.label} {...tile} />
          ))}
        </section>

        <Section id="users" title="用户增长" meta={`今日新增 ${formatNumber(dashboard.users.registered_today)}，7 天新增 ${formatNumber(dashboard.users.registered_7d)}`}>
          <div className="two-column">
            <TrendBars rows={(dashboard.users.daily_new_users ?? []).map((row) => ({ date: row.date, value: row.count }))} valueLabel="新用户" />
            <BarList rows={roleRows} empty="暂无角色数据" />
          </div>
        </Section>

        <Section id="content" title="内容与同步" meta={`布局最后更新 ${formatDateTime(dashboard.layouts.last_updated)}`}>
          <div className="metric-grid">
            <div className="metric-line"><span>书签用户</span><strong>{formatNumber(dashboard.bookmarks.users)}</strong></div>
            <div className="metric-line"><span>书签 7 天更新</span><strong>{formatNumber(dashboard.bookmarks.updated_7d)}</strong></div>
            <div className="metric-line"><span>布局 30 天更新</span><strong>{formatNumber(dashboard.layouts.updated_30d)}</strong></div>
            <div className="metric-line"><span>预置分类</span><strong>{formatNumber(dashboard.presets.categories)}</strong></div>
            <div className="metric-line"><span>预置站点</span><strong>{formatNumber(dashboard.presets.sites)}</strong></div>
            <div className="metric-line"><span>背景图 30 天更新</span><strong>{formatNumber(dashboard.backgrounds.updated_30d)}</strong></div>
          </div>
          <div className="two-column">
            <BarList rows={domainRows} empty="暂无书签域名数据" />
            <BarList rows={categoryRows} empty="暂无预置分类数据" />
          </div>
        </Section>

        <Section id="api" title="API 访问" meta={`累计 ${formatNumber(dashboard.api_access.total_requests)} 次，已记录 ${formatNumber(dashboard.api_access.unique_paths)} 个接口`}>
          <div className="metric-grid">
            <div className="metric-line"><span>今日请求</span><strong>{formatNumber(dashboard.api_access.requests_today)}</strong></div>
            <div className="metric-line"><span>7 天请求</span><strong>{formatNumber(dashboard.api_access.requests_7d)}</strong></div>
            <div className="metric-line"><span>30 天请求</span><strong>{formatNumber(dashboard.api_access.requests_30d)}</strong></div>
            <div className="metric-line"><span>30 天错误</span><strong>{formatNumber(dashboard.api_access.error_requests_30d)}</strong></div>
            <div className="metric-line"><span>接口数量</span><strong>{formatNumber(dashboard.api_access.unique_paths)}</strong></div>
          </div>
          <TrendBars rows={(dashboard.api_access.daily_requests ?? []).map((row) => ({ date: row.date, value: row.count }))} valueLabel="requests" />
          <div className="api-breakdown-grid section-stack">
            <DataPanel title="热门接口">
              <APIPathList rows={dashboard.api_access.top_paths ?? []} empty="暂无 API 访问数据" />
            </DataPanel>
            <DataPanel title="状态码分布">
              <BarList rows={apiStatusRows} empty="暂无状态码数据" />
            </DataPanel>
          </div>
        </Section>

        <Section id="ai" title="AI 用量" meta={`${formatNumber(dashboard.ai_usage.total_requests)} 次请求，累计 ${formatNumber(dashboard.ai_usage.total_tokens)} tokens`}>
          <TrendBars rows={(dashboard.ai_usage.daily_usage ?? []).map((row) => ({ date: row.date, value: row.total_tokens }))} valueLabel="tokens" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>30 天请求</th>
                  <th>30 天 Tokens</th>
                </tr>
              </thead>
              <tbody>
                {topAIUsers.length === 0 ? (
                  <tr><td colSpan={3}>暂无 AI 用量数据</td></tr>
                ) : topAIUsers.map((row) => (
                  <tr key={row.user_id}>
                    <td>{row.display_name}</td>
                    <td>{formatNumber(row.request_count)}</td>
                    <td>{formatNumber(row.total_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="认证与缓存" meta={`OAuth ${formatNumber(oauthRows.reduce((sum, row) => sum + row.value, 0))} 条绑定`}>
          <div className="metric-grid">
            <div className="metric-line"><span>邮箱验证待处理</span><strong>{formatNumber(dashboard.auth.email_verification_pending)}</strong></div>
            <div className="metric-line"><span>邮箱验证已过期</span><strong>{formatNumber(dashboard.auth.email_verification_expired)}</strong></div>
            <div className="metric-line"><span>密码重置待处理</span><strong>{formatNumber(dashboard.auth.password_reset_pending)}</strong></div>
            <div className="metric-line"><span>密码重置已使用</span><strong>{formatNumber(dashboard.auth.password_reset_used)}</strong></div>
          </div>
          <div className="two-column">
            <BarList rows={oauthRows} empty="暂无 OAuth 数据" />
            <BarList rows={cacheRows} empty="暂无壁纸缓存数据" />
          </div>
        </Section>

        <Section id="storage" title="数据库表体积" meta={`壁纸缓存最后写入 ${formatDateTime(dashboard.wallpaper_cache.last_created)}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>表名</th>
                  <th>体积</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr><td colSpan={2}>暂无表体积数据</td></tr>
                ) : tableRows.map((row) => (
                  <tr key={row.table_name}>
                    <td>{row.table_name}</td>
                    <td>{formatBytes(row.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </main>
    </div>
  );
}

export function AdminDashboardApp() {
  const hydrated = useConfigHydrated();
  const logout = useConfigStore((state) => state.logout);
  const setUserProfile = useConfigStore((state) => state.setUserProfile);
  const [state, setState] = useState<LoadState>('booting');
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    const token = useConfigStore.getState().jwtToken;
    if (!token) {
      setState('login');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const profileResponse = await client.get<UserProfile>('/api/v1/user/profile');
      const nextProfile = profileResponse.data;
      setProfile(nextProfile);
      setUserProfile(nextProfile);

      if (nextProfile.role !== 'admin') {
        setState('forbidden');
        setDashboard(null);
        return;
      }

      const dashboardResponse = await client.get<AdminDashboard>('/api/v1/admin/dashboard');
      setDashboard(dashboardResponse.data);
      setState('ready');
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout();
        setState('login');
      } else if (err.response?.status === 403) {
        setState('forbidden');
      } else {
        setError(err.response?.data?.error || '看板数据加载失败');
        setState('error');
      }
    } finally {
      setLoading(false);
    }
  }, [logout, setUserProfile]);

  useEffect(() => {
    if (hydrated) {
      void loadDashboard();
    }
  }, [hydrated, loadDashboard]);

  const handleLogout = () => {
    logout();
    setUserProfile(null);
    setProfile(null);
    setDashboard(null);
    setState('login');
  };

  if (!hydrated || state === 'booting') {
    return <main className="auth-shell"><div className="loader" /></main>;
  }

  if (state === 'login') {
    return <LoginPanel onLogin={loadDashboard} />;
  }

  if (state === 'forbidden') {
    return <ForbiddenPanel onLogout={handleLogout} />;
  }

  if (state === 'error' || !dashboard) {
    return (
      <main className="auth-shell">
        <div className="auth-panel">
          <p className="eyebrow">Error</p>
          <h1>加载失败</h1>
          <p className="muted">{error || '看板数据加载失败'}</p>
          <button type="button" onClick={() => void loadDashboard()}>重试</button>
        </div>
      </main>
    );
  }

  return (
    <DashboardContent
      dashboard={dashboard}
      profile={profile}
      loading={loading}
      onRefresh={() => void loadDashboard()}
      onLogout={handleLogout}
    />
  );
}
