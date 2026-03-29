import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useTranslation } from '../i18n/useTranslation';

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'form' | 'loading' | 'success' | 'error'>('form');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Support both BrowserRouter (?token=xxx) and HashRouter (#/...?token=xxx)
  const searchStr = window.location.search || window.location.hash.split('?')[1] || '';
  const params = new URLSearchParams(searchStr);
  const token = params.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError(t('auth.invalidResetToken'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setStatus('loading');
    try {
      await client.post('/api/v1/auth/reset-password', { token, new_password: newPassword });
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setError(err.response?.data?.error || t('auth.resetFailed'));
    }
  };

  const headerTitle = status === 'success' 
    ? t('auth.passwordResetSuccess')
    : t('auth.resetPassword');

  return (
    <div className="w-full h-screen flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-black/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] overflow-hidden">
        {/* Window Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button onClick={() => navigate('/')} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
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
            <span className="text-[13px] font-semibold text-white/70">{headerTitle}</span>
          </div>
          <div className="flex items-center w-auto md:w-20 justify-end">
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {status === 'success' ? (
            <div className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <svg className="w-20 h-20" viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="40" r="36" stroke="#72d565" strokeWidth="3" fill="none" />
                  <path d="M24 42 L35 53 L56 28" stroke="#72d565" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-white/40 text-[15px] mb-6">{t('auth.passwordResetSuccess')}</p>
              <button 
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl bg-[#72d565]/10 hover:bg-[#72d565]/20 border border-[#72d565]/25 hover:border-[#72d565]/40 text-[#72d565] font-medium text-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(114,213,101,0.12)]"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8H4M4 8L7 5M4 8L7 11" />
                </svg>
                {t('auth.backToLogin')}
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white/90 mb-2 text-center">{t('auth.resetPassword')}</h2>
              <p className="text-white/40 text-[13px] mb-6 text-center">{t('auth.resetPasswordDesc')}</p>

              {error && <div className="mb-4 text-red-400 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <input 
                  type="password" 
                  placeholder={t('auth.newPassword')} 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-white/[0.06] border border-white/[0.08] hover:border-white/15 rounded-xl px-4 py-3 text-[15px] text-white/90 focus:outline-none focus:border-[#4a9eff]/50 transition-all placeholder-white/30"
                />
                <input 
                  type="password" 
                  placeholder={t('auth.confirmPassword')} 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-white/[0.06] border border-white/[0.08] hover:border-white/15 rounded-xl px-4 py-3 text-[15px] text-white/90 focus:outline-none focus:border-[#4a9eff]/50 transition-all placeholder-white/30"
                />
                <button 
                  type="submit" 
                  disabled={status === 'loading'}
                  className="w-full py-3 rounded-xl bg-[#4a9eff]/80 hover:bg-[#4a9eff] text-white font-bold transition-colors shadow-sm disabled:opacity-50"
                >
                  {status === 'loading' ? t('auth.processing') : t('auth.resetPassword')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
