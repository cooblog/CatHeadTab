import React, { useState, useEffect } from 'react';
import { useConfigStore } from '../store/configStore';
import { useTranslation } from '../i18n/useTranslation';
import { saveImageBlob, loadImageBlob, compressImageToWebP, getRawBlob } from '../utils/imageStore';
import client from '../api/client';

type Tab = 'appearance' | 'language' | 'system';

const IDB_BG_KEY = 'bg-custom';
// Max original file size allowed before compression (20 MB)
const MAX_ORIGINAL_SIZE = 20 * 1024 * 1024;

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { serverUrl, setServerUrl, backgroundImage, setBackgroundImage, language, setLanguage } = useConfigStore();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<Tab>('appearance');
  const [url, setUrl] = useState(serverUrl);
  const [bg, setBg] = useState(backgroundImage);
  const [bgPreview, setBgPreview] = useState(''); // Object URL for local file preview
  const [isCompressing, setIsCompressing] = useState(false);

  // Resolve idb:// reference to an Object URL on mount
  useEffect(() => {
    if (backgroundImage.startsWith('idb://')) {
      loadImageBlob(IDB_BG_KEY).then(objUrl => {
        if (objUrl) setBgPreview(objUrl);
      });
    }
  }, [backgroundImage]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject files that are absurdly large
    if (file.size > MAX_ORIGINAL_SIZE) {
      alert(t('settings.bgTooLarge'));
      return;
    }

    setIsCompressing(true);
    try {
      // Compress to WebP for efficient storage & cloud sync
      const compressed = await compressImageToWebP(file);
      await saveImageBlob(IDB_BG_KEY, compressed);
      const objUrl = URL.createObjectURL(compressed);
      setBgPreview(objUrl);
      setBg(`idb://${IDB_BG_KEY}?t=${Date.now()}`);
    } catch (err) {
      console.error('Failed to compress image', err);
      // Fallback: save original
      await saveImageBlob(IDB_BG_KEY, file);
      const objUrl = URL.createObjectURL(file);
      setBgPreview(objUrl);
      setBg(`idb://${IDB_BG_KEY}?t=${Date.now()}`);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSave = async () => {
    setServerUrl(url.trim());
    const newBg = bg.trim();
    setBackgroundImage(newBg);

    // If user is logged in, actively sync background to cloud
    const { jwtToken } = useConfigStore.getState();
    if (jwtToken) {
      try {
        if (newBg.startsWith('idb://')) {
          // Upload local image binary to cloud
          const rawBlob = await getRawBlob('bg-custom');
          if (rawBlob) {
            const webpBlob = await compressImageToWebP(rawBlob);
            const formData = new FormData();
            formData.append('image', webpBlob, 'background.webp');
            await client.post('/api/v1/user/background', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          }
          await client.put('/api/v1/user/preferences', { backgroundImage: 'cloud://background' });
        } else {
          // URL wallpaper or empty — just sync the string
          await client.put('/api/v1/user/preferences', { backgroundImage: newBg });
        }
      } catch (err) {
        console.error('Failed to sync background to cloud', err);
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4 sm:p-12">
      {/* Dimmed Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* App Window container */}
      <div 
        className="w-full max-w-3xl bg-black/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden h-[85vh] md:h-[500px]"
        onClick={e => e.stopPropagation()}
      >
        {/* Window Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          {/* Left: Mac traffic lights on desktop, hamburger on mobile */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            {/* Mobile close */}
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            {/* Desktop traffic lights */}
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20">
                <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              </button>
            </div>
          </div>
          
          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">{t('settings.title')}</span>
          </div>
          
          {/* Right spacer */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Sidebar */}
          <div className="w-full md:w-56 bg-black/20 border-b md:border-b-0 md:border-r border-white/10 p-4 md:p-6 flex flex-col gap-2 shrink-0">
            <div className="flex flex-row md:flex-col gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0 hide-scroll">
              <button 
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'appearance' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('appearance')}
              >
                 {t('settings.appearance')}
              </button>
              <button 
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'language' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('language')}
              >
                 {t('settings.language')}
              </button>
              <button 
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'system' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('system')}
              >
                 {t('settings.system')}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col p-4 sm:p-6 md:p-8 relative bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">

            <div className="flex-1 overflow-y-auto pr-2 md:pr-4 no-scrollbar">
              {activeTab === 'appearance' && (
                <div className="space-y-8 fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.bgWallpaper')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.bgDesc')}</p>
                    
                    <input 
                      type="text"
                      value={bg}
                      onChange={e => setBg(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner mb-5"
                      placeholder={t('settings.bgPlaceholder')}
                    />
                    
                    <div className="flex flex-wrap gap-4">
                      <button 
                        type="button"
                        onClick={() => setBg('https://images.unsplash.com/photo-1542281286-9e0a16bb7366?q=80&w=2070&auto=format&fit=crop')}
                        className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg === 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?q=80&w=2070&auto=format&fit=crop' ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-white/20 hover:scale-105 hover:border-white/50'}`}
                        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1542281286-9e0a16bb7366?q=80&w=2070&auto=format&fit=crop")' }} 
                        title="Green Grass Dew"
                      />
                      <button 
                        type="button"
                        onClick={() => setBg('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop')}
                        className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg === 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop' ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-white/20 hover:scale-105 hover:border-white/50'}`}
                        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop")' }} 
                        title="Beach Sunset"
                      />
                      <button 
                        type="button"
                        onClick={() => setBg('https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=2070&auto=format&fit=crop')}
                        className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg === 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=2070&auto=format&fit=crop' ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-white/20 hover:scale-105 hover:border-white/50'}`}
                        style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=2070&auto=format&fit=crop")' }} 
                        title="Dark Starry Sky"
                      />
                      {bgPreview && (
                        <button 
                          type="button"
                          onClick={() => setBg(`idb://${IDB_BG_KEY}?t=${Date.now()}`)}
                          className={`w-24 h-16 rounded-xl bg-cover bg-center border transition-all shadow-md focus:outline-none ${bg.startsWith(`idb://${IDB_BG_KEY}`) ? 'border-[#72d565] ring-2 ring-[#72d565] scale-105' : 'border-[#72d565]/50 hover:scale-105 hover:border-[#72d565]'}`}
                          style={{ backgroundImage: `url("${bgPreview}")` }} 
                          title="Local Custom Image"
                        />
                      )}
                      <label 
                        title="Upload Custom Image"
                        className="w-24 h-16 rounded-xl bg-white/5 hover:bg-white/10 border border-dashed border-white/30 hover:scale-105 hover:border-white/80 transition-all shadow-md flex items-center justify-center cursor-pointer text-white/50 hover:text-white"
                      >
                        {isCompressing ? (
                          <svg className="animate-spin w-5 h-5 text-white/60" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <span className="text-2xl leading-none mb-1">+</span>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isCompressing} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'language' && (
                <div className="space-y-6 fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.langTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.langDesc')}</p>
                    
                    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                      <button 
                        className={`w-full px-5 py-4 border-b border-white/5 text-[14px] font-medium flex justify-between ${language === 'en' ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                        onClick={() => setLanguage('en')}
                      >
                        English (US)
                        {language === 'en' && <span className="text-[#72d565]">✓</span>}
                      </button>
                      <button 
                        className={`w-full px-5 py-4 text-[14px] font-medium flex justify-between ${language === 'zh' ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                        onClick={() => setLanguage('zh')}
                      >
                        简体中文
                        {language === 'zh' && <span className="text-[#72d565]">✓</span>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'system' && (
                <div className="space-y-6 fade-in">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.sysTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.sysDesc')}</p>
                    
                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('settings.sysLabel')}</label>
                    <input 
                      type="url"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner"
                      placeholder="http://localhost:8080"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 md:mt-8 pt-4 md:pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-end gap-3 shrink-0">
              <button 
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white text-white/80 font-medium transition-colors"
              >
                {t('settings.cancel')}
              </button>
              <button 
                onClick={handleSave}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] border border-[#5bb84f] text-black font-bold transition-colors shadow-[0_0_15px_rgba(114,213,101,0.3)] hover:shadow-[0_0_20px_rgba(114,213,101,0.5)]"
              >
                {t('settings.apply')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
