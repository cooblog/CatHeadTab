import React, { useState } from 'react';
import { useConfigStore } from '../store/configStore';
import client from '../api/client';

export const SetupWizard: React.FC = () => {
  const { setServerUrl } = useConfigStore();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    let targetUrl = url.trim();
    if (!targetUrl) {
      targetUrl = 'http://localhost:8080';
      setUrl(targetUrl);
    }
    
    // Normalize URL
    const normalizedUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;

    setLoading(true);
    setError('');

    try {
      // Test connection to health endpoint
      await client.get(`${normalizedUrl}/api/v1/health`);
      // Connection successful, save to store
      setServerUrl(normalizedUrl);
    } catch (err: any) {
      console.error(err);
      setError('Failed to connect to server. Ensure URL is correct and server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* 玻璃卡片容器 */}
      <div className="glass-panel w-full max-w-md p-8 relative overflow-hidden">
        {/* 背景装饰光晕 */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        
        <div className="relative z-10 text-center space-y-6">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl glass-card flex items-center justify-center">
              <span className="text-4xl">🐱</span>
            </div>
          </div>
          
          <h1 className="text-3xl font-bold tracking-tight text-white/90">
            Welcome to CatHeadTab
          </h1>
          
          <p className="text-white/60 text-sm pb-4">
            Connect to the official cloud or your self-hosted instance to unlock all features.
          </p>

          <div className="space-y-4">
            <input
              type="url"
              placeholder="e.g., http://localhost:8080"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              className="glass-input text-center"
            />
            
            {error && (
              <p className="text-red-400 text-sm animate-pulse">{error}</p>
            )}

            <button
              onClick={handleConnect}
              disabled={loading}
              className="glass-button w-full py-3 flex justify-center items-center gap-2 mt-4"
            >
              {loading ? (
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                'Connect Server'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
