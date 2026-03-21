import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useTranslation } from '../i18n/useTranslation';

export function VerifyEmail() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
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

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[#1c1c1e] text-white p-4">
      <div className="max-w-sm w-full bg-[#1c1c1e]/70 backdrop-blur-[80px] border border-white/[0.08] rounded-[2.5rem] shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-8 text-center">
        {status === 'loading' && (
          <div className="animate-spin w-10 h-10 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4" />
        )}
        {status === 'success' && (
          <div className="text-[#72d565] text-5xl mb-4">✓</div>
        )}
        {status === 'error' && (
          <div className="text-red-500 text-5xl mb-4">✕</div>
        )}
        <p className="text-white/80 text-[15px] mb-6">{message}</p>
        <button 
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-colors"
        >
          {t('auth.backToHome')}
        </button>
      </div>
    </div>
  );
}
