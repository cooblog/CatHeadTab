import { useEffect } from 'react';

// OAuthCallback handles the redirect from GitHub/Google OAuth.
// It reads the `code` and `state` from the URL query and sends them
// back to the opener window via postMessage, then closes itself.
export function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state'); // 'github' or 'google'

    if (code && state && window.opener) {
      window.opener.postMessage({
        type: 'oauth_callback',
        code,
        provider: state,
      }, '*');
    }

    // Close this popup after a short delay
    setTimeout(() => window.close(), 500);
  }, []);

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[#1c1c1e] text-white">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4" />
        <p className="text-white/60 text-sm">Authenticating...</p>
      </div>
    </div>
  );
}
