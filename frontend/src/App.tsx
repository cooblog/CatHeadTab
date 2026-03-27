import { useEffect, useState, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useConfigStore } from './store/configStore'
import { useLayoutStore } from './store/layoutStore'
import client from './api/client'
import { Desktop } from './pages/Desktop'
import { OAuthCallback } from './pages/OAuthCallback'
import { VerifyEmail } from './pages/VerifyEmail'
import { ResetPassword } from './pages/ResetPassword'
import { loadImageBlob } from './utils/imageStore'
import { LockScreen } from './components/LockScreen'
import { useIdleTimer } from './hooks/useIdleTimer'

function App() {
  const { backgroundImage, jwtToken, serverUrl, logout, setUserProfile, isLocked, setLocked, lockIdleTimeout } = useConfigStore();
  const { pullLayoutFromCloud } = useLayoutStore();
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => {
    // Wait for Zustand to hydrate from storage
    setMounted(true);
  }, []);

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
  // Only attempt when both serverUrl and jwtToken are available
  useEffect(() => {
    if (mounted && jwtToken && serverUrl) {
      setSyncing(true);
      client.get('/api/v1/user/profile')
        .then((res: any) => {
          setUserProfile(res.data);
          // Token is valid — pull cloud data to overwrite local
          return pullLayoutFromCloud();
        })
        .catch(() => {
          logout();
        })
        .finally(() => {
          setSyncing(false);
        });
    } else {
      setUserProfile(null);
      setSyncing(false);
    }
  }, [mounted, jwtToken, serverUrl, logout, setUserProfile, pullLayoutFromCloud]);

  if (!mounted) return null; // Prevent hydration flash

  return (
    <div 
      className="w-full h-screen overflow-hidden text-white flex flex-col bg-cover bg-center transition-all duration-700"
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
        <Routes>
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/*" element={<Desktop />} />
        </Routes>
      </main>
      
    </div>
  )
}

export default App
