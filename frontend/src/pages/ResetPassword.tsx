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

  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
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

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[#1c1c1e] text-white p-4">
      <div className="max-w-sm w-full bg-[#1c1c1e]/70 backdrop-blur-[80px] border border-white/[0.08] rounded-[2.5rem] shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-8">
        {status === 'success' ? (
          <div className="text-center">
            <div className="text-[#72d565] text-5xl mb-4">✓</div>
            <p className="text-white/80 text-[15px] mb-6">{t('auth.passwordResetSuccess')}</p>
            <button 
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-colors"
            >
              {t('auth.backToLogin')}
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-white mb-2 text-center">{t('auth.resetPassword')}</h2>
            <p className="text-white/50 text-[13px] mb-6 text-center">{t('auth.resetPasswordDesc')}</p>

            {error && <div className="mb-4 text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input 
                type="password" 
                placeholder={t('auth.newPassword')} 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
              />
              <input 
                type="password" 
                placeholder={t('auth.confirmPassword')} 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
              />
              <button 
                type="submit" 
                disabled={status === 'loading'}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-colors shadow-lg disabled:opacity-50"
              >
                {status === 'loading' ? t('auth.processing') : t('auth.resetPassword')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
