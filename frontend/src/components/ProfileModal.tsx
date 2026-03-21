import React, { useState } from 'react';
import { useConfigStore } from '../store/configStore';
import { useLayoutStore } from '../store/layoutStore';
import { useTranslation } from '../i18n/useTranslation';

export const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { userProfile, logout } = useConfigStore();
  const { uploadLayoutToCloud, pullLayoutFromCloud, mergeLayoutWithCloud } = useLayoutStore();
  const { t } = useTranslation();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleAction = async (actionName: string, actionFn: () => Promise<void>) => {
    if (loadingAction) return;
    
    if (actionName === 'Pull' && !window.confirm(t('profile.pullWarning'))) {
      return;
    }

    setLoadingAction(actionName);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await actionFn();
      setSuccessMsg(`${actionName} completed successfully!`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(`Failed to perform ${actionName}. ${err?.message || ''}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLogout = () => {
    if (window.confirm(t('profile.logoutWarning'))) {
      logout();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px] animate-fadeIn p-4" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-[#1c1c1e]/70 backdrop-blur-[80px] border border-white/[0.08] rounded-[2.5rem] shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-8 flex flex-col transform animate-scaleIn pointer-events-auto relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10 z-10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#72d565] to-[#24a148] flex items-center justify-center text-3xl font-bold text-black shadow-lg mb-4 ring-4 ring-[#72d565]/20">
            {userProfile?.username?.charAt(0).toUpperCase() || '?'}
          </div>
          <h2 className="text-2xl font-bold text-white">{userProfile?.username || 'User'}</h2>
          <p className="text-white/50 text-[14px] mt-1">{userProfile?.email || 'Connected Account'}</p>
        </div>

        {errorMsg && <div className="mb-4 text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</div>}
        {successMsg && <div className="mb-4 text-[#72d565] text-[13px] font-medium text-center bg-[#72d565]/10 p-3 rounded-xl border border-[#72d565]/20">{successMsg}</div>}

        <div className="space-y-3 mb-8">
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-white/40 ml-1 mb-2">{t('profile.cloudSync')}</h3>
          
          <button 
            onClick={() => handleAction('Upload', uploadLayoutToCloud)}
            disabled={!!loadingAction}
            className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div>
                <h4 className="font-bold text-white text-[15px]">{t('profile.upload')}</h4>
                <p className="text-[12px] text-white/50 mt-0.5">{t('profile.uploadDesc')}</p>
              </div>
              {loadingAction === 'Upload' && <div className="ml-auto animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />}
            </div>
          </button>

          <button 
            onClick={() => handleAction('Merge', mergeLayoutWithCloud)}
            disabled={!!loadingAction}
            className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              </div>
              <div>
                <h4 className="font-bold text-white text-[15px]">{t('profile.merge')}</h4>
                <p className="text-[12px] text-white/50 mt-0.5">{t('profile.mergeDesc')}</p>
              </div>
              {loadingAction === 'Merge' && <div className="ml-auto animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />}
            </div>
          </button>

          <button 
            onClick={() => handleAction('Pull', pullLayoutFromCloud)}
            disabled={!!loadingAction}
            className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </div>
              <div>
                <h4 className="font-bold text-white text-[15px]">{t('profile.pull')}</h4>
                <p className="text-[12px] text-white/50 mt-0.5 text-orange-400/80">{t('profile.pullDesc')}</p>
              </div>
              {loadingAction === 'Pull' && <div className="ml-auto animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />}
            </div>
          </button>
        </div>

        <button 
          onClick={handleLogout}
          className="w-full py-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-bold transition-colors"
        >
          {t('profile.signOut')}
        </button>
      </div>
    </div>
  );
};
