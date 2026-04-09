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

  // Resolve background image (idb:// → Object URL, otherwise use as-is)
  useEffect(() => {
    if (backgroundImage.startsWith('idb://')) {
      loadImageBlob('bg-custom').then(objUrl => {
        setResolvedBg(objUrl || '');
      });
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
      // 持久化"冲突已解决"时间戳，刷新后不再重复弹窗
      setLastSyncResolvedAt(Date.now());
      setSyncing(false);
      setShowSyncConflict(false);
    }
  }, [pullLayoutFromCloud, uploadLayoutToCloud, mergeLayoutWithCloud, setLastSyncResolvedAt]);

  // Token freshness check + smart sync on page load
  // Only attempt when both serverUrl and jwtToken are available AND stores are hydrated
  useEffect(() => {
    if (hydrated && jwtToken && serverUrl) {
      // Skip if we've already handled sync for this token
      if (syncedTokenRef.current === jwtToken) return;
      syncedTokenRef.current = jwtToken;

      setSyncing(true);
      client.get('/api/v1/user/profile')
        .then(async (res: any) => {
          setUserProfile(res.data);

          // Fetch cloud layout to compare with local
          const localLayout = useLayoutStore.getState().layout;
          const localCount = countItems(localLayout.pages, localLayout.dock);

          let cloudCount = 0;
          let cloudData: any = null;
          try {
            const cloudRes = await client.get('/api/v1/layout');
            cloudData = cloudRes.data.layout;
            if (cloudData && cloudData.pages) {
              const cloudDock = Array.isArray(cloudData.dock) ? cloudData.dock : [];
              cloudCount = countItems(cloudData.pages, cloudDock);
            }
          } catch {
            // Cloud layout fetch failed — treat as empty
          }

          // Decision logic:
          // 1. Both empty or cloud empty → upload local to cloud (no prompt needed)
          // 2. Local is default (untouched) and cloud has data → pull from cloud (no prompt needed)
          // 3. Both have data → compare content; if identical skip, otherwise check if recently resolved
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
            // 两端都有内容 — 先比较数据是否实质一致
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

            // 如果本地和云端包含完全相同的 item ID 集合，视为数据一致，静默跳过
            const idsMatch = localIds.size === cloudIds.size && [...localIds].every(id => cloudIds.has(id));

            if (idsMatch) {
              // 数据一致，无需弹窗，静默同步最新本地数据到云端
              await uploadLayoutToCloud();
              setSyncing(false);
            } else if (Date.now() - useConfigStore.getState().lastSyncResolvedAt < 30 * 1000) {
              // 用户在 30 秒内刚解决过冲突（可能刚刷新），静默用本地数据同步到云端
              await uploadLayoutToCloud();
              setSyncing(false);
            } else {
              // 数据确实不一致且不在冷却期，弹出冲突对话框
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
