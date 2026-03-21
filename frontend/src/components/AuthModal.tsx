import React, { useState } from 'react';
import { useConfigStore } from '../store/configStore';
import client from '../api/client';
import { useTranslation } from '../i18n/useTranslation';

export const AuthModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { setJwtToken } = useConfigStore();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await client.post('/api/v1/auth/login', { identifier, password });
        setJwtToken(res.data.token);
        onClose();
      } else {
        const res = await client.post('/api/v1/auth/register', { email, username, password });
        setJwtToken(res.data.token);
        onClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed. Please check your credentials and server URL.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: 'github' | 'google') => {
    alert(`This will redirect to the ${provider} OAuth flow.`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px] animate-fadeIn p-4" onClick={onClose}>
      <div 
        className="w-full max-w-sm bg-[#1c1c1e]/70 backdrop-blur-[80px] border border-white/[0.08] rounded-[2.5rem] shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-8 flex flex-col transform animate-scaleIn pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-6">
          <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full flex gap-1 border border-white/10">
            <button 
              type="button"
              className={`px-6 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all ${mode === 'login' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
              onClick={() => { setMode('login'); setError(''); }}
            >
              {t('auth.signIn')}
            </button>
            <button 
              type="button"
              className={`px-6 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all ${mode === 'register' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
              onClick={() => { setMode('register'); setError(''); }}
            >
              {t('auth.signUp')}
            </button>
          </div>
        </div>

        {error && <div className="mb-4 text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'login' ? (
            <div>
              <input 
                type="text" 
                placeholder={t('auth.usernameOrEmail')} 
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
              />
            </div>
          ) : (
            <>
              <div>
                <input 
                  type="email" 
                  placeholder={t('auth.email')} 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                />
              </div>
              <div>
                <input 
                  type="text" 
                  placeholder={t('auth.username')} 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                />
              </div>
            </>
          )}

          <div>
            <input 
              type="password" 
              placeholder={t('auth.password')} 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-colors shadow-lg disabled:opacity-50"
          >
            {loading ? t('auth.processing') : (mode === 'login' ? t('auth.continue') : t('auth.createAccount'))}
          </button>
        </form>

        <div className="relative flex items-center justify-center my-6">
          <div className="absolute inset-x-0 h-[1px] bg-white/10" />
          <span className="relative bg-[#1a1c1a] px-4 text-[11px] uppercase font-bold tracking-widest text-white/40">{t('auth.or')}</span>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            type="button" 
            onClick={() => handleOAuth('github')}
            className="w-full py-3 rounded-xl bg-black/50 hover:bg-black/70 border border-white/10 text-white font-medium transition-colors flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
            {t('auth.github')}
          </button>
          <button 
            type="button" 
            onClick={() => handleOAuth('google')}
            className="w-full py-3 rounded-xl bg-white text-black hover:bg-gray-100 border border-white/10 font-bold transition-colors flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            {t('auth.google')}
          </button>
        </div>
      </div>
    </div>
  );
};
