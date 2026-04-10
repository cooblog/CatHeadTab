import React, { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';

interface ItToolsModalProps {
  onClose: () => void;
}

/** IT Tools modal — embeds https://it-tools.tech in a macOS-style window. */
export const ItToolsModal: React.FC<ItToolsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none ${isFullscreen ? 'p-0' : 'p-0 sm:p-6 md:p-12'}`}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Dimmed Background Overlay */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* App Window container — reuses SettingsModal style */}
      <div
        className={`bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden transition-all duration-300 select-none ${
          isFullscreen
            ? 'w-full h-full !rounded-none !border-0'
            : 'w-full h-full sm:w-auto sm:h-auto sm:w-full sm:max-w-[90vw] md:max-w-6xl sm:h-[80vh] md:h-[78vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Window Header — macOS traffic lights */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          {/* Left: Mac traffic lights on desktop */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button
                onClick={onClose}
                className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default"
              >
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button
                onClick={() => setIsFullscreen((f) => !f)}
                className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default"
              >
                {isFullscreen ? (
                  <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>
                ) : (
                  <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                )}
              </button>
            </div>
          </div>

          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">{t('widget.itTools')}</span>
          </div>

          {/* Right spacer / mobile close */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <button
              onClick={onClose}
              className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            {/* Open in new tab button */}
            <a
              href="https://it-tools.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 items-center justify-center text-white/40 hover:text-white/70 transition-colors ml-1"
              title={t('widget.itToolsOpenExternal')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
            <div className="hidden md:block w-8" />
          </div>
        </div>

        {/* Content Area — iframe */}
        <div className="flex-1 relative bg-white overflow-hidden">
          {/* Loading spinner */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
              <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin w-8 h-8 text-white/60" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-white/50 text-[13px]">{t('widget.itToolsLoading')}</span>
              </div>
            </div>
          )}
          <iframe
            src="https://it-tools.tech"
            className="w-full h-full border-0"
            title="IT Tools"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </div>
    </div>
  );
};
