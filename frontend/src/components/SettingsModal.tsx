import React, { useState, useEffect } from 'react';
import { useConfigStore } from '../store/configStore';
import { useTranslation } from '../i18n/useTranslation';
import { saveImageBlob, loadImageBlob } from '../utils/imageStore';

type Tab = 'appearance' | 'language' | 'system';

const IDB_BG_KEY = 'bg-custom';

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { serverUrl, setServerUrl, backgroundImage, setBackgroundImage, language, setLanguage } = useConfigStore();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<Tab>('appearance');
  const [url, setUrl] = useState(serverUrl);
  const [bg, setBg] = useState(backgroundImage);
  const [bgPreview, setBgPreview] = useState(''); // Object URL for local file preview

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
    // Store blob in IndexedDB, only save a lightweight reference key
    await saveImageBlob(IDB_BG_KEY, file);
    const objUrl = URL.createObjectURL(file);
    setBgPreview(objUrl);
    setBg(`idb://${IDB_BG_KEY}?t=${Date.now()}`);
  };

  const handleSave = () => {
    setServerUrl(url.trim());
    setBackgroundImage(bg.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px] animate-fadeIn p-4" onClick={onClose}>
      <div 
        className="w-full max-w-3xl bg-[#1c1c1e]/70 backdrop-blur-[80px] border border-white/[0.08] rounded-[2rem] md:rounded-[2.5rem] shadow-[0_30px_80px_rgba(0,0,0,0.6)] flex flex-col md:flex-row overflow-hidden transform animate-scaleIn pointer-events-auto h-[85vh] md:h-[500px] relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button - always top-right of modal */}
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10 z-30 bg-black/30 backdrop-blur-md">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        {/* Sidebar */}
        <div className="w-full md:w-56 bg-black/20 border-b md:border-b-0 md:border-r border-white/10 p-4 md:p-6 flex flex-col gap-2 shrink-0 z-10 relative">
          <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-3 mb-2 md:mb-8 ml-2">
            {t('settings.title')}
          </h2>
          
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
                      <span className="text-2xl leading-none mb-1">+</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
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
  );
};
