import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useTranslation } from '../i18n/useTranslation';

// Animated checkmark SVG (pure CSS animation, no images)
function SuccessIcon() {
  return (
    <div className="relative w-20 h-20 mx-auto mb-6">
      {/* Glow ring */}
      <div className="absolute inset-0 rounded-full bg-[#72d565]/20 animate-ping" style={{ animationDuration: '1.5s', animationIterationCount: '1' }} />
      <svg className="w-20 h-20" viewBox="0 0 80 80" fill="none">
        {/* Circle */}
        <circle
          cx="40" cy="40" r="36"
          stroke="#72d565" strokeWidth="3" fill="none"
          strokeDasharray="226" strokeDashoffset="226"
          strokeLinecap="round"
          style={{ animation: 'circle-draw 0.6s ease-out 0.2s forwards' }}
        />
        {/* Checkmark */}
        <path
          d="M24 42 L35 53 L56 28"
          stroke="#72d565" strokeWidth="3.5" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="50" strokeDashoffset="50"
          style={{ animation: 'check-draw 0.4s ease-out 0.7s forwards' }}
        />
      </svg>
    </div>
  );
}

// Animated error X SVG
function ErrorIcon() {
  return (
    <div className="relative w-20 h-20 mx-auto mb-6">
      <svg className="w-20 h-20" viewBox="0 0 80 80" fill="none">
        <circle
          cx="40" cy="40" r="36"
          stroke="#ef4444" strokeWidth="3" fill="none"
          strokeDasharray="226" strokeDashoffset="226"
          strokeLinecap="round"
          style={{ animation: 'circle-draw 0.6s ease-out 0.2s forwards' }}
        />
        <path
          d="M28 28 L52 52"
          stroke="#ef4444" strokeWidth="3.5" fill="none"
          strokeLinecap="round"
          strokeDasharray="34" strokeDashoffset="34"
          style={{ animation: 'check-draw 0.3s ease-out 0.7s forwards' }}
        />
        <path
          d="M52 28 L28 52"
          stroke="#ef4444" strokeWidth="3.5" fill="none"
          strokeLinecap="round"
          strokeDasharray="34" strokeDashoffset="34"
          style={{ animation: 'check-draw 0.3s ease-out 0.9s forwards' }}
        />
      </svg>
    </div>
  );
}

// macOS-style window header
function WindowHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
      <div className="flex items-center gap-2 w-auto md:w-20">
        <div className="hidden md:flex gap-2.5">
          <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
            <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
            <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
          </button>
          <button className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
            <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 flex justify-center">
        <span className="text-[13px] font-semibold text-white/70">{title}</span>
      </div>
      <div className="flex items-center w-auto md:w-20 justify-end">
        <div className="hidden md:block w-20" />
      </div>
    </div>
  );
}

// Inject keyframe animations
const animationStyles = `
@keyframes circle-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes check-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

export function VerifyEmail() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const verifiedRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate requests (React StrictMode calls useEffect twice in dev)
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    // Support both BrowserRouter (?token=xxx) and HashRouter (#/...?token=xxx)
    const searchStr = window.location.search || window.location.hash.split('?')[1] || '';
    const params = new URLSearchParams(searchStr);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage(t('auth.invalidVerificationToken'));
      return;
    }

    client.post('/api/v1/auth/verify-email', { token })
      .then(() => {
        setStatus('success');
        setMessage(t('auth.emailVerified'));
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || t('auth.verificationFailed'));
      });
  }, [t]);

  const headerTitle = status === 'success' 
    ? (t('auth.verificationSuccessTitle') || t('auth.emailVerified'))
    : status === 'error' 
    ? (t('auth.verificationFailedTitle') || t('auth.verificationFailed'))
    : t('auth.verifying');

  return (
    <>
      <style>{animationStyles}</style>
      <div className="w-full min-h-screen flex items-center justify-center p-4 overflow-hidden">
        <div
          className="relative max-w-[380px] w-full bg-black/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] overflow-hidden"
          style={{ animation: 'fade-up 0.5s ease-out both' }}
        >
          {/* Window Header */}
          <WindowHeader title={headerTitle} onClose={() => navigate('/')} />

          {/* Content */}
          <div className="p-10 text-center">
            {/* Loading state */}
            {status === 'loading' && (
              <div>
                <div className="relative w-16 h-16 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#4a9eff] animate-spin" />
                </div>
                <p className="text-white/40 text-sm tracking-wide">{t('auth.verifying') || 'Verifying...'}</p>
              </div>
            )}

            {/* Success state */}
            {status === 'success' && (
              <div>
                <SuccessIcon />
                <h2
                  className="text-xl font-semibold text-white/90 mb-2"
                  style={{ animation: 'fade-up 0.4s ease-out 0.5s both' }}
                >
                  {t('auth.verificationSuccessTitle') || '🎉 ' + t('auth.emailVerified')}
                </h2>
                <p
                  className="text-white/40 text-sm leading-relaxed mb-8"
                  style={{ animation: 'fade-up 0.4s ease-out 0.7s both' }}
                >
                  {message}
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl bg-[#72d565]/10 hover:bg-[#72d565]/20 border border-[#72d565]/25 hover:border-[#72d565]/40 text-[#72d565] font-medium text-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(114,213,101,0.12)]"
                  style={{ animation: 'fade-up 0.4s ease-out 0.9s both' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8H4M4 8L7 5M4 8L7 11" />
                  </svg>
                  {t('auth.backToHome')}
                </button>
              </div>
            )}

            {/* Error state */}
            {status === 'error' && (
              <div>
                <ErrorIcon />
                <h2
                  className="text-xl font-semibold text-white/90 mb-2"
                  style={{ animation: 'fade-up 0.4s ease-out 0.5s both' }}
                >
                  {t('auth.verificationFailedTitle') || t('auth.verificationFailed')}
                </h2>
                <p
                  className="text-white/40 text-sm leading-relaxed mb-8"
                  style={{ animation: 'fade-up 0.4s ease-out 0.7s both' }}
                >
                  {message}
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white/80 font-medium text-sm transition-all duration-300"
                  style={{ animation: 'fade-up 0.4s ease-out 0.9s both' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8H4M4 8L7 5M4 8L7 11" />
                  </svg>
                  {t('auth.backToHome')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
