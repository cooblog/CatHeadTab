import React, { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';

export type SyncStrategy = 'merge' | 'cloudOverwriteLocal' | 'localOverwriteCloud';

interface SyncConflictModalProps {
  onSelect: (strategy: SyncStrategy) => void;
  localItemCount: number;
  cloudItemCount: number;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  onSelect,
  localItemCount,
  cloudItemCount,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SyncStrategy | null>(null);

  const handleSelect = async (strategy: SyncStrategy) => {
    setSelected(strategy);
    setLoading(true);
    onSelect(strategy);
  };

  const strategies: {
    key: SyncStrategy;
    icon: React.ReactNode;
    colorClass: string;
    bgClass: string;
  }[] = [
    {
      key: 'merge',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
          <polyline points="7.5 19.79 7.5 14.6 3 12" />
          <polyline points="21 12 16.5 14.6 16.5 19.79" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
      colorClass: 'text-purple-400',
      bgClass: 'bg-purple-500/20',
    },
    {
      key: 'cloudOverwriteLocal',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
      colorClass: 'text-blue-400',
      bgClass: 'bg-blue-500/20',
    },
    {
      key: 'localOverwriteCloud',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      ),
      colorClass: 'text-orange-400',
      bgClass: 'bg-orange-500/20',
    },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none p-4 sm:p-12" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto transition-opacity animate-fadeIn" />

      {/* Modal */}
      <div
        className="w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center justify-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          <span className="text-[13px] font-semibold text-white/70">
            {t('sync.conflictTitle')}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 no-scrollbar">
          {/* Description */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p className="text-white/60 text-[13px] leading-relaxed">
              {t('sync.conflictDesc')}
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-3 mb-6">
            <div className="flex-1 rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-1">
                {t('sync.localData')}
              </div>
              <div className="text-xl font-bold text-white">
                {localItemCount}
              </div>
              <div className="text-[11px] text-white/40">{t('sync.items')}</div>
            </div>
            <div className="flex-1 rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-1">
                {t('sync.cloudData')}
              </div>
              <div className="text-xl font-bold text-white">
                {cloudItemCount}
              </div>
              <div className="text-[11px] text-white/40">{t('sync.items')}</div>
            </div>
          </div>

          {/* Strategy Buttons */}
          <div className="space-y-3">
            {strategies.map(({ key, icon, colorClass, bgClass }) => (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                disabled={loading}
                className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <div className="flex items-center gap-4 relative z-10">
                  <div className={`w-10 h-10 rounded-full ${bgClass} flex items-center justify-center ${colorClass} shrink-0`}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-[15px]">
                      {t(`sync.${key}`)}
                    </h4>
                    <p className="text-[12px] text-white/50 mt-0.5">
                      {t(`sync.${key}Desc`)}
                    </p>
                  </div>
                  {loading && selected === key && (
                    <div className="ml-auto animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
