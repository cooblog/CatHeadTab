import { useEffect, useState, useCallback, useRef, useSyncExternalStore, lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useConfigStore } from './store/configStore'
import { useLayoutStore, DesktopItem } from './store/layoutStore'
import client from './api/client'
import { Desktop } from './pages/Desktop'
import { loadImageBlob } from './utils/imageStore'
import { LockScreen } from './components/LockScreen'
import { SyncConflictModal, SyncStrategy } from './components/SyncConflictModal'
import { useIdleTimer } from './hooks/useIdleTimer'

// Lazy-loaded routes (not needed on first render)
const OAuthCallback = lazy(() => import('./pages/OAuthCallback').then(m => ({ default: m.OAuthCallback })));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail').then(m => ({ default: m.VerifyEmail })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));

// Wait for both Zustand stores to finish hydrating from async chrome.storage
// before rendering anything. This prevents the race condition where jwtToken is
// still null (default) when the profile-check useEffect fires.
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

function App() {
  const { backgroundImage, jwtToken, serverUrl, logout, setUserProfile, isLocked, setLocked, lockIdleTimeout, setLastSyncResolvedAt } = useConfigStore();
  const { pullLayoutFromCloud, uploadLayoutToCloud, mergeLayoutWithCloud } = useLayoutStore();
  const hydrated = useStoreHydrated();
  const [syncing, setSyncing] = useState(false);
  const [resolvedBg, setResolvedBg] = useState('');

  // Sync conflict modal state
  const [showSyncConflict, setShowSyncConflict] = useState(false);
  const [localItemCount, setLocalItemCount] = useState(0);
  const [cloudItemCount, setCloudItemCount] = useState(0);

  // Track which token has already been synced so we don't re-prompt on every render.
  // The ref stores the jwtToken value for which we've already completed (or skipped) the sync flow.
  const syncedTokenRef = useRef<string | null>(null);

  // Lock screen on idle — disabled while already locked or when set to "never" (0)
  const handleIdle = useCallback(() => {
    setLocked(true);
  }, [setLocked]);
  useIdleTimer(handleIdle, lockIdleTimeout, !isLocked && lockIdleTimeout > 0);

  const handleUnlock = useCallback(() => {
    setLocked(false);
  }, [setLocked]);

  // When locked, inject a global <style> and continuously clear any existing
  // selection so native browser highlights cannot remain visible.
  useEffect(() => {
    if (!isLocked) return;

    const clearSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) selection.removeAllRanges();
    };

    const style = document.createElement('style');
    style.setAttribute('data-lockscreen', 'true');
    style.textContent = `
      * {
        -webkit-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
      }
      *::selection { background: transparent !important; color: inherit !important; }
      *::-moz-selection { background: transparent !important; color: inherit !important; }
    `;

    clearSelection();
    document.addEventListener('selectionchange', clearSelection, true);
    window.addEventListener('mouseup', clearSelection, true);
    window.addEventListener('dragend', clearSelection, true);
    document.head.appendChild(style);

    return () => {
      document.removeEventListener('selectionchange', clearSelection, true);
      window.removeEventListener('mouseup', clearSelection, true);
      window.removeEventListener('dragend', clearSelection, true);
      style.remove();
    };
  }, [isLocked]);

  // Resolve background image (idb:// → Object URL, cos:// → backend proxy, otherwise use as-is)
  useEffect(() => {
    if (backgroundImage.startsWith('idb://')) {
      loadImageBlob('bg-custom').then(objUrl => {
        setResolvedBg(objUrl || '');
      });
    } else if (backgroundImage.startsWith('cos://')) {
      // cos://objectKey → resolve via backend proxy that generates a fresh pre-signed URL
      const cosKey = backgroundImage.slice('cos://'.length);
      const srvUrl = useConfigStore.getState().getEffectiveServerUrl();
      if (srvUrl) {
        const base = srvUrl.endsWith('/') ? srvUrl.slice(0, -1) : srvUrl;
        setResolvedBg(`${base}/api/v1/wallpapers/cos/image?key=${encodeURIComponent(cosKey)}`);
      } else {
        setResolvedBg('');
      }
    } else {
      setResolvedBg(backgroundImage);
    }
  }, [backgroundImage]);

  // Helper: count all items (including folder children) in a layout
  const countItems = useCallback((pages: DesktopItem[][], dock: DesktopItem[]): number => {
    let count = 0;
    const countList = (items: DesktopItem[]) => {
      for (const item of items) {
        count++;
        if (item.children) countList(item.children);
      }
    };
    pages.forEach(p => countList(p));
    countList(dock);
    return count;
  }, []);

  // Handle sync strategy selected by user
  const handleSyncStrategy = useCallback(async (strategy: SyncStrategy) => {
    setSyncing(true);
    try {
      if (strategy === 'cloudOverwriteLocal') {
        await pullLayoutFromCloud();
      } else if (strategy === 'localOverwriteCloud') {
        await uploadLayoutToCloud();
      } else if (strategy === 'merge') {
        await mergeLayoutWithCloud();
      }
    } catch (err) {
      console.error('Sync strategy failed:', err);
    } finally {
      // 持久化"冲突已解决"时间戳 + 更新本地修改时间戳
      const now = Date.now();
      setLastSyncResolvedAt(now);
      useConfigStore.getState().setLastLocalModifiedAt(now);
      setSyncing(false);
      setShowSyncConflict(false);
    }
  }, [pullLayoutFromCloud, uploadLayoutToCloud, mergeLayoutWithCloud, setLastSyncResolvedAt]);

  // DEBUG: Log render values every time App renders (outside effect so always visible)
  console.log('[App] RENDER:', { hydrated, jwtToken: !!jwtToken, serverUrl: !!serverUrl, tokenVal: jwtToken?.slice(0, 10) });

  // Token freshness check + smart sync on page load
  // Only attempt when both serverUrl and jwtToken are available AND stores are hydrated
  useEffect(() => {
    console.log('[App] Effect RUN:', { hydrated, hasJwt: !!jwtToken, hasServerUrl: !!serverUrl });
    if (hydrated && jwtToken && serverUrl) {
      // Skip if we've already handled sync for this token
      if (syncedTokenRef.current === jwtToken) {
        console.log('[App] SKIP: token already synced');
        return;
      }
      syncedTokenRef.current = jwtToken;

      setSyncing(true);
      console.log('[App] Starting profile fetch...');
      client.get('/api/v1/user/profile')
        .then(async (res: any) => {
          console.log('[App] Profile success, setting userProfile, about to fetch ai/config');
          setUserProfile(res.data);

          // 拉取后端 AI 配置（公开端点，不需要登录但在这里拉取更方便）
          try {
            console.log('[App] Fetching ai/config...');
            const aiRes = await client.get('/api/v1/ai/config');
            console.log('[App] ai/config response:', aiRes.data);
            useConfigStore.getState().setServerAIConfig(aiRes.data);
            console.log('[App] serverAIConfig stored in zustand');
          } catch (err) {
            // AI config fetch failed — server AI not available
            console.warn('[App] ai/config fetch FAILED:', err);
            useConfigStore.getState().setServerAIConfig(null);
          }
          console.log('[App] About to fetch layout...');

          // Fetch cloud layout to compare with local
          const localLayout = useLayoutStore.getState().layout;
          const localCount = countItems(localLayout.pages, localLayout.dock);

          let cloudCount = 0;
          let cloudData: any = null;
          let cloudResData: any = null;
          try {
            const cloudRes = await client.get('/api/v1/layout');
            cloudResData = cloudRes.data;
            cloudData = cloudRes.data.layout;
            if (cloudData && cloudData.pages) {
              const cloudDock = Array.isArray(cloudData.dock) ? cloudData.dock : [];
              cloudCount = countItems(cloudData.pages, cloudDock);
            }
          } catch {
            // Cloud layout fetch failed — treat as empty
          }

          // Decision logic based on timestamps ("last-write-wins"):
          // 1. Both empty or cloud empty → upload local to cloud
          // 2. Local empty/default, cloud has data → pull from cloud
          // 3. Both have data → compare updated_at timestamps, newer side wins
          //    - If item IDs differ significantly → show conflict modal
          const localHasContent = localCount > 2; // More than just the default dock apps
          const cloudHasContent = cloudCount > 0;

          if (!cloudHasContent) {
            // Cloud is empty — push local to cloud silently
            await uploadLayoutToCloud();
            setSyncing(false);
          } else if (!localHasContent) {
            // Local is basically empty/default, cloud has data — pull silently
            await pullLayoutFromCloud();
            setSyncing(false);
          } else {
            // 两端都有数据 — 基于时间戳决定谁覆盖谁

            // 1. 获取云端时间戳
            //    layout updated_at 来自后端响应顶层
            //    preferences _updatedAt 嵌入在 preferences JSONB 中
            const cloudLayoutUpdatedAt = cloudResData?.updated_at
              ? new Date(cloudResData.updated_at).getTime()
              : 0;

            let cloudPrefsUpdatedAt = 0;
            try {
              const prefsRes = await client.get('/api/v1/user/preferences');
              const prefsUpdatedStr = prefsRes.data.preferences?._updatedAt;
              if (prefsUpdatedStr) {
                cloudPrefsUpdatedAt = new Date(prefsUpdatedStr).getTime();
              }
            } catch {
              console.warn('Failed to fetch cloud preferences');
            }

            // 云端最新修改时间 = layout 和 preferences 中较新的那个
            const cloudLatest = Math.max(cloudLayoutUpdatedAt, cloudPrefsUpdatedAt);
            const localLatest = useConfigStore.getState().lastLocalModifiedAt;

            // 2. 比较 item ID 集合判断布局结构是否一致
            const localIds = new Set<string>();
            const collectLocalIds = (items: DesktopItem[]) => {
              for (const item of items) {
                localIds.add(item.id);
                if (item.children) collectLocalIds(item.children);
              }
            };
            localLayout.pages.forEach(p => collectLocalIds(p));
            collectLocalIds(localLayout.dock);

            const cloudIds = new Set<string>();
            if (cloudData && cloudData.pages) {
              const collectCloudIds = (items: DesktopItem[]) => {
                for (const item of items) {
                  cloudIds.add(item.id);
                  if (item.children) collectCloudIds(item.children);
                }
              };
              (cloudData.pages as DesktopItem[][]).forEach(p => collectCloudIds(p));
              const cloudDock = Array.isArray(cloudData.dock) ? cloudData.dock : [];
              collectCloudIds(cloudDock);
            }

            const idsMatch = localIds.size === cloudIds.size && [...localIds].every(id => cloudIds.has(id));

            // 3. 决策
            console.log('[Sync] idsMatch:', idsMatch, '| cloudLatest:', cloudLatest, '| localLatest:', localLatest);

            if (idsMatch) {
              // 布局结构一致 — 按时间戳决定方向
              // 允许 5 秒的误差（网络延迟 + 时钟偏移）
              const THRESHOLD_MS = 5000;

              if (cloudLatest > localLatest + THRESHOLD_MS) {
                // 云端更新 — 拉取云端数据（布局 + 偏好 + 壁纸）
                console.log('[Sync] Cloud is newer, pulling from cloud');
                await pullLayoutFromCloud();
                // 更新本地时间戳以与云端对齐，防止下次刷新误判
                useConfigStore.getState().setLastLocalModifiedAt(cloudLatest);
              } else if (localLatest > cloudLatest + THRESHOLD_MS) {
                // 本地更新 — 推送到云端
                console.log('[Sync] Local is newer, uploading to cloud');
                await uploadLayoutToCloud();
              } else {
                // 时间戳接近 — 认为一致，跳过
                console.log('[Sync] Local and cloud are in sync, skipping');
              }
              setSyncing(false);
            } else {
              // 布局结构不同 — 始终弹出冲突对话框让用户选择
              // （即使在冷却期内也弹窗，因为 ID 不同意味着两端数据差异较大，不能自动决策）
              console.log('[Sync] IDs differ, showing conflict modal');
              setLocalItemCount(localCount);
              setCloudItemCount(cloudCount);
              setSyncing(false);
              setShowSyncConflict(true);
            }
          }
        })
        .catch((err: any) => {
          // Only clear token on explicit 401 Unauthorized, NOT on network errors
          if (err.response && err.response.status === 401) {
            logout();
          } else {
            // Network error, timeout, server down — keep the token intact
            console.warn('Profile fetch failed (network/server error), keeping token:', err.message);
          }
          setSyncing(false);
        });
    } else if (hydrated) {
      // Stores are hydrated but no token/serverUrl — user is genuinely not logged in
      setUserProfile(null);
      setSyncing(false);
      syncedTokenRef.current = null;
    }
  }, [hydrated, jwtToken, serverUrl, logout, setUserProfile, pullLayoutFromCloud, uploadLayoutToCloud, countItems]);

  if (!hydrated) return null; // Wait for chrome.storage async hydration

  return (
    <div 
      className="w-full h-screen overflow-hidden text-white flex flex-col bg-cover bg-center transition-[background-image] duration-700"
      style={{ 
        backgroundImage: resolvedBg ? `url("${resolvedBg}")` : undefined 
      }}
    >
      {/* Lock Screen Overlay */}
      {isLocked && <LockScreen onUnlock={handleUnlock} backgroundUrl={resolvedBg} />}

      {/* Sync Conflict Modal */}
      {showSyncConflict && (
        <SyncConflictModal
          onSelect={handleSyncStrategy}
          localItemCount={localItemCount}
          cloudItemCount={cloudItemCount}
        />
      )}

      {/* Cloud Sync Indicator */}
      {syncing && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full shadow-lg animate-pulse">
          <svg className="animate-spin w-4 h-4 text-white/80" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs text-white/80 font-medium">Syncing...</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full h-full relative z-10 pt-10">
        <Suspense fallback={null}>
          <Routes>
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<Desktop />} />
          </Routes>
        </Suspense>
      </main>
      
    </div>
  )
}

export default App
