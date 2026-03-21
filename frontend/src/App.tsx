import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useConfigStore } from './store/configStore'
import client from './api/client'
import { SetupWizard } from './components/SetupWizard'
import { Desktop } from './pages/Desktop'
import { loadImageBlob } from './utils/imageStore'

function App() {
  const { isConfigured, backgroundImage, jwtToken, logout, setUserProfile } = useConfigStore();
  const [mounted, setMounted] = useState(false);
  const [resolvedBg, setResolvedBg] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

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

  // Token freshness check
  useEffect(() => {
    if (mounted && jwtToken) {
      client.get('/api/v1/user/profile')
        .then((res: any) => setUserProfile(res.data))
        .catch(() => logout());
    } else {
      setUserProfile(null);
    }
  }, [mounted, jwtToken, logout, setUserProfile]);

  useEffect(() => {
    if (mounted) {
      if (!isConfigured() && location.pathname !== '/setup') {
        navigate('/setup');
      } else if (isConfigured() && location.pathname === '/setup') {
        navigate('/');
      }
    }
  }, [mounted, isConfigured, navigate, location]);

  if (!mounted) return null; // Prevent hydration flash

  return (
    <div 
      className="w-full h-screen overflow-hidden text-white flex flex-col bg-cover bg-center transition-all duration-700"
      style={{ 
        backgroundImage: resolvedBg ? `url("${resolvedBg}")` : undefined 
      }}
    >
      {/* Main Content Area */}
      <main className="flex-1 w-full h-full relative z-10 pt-10">
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/*" element={<Desktop />} />
        </Routes>
      </main>
      
    </div>
  )
}

export default App
