import { useEffect, useState, useCallback, useSyncExternalStore, lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useConfigStore } from './store/configStore'
import { useLayoutStore } from './store/layoutStore'
import client from './api/client'
import { Desktop } from './pages/Desktop'
import { loadImageBlob } from './utils/imageStore'
import { LockScreen } from './components/LockScreen'
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
  const { backgroundImage, jwtToken, serverUrl, logout, setUserProfile, isLocked, setLocked, lockIdleTimeout } = useConfigStore();
  const { pullLayoutFromCloud } = useLayoutStore();
  const hydrated = useStoreHydrated();
  const [syncing, setSyncing] = useState(false);
  const [resolvedBg, setResolvedBg] = useState('');

  // Lock screen on idle — disabled while already locked
  const handleIdle = useCallback(() => {
    setLocked(true);
  }, [setLocked]);
  useIdleTimer(handleIdle, lockIdleTimeout, !isLocked);

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

  // Token freshness check + pull cloud data on page load
  // Only attempt when both serverUrl and jwtToken are available AND stores are hydrated
  useEffect(() => {
    if (hydrated && jwtToken && serverUrl) {
      setSyncing(true);
      client.get('/api/v1/user/profile')
        .then((res: any) => {
          setUserProfile(res.data);
          // Token is valid — pull cloud data to overwrite local
          return pullLayoutFromCloud();
        })
        .catch((err: any) => {
          // Only clear token on explicit 401 Unauthorized, NOT on network errors
          if (err.response && err.response.status === 401) {
            logout();
          } else {
            // Network error, timeout, server down — keep the token intact
            console.warn('Profile fetch failed (network/server error), keeping token:', err.message);
          }
        })
        .finally(() => {
          setSyncing(false);
        });
    } else if (hydrated) {
      // Stores are hydrated but no token/serverUrl — user is genuinely not logged in
      setUserProfile(null);
      setSyncing(false);
    }
  }, [hydrated, jwtToken, serverUrl, logout, setUserProfile, pullLayoutFromCloud]);

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
