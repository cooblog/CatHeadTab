import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useConfigStore, isEnvConfigured, ENV_API_URL } from '../store/configStore';
import { hasAIAccess } from '../ai/provider';
import { useLayoutStore } from '../store/layoutStore';
import { useTranslation } from '../i18n/useTranslation';
import { saveImageBlob, loadImageBlob, compressImageToWebP, generateThumbnail, saveDirHandle, loadDirHandle } from '../utils/imageStore';
import client from '../api/client';
import type { WallpaperItem, WallpaperSearchResult, WallpaperSorting, WallpaperCategoryFilter, WallpaperPurityFilter, WallpaperProviderConfig } from '../api/wallhavenTypes';
import builtinBgWebp from '../assets/bg.webp';

type Tab = 'wallpaper' | 'system' | 'ai';
type WallpaperSubTab = 'current' | 'browse';
type WallpaperSource = 'builtin' | 'local' | 'wallhaven' | 'cos';

/** Border color classes matching Wallhaven's purity indicators. */
const purityBorderClass = (purity: string): string => {
  switch (purity) {
    case 'sketchy':
      return 'border-yellow-500/70 hover:border-yellow-400';
    case 'nsfw':
      return 'border-red-500/70 hover:border-red-400';
    default:
      return 'border-white/10 hover:border-[#72d565]/50';
  }
};

/** Purity badge for the preview modal. */
const purityBadge = (purity: string): { label: string; color: string } | null => {
  switch (purity) {
    case 'sketchy':
      return { label: 'Sketchy', color: 'bg-yellow-500/80 text-black' };
    case 'nsfw':
      return { label: 'NSFW', color: 'bg-red-500/80 text-white' };
    default:
      return null;
  }
};

const IDB_BG_KEY = 'bg-custom';
// Max original file size allowed before compression (20 MB)
const MAX_ORIGINAL_SIZE = 20 * 1024 * 1024;

/** Reset layout button with two-step confirmation (no confirm() dialog). */
const ResetLayoutButton: React.FC<{ language: string }> = ({ language }) => {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const isZh = language === 'zh';
  const { t } = useTranslation();

  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [confirming]);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    useLayoutStore.getState().resetToDefault();
    setConfirming(false);
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  if (done) {
    return (
      <p className="text-[13px] text-[#72d565] font-medium">
        ✓ {isZh ? '已恢复默认布局（可在 AI 助手中回滚）' : 'Layout reset to default (rollback available in AI Agent)'}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
        confirming
          ? 'bg-red-500/30 hover:bg-red-500/40 border border-red-500/40 text-red-300 animate-pulse'
          : 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      {confirming
        ? (isZh ? '再次点击确认恢复' : 'Click again to confirm')
        : t('settings.resetLayout')
      }
    </button>
  );
};

/** AI Assistant configuration section — independent tab. */
const AISettingsSection: React.FC = () => {
  const { aiActiveProvider, aiProviderConfigs, setAIProvider, updateAIProviderConfig, userProfile } = useConfigStore();
  const { t } = useTranslation();
  const isZh = useConfigStore(s => s.language) === 'zh';
  const proGateEnabled = userProfile?.pro_gate_enabled ?? false;
  const isProOrAdmin = userProfile?.role === 'pro' || userProfile?.role === 'admin';

  const serverAI = useConfigStore(s => s.serverAIConfig);
  const preferLocal = useConfigStore(s => s.aiPreferLocal);
  const setAIPreferLocal = useConfigStore(s => s.setAIPreferLocal);
  const hasServerAI = !!serverAI?.configured && hasAIAccess();

  // Presets: each provider has a key, display name, default URL and model
  const presets = [
    { key: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { key: 'anthropic', name: 'Anthropic', url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
    { key: 'google', name: 'Google', url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
    { key: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { key: 'glm', name: 'GLM (智谱)', url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { key: 'kimi', name: 'Kimi (月之暗面)', url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { key: 'minimax', name: 'MiniMax', url: 'https://api.minimax.chat/v1', model: 'MiniMax-Text-01' },
    { key: 'qwen', name: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  ];

  // Active preset key — find from presets or use raw aiActiveProvider
  const [activeKey, setActiveKey] = useState(aiActiveProvider || presets[0].key);

  // Load the config for the currently selected provider
  const currentConfig = aiProviderConfigs[activeKey] || { apiKey: '', baseUrl: '', model: '' };
  const currentPreset = presets.find(p => p.key === activeKey);

  const [apiKey, setApiKey] = useState(currentConfig.apiKey);
  const [baseUrl, setBaseUrl] = useState(currentConfig.baseUrl || currentPreset?.url || '');
  const [model, setModel] = useState(currentConfig.model || currentPreset?.model || '');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [modelList, setModelList] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch model list when API Key and Base URL are available
  const fetchModels = useCallback(async (url?: string, key?: string) => {
    const reqUrl = (url || baseUrl).replace(/\/+$/, '') + '/models';
    const reqKey = key || apiKey;
    if (!reqUrl || !reqKey) return;
    setLoadingModels(true);
    try {
      // Use proxyFetch to avoid CORS issues
      const { proxyFetch } = await import('../ai/proxyFetch');
      const resp = await proxyFetch(reqUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${reqKey}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        // OpenAI-compatible /models response: { data: [{ id: "model-name" }, ...] }
        const models: string[] = (data?.data || [])
          .map((m: any) => m.id || m.name || '')
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b));
        setModelList(models);
      }
    } catch {
      // Silently fail — model list is optional, user can still type manually
    } finally {
      setLoadingModels(false);
    }
  }, [baseUrl, apiKey]);

  // Auto-fetch models when baseUrl or apiKey changes (debounced)
  useEffect(() => {
    if (!baseUrl || !apiKey) { setModelList([]); return; }
    const timer = setTimeout(() => fetchModels(), 800);
    return () => clearTimeout(timer);
  }, [baseUrl, apiKey, fetchModels]);

  // Filtered model list based on search input
  const filteredModels = modelFilter
    ? modelList.filter(m => m.toLowerCase().includes(modelFilter.toLowerCase()))
    : modelList;

  // When switching provider, load that provider's saved config
  const handleSelectProvider = (key: string) => {
    // Save current edits first
    updateAIProviderConfig(activeKey, { apiKey, baseUrl, model });

    setActiveKey(key);
    const cfg = aiProviderConfigs[key] || { apiKey: '', baseUrl: '', model: '' };
    const preset = presets.find(p => p.key === key);
    setApiKey(cfg.apiKey);
    setBaseUrl(cfg.baseUrl || preset?.url || '');
    setModel(cfg.model || preset?.model || '');
    setShowKey(false);
    setTestResult(null);
    setSaved(false);
    setModelList([]);
    setModelFilter('');
    // Auto-fetch models for the new provider if credentials exist
    const newUrl = cfg.baseUrl || preset?.url || '';
    const newKey = cfg.apiKey;
    if (newUrl && newKey) {
      setTimeout(() => fetchModels(newUrl, newKey), 100);
    }
  };

  const handleSave = () => {
    setAIProvider(activeKey, { apiKey, baseUrl, model });
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (!apiKey || !baseUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const testUrl = baseUrl.replace(/\/+$/, '') + '/models';
      const resp = await fetch(testUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        setTestResult({ ok: true, msg: t('settings.aiTestSuccess') });
      } else {
        setTestResult({ ok: false, msg: `${t('settings.aiTestFailed')} HTTP ${resp.status}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: `${t('settings.aiTestFailed')} ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  // Check which providers have API keys configured
  const hasKey = (key: string) => !!(aiProviderConfigs[key]?.apiKey);

  if (proGateEnabled && !isProOrAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #ec4899 100%)', opacity: 0.6 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div className="space-y-1.5">
          <p className="text-[15px] font-semibold text-white/70">{isZh ? 'Pro 专属功能' : 'Pro Feature'}</p>
          <p className="text-[13px] text-white/35 leading-relaxed max-w-xs">
            {isZh
              ? 'AI 助手是 Pro 会员专属功能。升级为 Pro 会员后，即可配置 API Key 并使用智能桌面管家。'
              : 'AI Agent is a Pro-exclusive feature. Upgrade to Pro to configure API keys and unlock the smart desktop assistant.'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-purple-400 text-[12px] bg-purple-400/10 px-3 py-1.5 rounded-full border border-purple-400/20">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Pro
        </span>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-2">{t('settings.aiTitle')}</h3>
      <p className="text-[13px] text-white/50 mb-4">{t('settings.aiDesc')}</p>

      {/* Server AI / Local AI mode switcher — only for Pro+Admin users when server AI is available */}
      {hasServerAI && (
        <div className="mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-[13px] font-medium text-white/70 mb-0.5">
                {isZh ? 'AI 来源' : 'AI Source'}
              </p>
              <p className="text-[11px] text-white/30">
                {!preferLocal
                  ? (isZh ? `使用服务端 AI（${serverAI?.provider || 'Server'} / ${serverAI?.model || ''}），无需配置 API Key` : `Using server AI (${serverAI?.provider || 'Server'} / ${serverAI?.model || ''}), no API Key needed`)
                  : (isZh ? '使用自己的 API Key 直接调用 LLM' : 'Using your own API Key to call LLM directly')
                }
              </p>
            </div>
            <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setAIPreferLocal(false)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                  !preferLocal ? 'bg-[#72d565]/20 text-[#72d565]' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {isZh ? '服务端' : 'Server'}
              </button>
              <button
                type="button"
                onClick={() => setAIPreferLocal(true)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                  preferLocal ? 'bg-[#72d565]/20 text-[#72d565]' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {isZh ? '本地 Key' : 'Local Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server AI is available but user lacks Pro — show lock notice */}
      {!!serverAI?.configured && !hasServerAI && (
        <div className="mb-5 p-3 rounded-xl bg-purple-500/[0.06] border border-purple-400/15 flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <div>
            <p className="text-[13px] font-medium text-purple-300">{isZh ? '服务端 AI 已配置（Pro 专属）' : 'Server AI Available (Pro Only)'}</p>
            <p className="text-[11px] text-white/30 mt-0.5">
              {isZh
                ? `管理员已启用服务端 AI（${serverAI?.provider}/${serverAI?.model}），升级为 Pro 用户即可免费使用，无需配置 API Key`
                : `Server AI (${serverAI?.provider}/${serverAI?.model}) is enabled by admin. Upgrade to Pro to use it without configuring an API key.`}
            </p>
          </div>
        </div>
      )}

      {/* Local API Key configuration — show when: no server AI, or user chose local mode, or user lacks Pro */}
      {(!serverAI?.configured || !hasServerAI || preferLocal) && (
      <>
      {/* Provider selector — pill buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {presets.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => handleSelectProvider(p.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5 ${
              activeKey === p.key
                ? 'bg-[#72d565]/20 text-[#72d565] border border-[#72d565]/30 shadow-sm shadow-[#72d565]/10'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-white/5'
            }`}
          >
            {p.name}
            {hasKey(p.key) && <span className="w-1.5 h-1.5 rounded-full bg-[#72d565]" title="API Key configured" />}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {/* Base URL */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-1.5 ml-1">{t('settings.aiBaseUrl')}</label>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all"
            placeholder={t('settings.aiBaseUrlPlaceholder')}
          />
        </div>

        {/* API Key */}
        <div>
          <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-1.5 ml-1">{t('settings.aiApiKey')}</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 pr-12 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all font-mono"
              placeholder={t('settings.aiApiKeyPlaceholder')}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showKey ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
          <p className="text-[11px] text-white/25 mt-1 ml-1">🔒 API Key 仅保存在本地，不会上传到云端。每个服务商的 Key 独立存储。</p>
        </div>

        {/* Model — combobox with auto-fetched model list */}
        <div ref={modelDropdownRef} className="relative">
          <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-1.5 ml-1">{t('settings.aiModel')}</label>
          <div className="relative">
            <input
              value={modelDropdownOpen ? modelFilter : model}
              onChange={e => {
                const val = e.target.value;
                setModelFilter(val);
                if (!modelDropdownOpen) {
                  setModel(val);
                }
              }}
              onFocus={() => {
                setModelDropdownOpen(true);
                setModelFilter('');
              }}
              className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 pr-10 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all"
              placeholder={t('settings.aiModelPlaceholder')}
            />
            <button
              type="button"
              onClick={() => {
                if (!modelDropdownOpen && modelList.length === 0 && apiKey && baseUrl) fetchModels();
                setModelDropdownOpen(o => !o);
                setModelFilter('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {loadingModels ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
              )}
            </button>
          </div>

          {/* Dropdown list */}
          {modelDropdownOpen && (
            <div className="absolute z-50 mt-1.5 w-full max-h-60 overflow-y-auto bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl no-scrollbar">
              {filteredModels.length > 0 ? (
                filteredModels.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setModel(m); setModelDropdownOpen(false); setModelFilter(''); }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors hover:bg-white/10 ${
                      m === model ? 'text-[#72d565] bg-white/5' : 'text-white/70'
                    }`}
                  >
                    {m}
                  </button>
                ))
              ) : loadingModels ? (
                <div className="px-4 py-3 text-[12px] text-white/30 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/></svg>
                  {t('settings.aiTesting')}
                </div>
              ) : modelList.length === 0 && apiKey && baseUrl ? (
                <button
                  type="button"
                  onClick={() => fetchModels()}
                  className="w-full text-left px-4 py-3 text-[12px] text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  {t('settings.aiFetchModels')}
                </button>
              ) : modelFilter && modelList.length > 0 ? (
                <div className="px-4 py-3 text-[12px] text-white/30">{t('settings.aiNoMatchingModels')}</div>
              ) : (
                <div className="px-4 py-3 text-[12px] text-white/30">{t('settings.aiConfigureFirst')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-3 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] text-black font-semibold text-[13px] transition-colors active:scale-95"
        >
          {saved ? '✓ ' + t('settings.aiSaved') : t('settings.aiSave')}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={!apiKey || !baseUrl || testing}
          className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 font-medium text-[13px] transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {testing ? t('settings.aiTesting') : t('settings.aiTest')}
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <p className={`text-[12px] mt-2 ml-1 ${testResult.ok ? 'text-[#72d565]' : 'text-red-400'}`}>
          {testResult.msg}
        </p>
      )}
      </>
      )}
    </div>
  );
};


export const SettingsModal: React.FC<{ onClose: () => void; initialTab?: Tab }> = ({ onClose, initialTab = 'wallpaper' }) => {
  const { serverUrl, setServerUrl, backgroundImage, setBackgroundImage, language, setLanguage, lockIdleTimeout, setLockIdleTimeout, jwtToken, userProfile } = useConfigStore();
  const isAdmin = userProfile?.role === 'admin';
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);
  const [wpSubTab, setWpSubTab] = useState<WallpaperSubTab>('current');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [url, setUrl] = useState(serverUrl);
  const [bg, setBg] = useState(backgroundImage);
  const [bgPreview, setBgPreview] = useState(''); // Object URL for local file preview
  const [isCompressing, setIsCompressing] = useState(false);
  const [currentBgFullscreen, setCurrentBgFullscreen] = useState(false);

  // --- Wallpaper source state ---
  const [wpSource, setWpSource] = useState<WallpaperSource>(isAdmin ? 'wallhaven' : 'builtin');
  const [wpSourceDropdownOpen, setWpSourceDropdownOpen] = useState(false);
  const wpSourceRef = useRef<HTMLDivElement>(null);

  // --- Dynamic backend providers (fetched from API) ---
  const [backendProviders, setBackendProviders] = useState<string[]>([]);
  const backendProvidersLoaded = useRef(false);

  // --- COS wallpaper browsing state ---
  const [cosResult, setCosResult] = useState<WallpaperSearchResult | null>(null);
  const [cosPage, setCosPage] = useState(1);
  const [cosLoading, setCosLoading] = useState(false);
  const [cosError, setCosError] = useState('');
  const [cosPreviewItem, setCosPreviewItem] = useState<WallpaperItem | null>(null);
  const [cosMobileItems, setCosMobileItems] = useState<WallpaperItem[]>([]);
  const [cosLoadingMore, setCosLoadingMore] = useState(false);
  const [cosHasMore, setCosHasMore] = useState(true);
  const cosInitialLoadDone = useRef(false);
  const cosSentinelRef = useRef<HTMLDivElement>(null);


  // --- Local folder browsing state ---
  const LOCAL_PAGE_SIZE = 30;
  const [localFolderName, setLocalFolderName] = useState('');
  const [localFileHandles, setLocalFileHandles] = useState<{ name: string; handle: FileSystemFileHandle }[]>([]);
  const [localPageImages, setLocalPageImages] = useState<{ name: string; thumbUrl: string; handle: FileSystemFileHandle }[]>([]);
  const [localPage, setLocalPage] = useState(0);
  const [localLoading, setLocalLoading] = useState(false);
  const [localPageLoading, setLocalPageLoading] = useState(false);
  // Full-size preview for local images
  const [localPreview, setLocalPreview] = useState<{ name: string; handle: FileSystemFileHandle; url: string } | null>(null);
  const [localPreviewLoading, setLocalPreviewLoading] = useState(false);

  // --- Online Wallpaper state (Wallhaven) ---
  const [wpQuery, setWpQuery] = useState('');
  const [wpSorting, setWpSorting] = useState<WallpaperSorting>('toplist');
  const [wpCategories, setWpCategories] = useState<Set<WallpaperCategoryFilter>>(new Set(['general', 'anime', 'people']));
  // Purity filter state — populated from backend config API
  const [wpAllowedPurity, setWpAllowedPurity] = useState<WallpaperPurityFilter[]>(['sfw']);
  const [wpHasApiKey, setWpHasApiKey] = useState(false);
  const [wpPurity, setWpPurity] = useState<Set<WallpaperPurityFilter>>(new Set(['sfw']));
  const wpConfigLoaded = useRef(false);
  const [wpResult, setWpResult] = useState<WallpaperSearchResult | null>(null);
  const [wpPage, setWpPage] = useState(1);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpError, setWpError] = useState('');
  const [wpPreviewItem, setWpPreviewItem] = useState<WallpaperItem | null>(null);
  const [wpSortOpen, setWpSortOpen] = useState(false);
  // Mobile infinite scroll state
  const [wpMobileItems, setWpMobileItems] = useState<WallpaperItem[]>([]);
  const [wpLoadingMore, setWpLoadingMore] = useState(false);
  const [wpHasMore, setWpHasMore] = useState(true);
  const wpSortRef = useRef<HTMLDivElement>(null);
  const wpScrollRef = useRef<HTMLDivElement>(null);
  const wpSentinelRef = useRef<HTMLDivElement>(null);
  const wpInitialLoadDone = useRef(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // --- Import/Export state ---
  const [importConfirmData, setImportConfirmData] = useState<{ pages: any[][]; dock: any[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Show/hide scroll-to-top button based on scroll position
  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowScrollTop(el.scrollTop > 300);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Close sorting dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wpSortRef.current && !wpSortRef.current.contains(e.target as Node)) {
        setWpSortOpen(false);
      }
    };
    if (wpSortOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [wpSortOpen]);

  // Close source dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wpSourceRef.current && !wpSourceRef.current.contains(e.target as Node)) {
        setWpSourceDropdownOpen(false);
      }
    };
    if (wpSourceDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [wpSourceDropdownOpen]);

  // Fetch provider config (allowed purity, hasApiKey) when switching to wallhaven source
  useEffect(() => {
    if (wpSource !== 'wallhaven' || wpConfigLoaded.current) return;
    const srvUrl = useConfigStore.getState().getEffectiveServerUrl();
    if (!srvUrl) return;
    (async () => {
      try {
        const resp = await client.get<WallpaperProviderConfig>('/api/v1/wallpapers/config?provider=wallhaven');
        const cfg = resp.data;
        setWpHasApiKey(cfg.hasApiKey);
        if (cfg.allowedPurity && cfg.allowedPurity.length > 0) {
          setWpAllowedPurity(cfg.allowedPurity);
          // Default selection: all allowed purities
          setWpPurity(new Set(cfg.allowedPurity));
        }
        wpConfigLoaded.current = true;
      } catch {
        // Config fetch failed — use safe defaults (sfw only)
      }
    })();
  }, [wpSource]);

  // Fetch available providers from backend (once) to dynamically show/hide COS source
  useEffect(() => {
    if (backendProvidersLoaded.current) return;
    const srvUrl = useConfigStore.getState().getEffectiveServerUrl();
    if (!srvUrl) return;
    (async () => {
      try {
        const resp = await client.get<{ providers: string[] }>('/api/v1/wallpapers/providers');
        setBackendProviders(resp.data.providers || []);
        backendProvidersLoaded.current = true;
        // If COS is available and user isn't admin, default to COS as the builtin source
        if (resp.data.providers?.includes('cos') && !isAdmin) {
          setWpSource('cos');
        }
      } catch {
        // Provider fetch failed — use static options only
      }
    })();
  }, [isAdmin]);

  const fetchWallpapers = useCallback(async (page: number, query: string, sorting: WallpaperSorting, cats: Set<WallpaperCategoryFilter>, purities: Set<WallpaperPurityFilter>, append = false, existingIds?: string[]) => {
    const srvUrl = useConfigStore.getState().getEffectiveServerUrl();
    if (!srvUrl) {
      setWpError(t('settings.wpNeedServer'));
      return;
    }
    if (append) {
      setWpLoadingMore(true);
    } else {
      setWpLoading(true);
    }
    setWpError('');

    try {
      const params = new URLSearchParams();
      params.set('provider', 'wallhaven');
      params.set('page', String(page));
      params.set('sorting', sorting);
      if (sorting === 'toplist') {
        params.set('topRange', '1M');
      }
      if (query.trim()) {
        params.set('q', query.trim());
      }
      if (cats.size > 0 && cats.size < 3) {
        params.set('categories', Array.from(cats).join(','));
      }
      // Send purity filter (only when not all selected or when explicitly filtered)
      if (purities.size > 0) {
        params.set('purity', Array.from(purities).join(','));
      }
      // Deduplication: when loading more pages, send already-loaded IDs so the
      // backend can exclude them from the response (handles cache staleness).
      if (append && existingIds && existingIds.length > 0) {
        params.set('exclude', existingIds.join(','));
      }
      const resp = await client.get<WallpaperSearchResult>(`/api/v1/wallpapers/search?${params.toString()}`);
      const data = resp.data;

      setWpResult(data);
      setWpPage(data.currentPage);
      setWpHasMore(data.currentPage < data.lastPage);
      if (append) {
        setWpMobileItems(prev => [...prev, ...data.wallpapers]);
      } else {
        setWpMobileItems(data.wallpapers);
        if (contentScrollRef.current) {
          contentScrollRef.current.scrollTop = 0;
        }
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setWpError(t('settings.wpNeedLogin'));
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setWpError(msg);
      }
    } finally {
      setWpLoading(false);
      setWpLoadingMore(false);
    }
  }, [t]);

  // Auto-load wallpapers when switching to the browse sub-tab with wallhaven source
  useEffect(() => {
    if (activeTab === 'wallpaper' && wpSubTab === 'browse' && wpSource === 'wallhaven' && !wpInitialLoadDone.current) {
      wpInitialLoadDone.current = true;
      fetchWallpapers(1, wpQuery, wpSorting, wpCategories, wpPurity);
    }
  }, [activeTab, wpSubTab, wpSource, fetchWallpapers, wpQuery, wpSorting, wpCategories, wpPurity]);

  // --- COS wallpaper fetching ---
  const fetchCosWallpapers = useCallback(async (page: number, append = false) => {
    const srvUrl = useConfigStore.getState().getEffectiveServerUrl();
    if (!srvUrl) {
      setCosError(t('settings.wpNeedServer'));
      return;
    }
    if (append) {
      setCosLoadingMore(true);
    } else {
      setCosLoading(true);
    }
    setCosError('');

    try {
      const params = new URLSearchParams();
      params.set('provider', 'cos');
      params.set('page', String(page));
      params.set('sorting', 'date_added');
      const resp = await client.get<WallpaperSearchResult>(`/api/v1/wallpapers/search?${params.toString()}`);
      const data = resp.data;

      setCosResult(data);
      setCosPage(data.currentPage);
      setCosHasMore(data.currentPage < data.lastPage);
      if (append) {
        setCosMobileItems(prev => [...prev, ...data.wallpapers]);
      } else {
        setCosMobileItems(data.wallpapers);
        if (contentScrollRef.current) {
          contentScrollRef.current.scrollTop = 0;
        }
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setCosError(t('settings.wpNeedLogin'));
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setCosError(msg);
      }
    } finally {
      setCosLoading(false);
      setCosLoadingMore(false);
    }
  }, [t]);

  // Auto-load COS wallpapers when switching to browse sub-tab with COS source
  useEffect(() => {
    if (activeTab === 'wallpaper' && wpSubTab === 'browse' && wpSource === 'cos' && !cosInitialLoadDone.current) {
      cosInitialLoadDone.current = true;
      fetchCosWallpapers(1);
    }
  }, [activeTab, wpSubTab, wpSource, fetchCosWallpapers]);

  // COS load more handler
  const handleCosLoadMore = useCallback(() => {
    if (cosLoadingMore || cosLoading || !cosHasMore || !cosResult) return;
    const nextPage = cosPage + 1;
    fetchCosWallpapers(nextPage, true);
  }, [cosLoadingMore, cosLoading, cosHasMore, cosResult, cosPage, fetchCosWallpapers]);

  // COS infinite scroll observer
  useEffect(() => {
    const sentinel = cosSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleCosLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleCosLoadMore]);

  // Handle selecting a COS wallpaper
  const handleSelectCosWallpaper = async (item: WallpaperItem) => {
    // Save a stable identifier (cos://objectKey) instead of the expiring pre-signed URL.
    // The App layer resolves cos:// URIs via the backend proxy on every load.
    const cosUri = `cos://${item.id}`;
    setBg(cosUri);
    setBackgroundImage(cosUri);
    setCosPreviewItem(null);

    const { jwtToken: token } = useConfigStore.getState();
    if (token) {
      useLayoutStore.getState().syncPreferencesToCloud().catch(err => {
        console.error('Failed to sync wallpaper to cloud', err);
      });
    }
  };

  // Auto-refresh when sorting changes (only after initial load)
  const prevSorting = useRef(wpSorting);
  useEffect(() => {
    const sortChanged = prevSorting.current !== wpSorting;
    prevSorting.current = wpSorting;
    if (!wpInitialLoadDone.current) return;
    if (!sortChanged) return;
    if (activeTab !== 'wallpaper' || wpSubTab !== 'browse' || wpSource !== 'wallhaven') return;
    setWpMobileItems([]);
    setWpHasMore(true);
    fetchWallpapers(1, wpQuery, wpSorting, wpCategories, wpPurity);
  }, [wpSorting, activeTab, wpSubTab, wpSource, wpQuery, wpCategories, wpPurity, fetchWallpapers]);

  const handleWpSearch = () => {
    setWpMobileItems([]);
    setWpHasMore(true);
    fetchWallpapers(1, wpQuery, wpSorting, wpCategories, wpPurity);
  };

  const handleWpLoadMore = useCallback(() => {
    if (wpLoadingMore || wpLoading || !wpHasMore || !wpResult) return;
    const nextPage = wpPage + 1;
    // Collect IDs of already-loaded wallpapers for server-side deduplication.
    const existingIds = wpMobileItems.map(item => item.id);
    fetchWallpapers(nextPage, wpQuery, wpSorting, wpCategories, wpPurity, true, existingIds);
  }, [wpLoadingMore, wpLoading, wpHasMore, wpResult, wpPage, wpQuery, wpSorting, wpCategories, wpPurity, wpMobileItems, fetchWallpapers]);

  // Infinite scroll: observe sentinel element
  useEffect(() => {
    const sentinel = wpSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleWpLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleWpLoadMore]);

  const handleSelectWallpaper = async (item: WallpaperItem) => {
    const wallpaperUrl = item.fullUrl;
    // Apply immediately to store (no need to click "Save" again)
    setBg(wallpaperUrl);
    setBackgroundImage(wallpaperUrl);
    // Close preview modal if open
    setWpPreviewItem(null);

    // If user is logged in, sync wallpaper preference to cloud
    const { jwtToken } = useConfigStore.getState();
    if (jwtToken) {
      useLayoutStore.getState().syncPreferencesToCloud().catch(err => {
        console.error('Failed to sync wallpaper to cloud', err);
      });
    }
  };

  const toggleWpCategory = (cat: WallpaperCategoryFilter) => {
    setWpCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const toggleWpPurity = (p: WallpaperPurityFilter) => {
    setWpPurity(prev => {
      const next = new Set(prev);
      if (next.has(p)) {
        // Must keep at least one selected
        if (next.size > 1) next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  };

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
      const idbUrl = `idb://${IDB_BG_KEY}?t=${Date.now()}`;
      setBg(idbUrl);
      applyBackground(idbUrl);
    } catch (err) {
      console.error('Failed to compress image', err);
      // Fallback: save original
      await saveImageBlob(IDB_BG_KEY, file);
      const objUrl = URL.createObjectURL(file);
      setBgPreview(objUrl);
      const idbUrl = `idb://${IDB_BG_KEY}?t=${Date.now()}`;
      setBg(idbUrl);
      applyBackground(idbUrl);
    } finally {
      setIsCompressing(false);
    }
  };

  // Scan a directory handle for image files (shared by both pick-new and restore-saved)
  const scanDirHandle = async (dirHandle: FileSystemDirectoryHandle) => {
    setLocalFolderName(dirHandle.name);
    setLocalLoading(true);
    // Clean up previous page thumbnail URLs
    localPageImages.forEach(img => URL.revokeObjectURL(img.thumbUrl));
    setLocalPageImages([]);
    const handles: { name: string; handle: FileSystemFileHandle }[] = [];
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.avif']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS DOM types lack FileSystemDirectoryHandle async iteration
    for await (const entry of (dirHandle as any).values() as AsyncIterable<FileSystemHandle>) {
      if (entry.kind !== 'file') continue;
      const ext = entry.name.lastIndexOf('.') >= 0 ? entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase() : '';
      if (!imageExts.has(ext)) continue;
      handles.push({ name: entry.name, handle: entry as FileSystemFileHandle });
    }
    // Sort by name
    handles.sort((a, b) => a.name.localeCompare(b.name));
    setLocalFileHandles(handles);
    setLocalPage(0);
    setLocalLoading(false);
  };

  // Open a local folder — only scan file handles (no file content loaded yet)
  const handleSelectFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert(t('settings.wpLocalNotSupported'));
      return;
    }
    try {
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      // Persist the handle so we can restore it next time
      await saveDirHandle(dirHandle);
      await scanDirHandle(dirHandle);
    } catch {
      // User cancelled the picker — do nothing
    }
  };

  // Restore the last used folder from IndexedDB (called when switching to local source)
  const restoreLastFolder = useCallback(async () => {
    // Only restore if we don't already have files loaded
    if (localFileHandles.length > 0 || localFolderName) return;
    try {
      const savedHandle = await loadDirHandle();
      if (!savedHandle) return;
      // Must re-request permission after page reload
      const perm = await (savedHandle as FileSystemDirectoryHandle & {
        requestPermission: (opts: { mode: string }) => Promise<string>;
      }).requestPermission({ mode: 'read' });
      if (perm !== 'granted') return;
      await scanDirHandle(savedHandle);
    } catch {
      // Permission denied or handle invalid — silently ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFileHandles.length, localFolderName]);

  // Load images for a specific page (lazy: generate small thumbnails for display)
  const loadLocalPage = useCallback(async (page: number, handles: { name: string; handle: FileSystemFileHandle }[]) => {
    setLocalPageLoading(true);
    // Revoke old page thumbnail URLs
    localPageImages.forEach(img => URL.revokeObjectURL(img.thumbUrl));
    const start = page * LOCAL_PAGE_SIZE;
    const end = Math.min(start + LOCAL_PAGE_SIZE, handles.length);
    const pageHandles = handles.slice(start, end);
    const images: { name: string; thumbUrl: string; handle: FileSystemFileHandle }[] = [];
    for (const h of pageHandles) {
      try {
        const file = await h.handle.getFile();
        const thumbBlob = await generateThumbnail(file);
        images.push({ name: h.name, thumbUrl: URL.createObjectURL(thumbBlob), handle: h.handle });
      } catch {
        // Skip files that can't be read
      }
    }
    setLocalPageImages(images);
    setLocalPageLoading(false);
  }, [localPageImages]);

  // When page or file handles change, load the corresponding page
  useEffect(() => {
    if (localFileHandles.length > 0) {
      loadLocalPage(localPage, localFileHandles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPage, localFileHandles]);

  // Auto-restore last used folder when switching to local source
  useEffect(() => {
    if (wpSource === 'local') {
      restoreLastFolder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpSource]);

  const localTotalPages = Math.max(1, Math.ceil(localFileHandles.length / LOCAL_PAGE_SIZE));

  // Open full-size preview for a local image (reads original file from handle)
  const openLocalPreview = async (name: string, handle: FileSystemFileHandle) => {
    setLocalPreviewLoading(true);
    setLocalPreview({ name, handle, url: '' });
    try {
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      setLocalPreview({ name, handle, url });
    } catch {
      // Failed to read — close preview
      setLocalPreview(null);
    } finally {
      setLocalPreviewLoading(false);
    }
  };

  const closeLocalPreview = () => {
    if (localPreview?.url) URL.revokeObjectURL(localPreview.url);
    setLocalPreview(null);
  };

  // Apply a local image as wallpaper — reads original file on demand from handle
  const handleLocalImageSelect = async (handle: FileSystemFileHandle) => {
    setIsCompressing(true);
    let file: File | null = null;
    try {
      file = await handle.getFile();
      if (file.size > MAX_ORIGINAL_SIZE) {
        alert(t('settings.bgTooLarge'));
        setIsCompressing(false);
        return;
      }
      const compressed = await compressImageToWebP(file);
      await saveImageBlob(IDB_BG_KEY, compressed);
      const objUrl = URL.createObjectURL(compressed);
      setBgPreview(objUrl);
      const idbUrl = `idb://${IDB_BG_KEY}?t=${Date.now()}`;
      setBg(idbUrl);
      applyBackground(idbUrl);
    } catch (err) {
      console.error('Failed to compress image', err);
      if (file) {
        await saveImageBlob(IDB_BG_KEY, file);
        const objUrl = URL.createObjectURL(file);
        setBgPreview(objUrl);
        const idbUrl = `idb://${IDB_BG_KEY}?t=${Date.now()}`;
        setBg(idbUrl);
        applyBackground(idbUrl);
      }
    } finally {
      setIsCompressing(false);
      closeLocalPreview();
    }
  };

  // Clean up local page thumbnail URLs on unmount
  useEffect(() => {
    return () => {
      localPageImages.forEach(img => URL.revokeObjectURL(img.thumbUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Immediately apply and sync background whenever it changes
  const applyBackground = useCallback(async (newBg: string) => {
    const trimmed = newBg.trim();
    setBackgroundImage(trimmed);

    const { jwtToken } = useConfigStore.getState();
    if (jwtToken) {
      useLayoutStore.getState().syncPreferencesToCloud().catch(err => {
        console.error('Failed to sync background to cloud', err);
      });
    }
  }, [setBackgroundImage]);

  // Immediately save server URL
  const applyServerUrl = useCallback((newUrl: string) => {
    setServerUrl(newUrl.trim());
  }, [setServerUrl]);

  // --- Export layout as JSON file ---
  const handleExportLayout = useCallback(() => {
    const { layout } = useLayoutStore.getState();
    const exportData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      source: 'CatHeadTab',
      pages: layout.pages,
      dock: layout.dock,
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catheadtab-layout-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // --- Import layout: parse file and show confirm dialog ---
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        // Validate structure: must have pages array
        if (!data || !Array.isArray(data.pages)) {
          alert(t('settings.importInvalidFile'));
          return;
        }
        const dock = Array.isArray(data.dock) ? data.dock : [];
        setImportConfirmData({ pages: data.pages, dock });
      } catch {
        alert(t('settings.importInvalidFile'));
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, [t]);

  // --- Import: overwrite current layout ---
  const handleImportOverwrite = useCallback(() => {
    if (!importConfirmData) return;
    const { setLayout } = useLayoutStore.getState();
    setLayout({ pages: importConfirmData.pages, dock: importConfirmData.dock });
    // Trigger cloud sync if logged in
    const { jwtToken: token } = useConfigStore.getState();
    if (token) {
      useLayoutStore.getState().syncLayoutOnly().catch(err => {
        console.error('Failed to sync imported layout to cloud', err);
      });
    }
    setImportConfirmData(null);
  }, [importConfirmData]);

  // --- Import: merge with current layout ---
  const handleImportMerge = useCallback(() => {
    if (!importConfirmData) return;
    const currentLayout = useLayoutStore.getState().layout;

    // Collect all existing IDs
    const existingIds = new Set<string>();
    const collectIds = (items: any[]) => {
      for (const item of items) {
        existingIds.add(item.id);
        if (item.children) collectIds(item.children);
      }
    };
    currentLayout.pages.forEach(p => collectIds(p));
    collectIds(currentLayout.dock);

    // Find new items from imported data
    const newItems: any[] = [];
    const findNew = (items: any[]) => {
      for (const item of items) {
        if (!existingIds.has(item.id)) {
          newItems.push(item);
        }
      }
    };
    importConfirmData.pages.forEach(p => findNew(p));
    findNew(importConfirmData.dock);

    if (newItems.length > 0) {
      const merged = {
        pages: [...currentLayout.pages],
        dock: [...currentLayout.dock],
      };
      // Add new items to the last page
      const lastIdx = merged.pages.length - 1;
      merged.pages[lastIdx] = [...merged.pages[lastIdx], ...newItems];
      const { setLayout } = useLayoutStore.getState();
      setLayout(merged);
    }

    // Trigger cloud sync if logged in
    const { jwtToken: token } = useConfigStore.getState();
    if (token) {
      useLayoutStore.getState().syncLayoutOnly().catch(err => {
        console.error('Failed to sync merged layout to cloud', err);
      });
    }
    setImportConfirmData(null);
  }, [importConfirmData]);


  // Resolve display URL for the current wallpaper preview image
  const currentPreviewUrl = (() => {
    if (bg.startsWith('idb://')) return bgPreview;
    if (bg.startsWith('cos://')) {
      const cosKey = bg.slice('cos://'.length);
      const srvUrl = useConfigStore.getState().getEffectiveServerUrl();
      if (srvUrl) {
        const base = srvUrl.endsWith('/') ? srvUrl.slice(0, -1) : srvUrl;
        return `${base}/api/v1/wallpapers/cos/image?key=${encodeURIComponent(cosKey)}`;
      }
      return '';
    }
    return bg;
  })();

  // Wallpaper source options (builtin sources + dynamic ones from backend)
  // All users can see wallhaven; only the search bar is admin-only.
  // COS is shown only when the backend reports it as an available provider.
  const wpSourceOptions: { value: WallpaperSource; label: string }[] = [
    ...(backendProviders.includes('cos') ? [{ value: 'cos' as WallpaperSource, label: t('settings.wpSourceCOS') }] : []),
    { value: 'builtin', label: t('settings.wpSourceBuiltin') },
    { value: 'local', label: t('settings.wpSourceLocal') },
    { value: 'wallhaven', label: t('settings.wpSourceWallhaven') },
  ];

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none ${isFullscreen ? 'p-0' : 'p-0 sm:p-6 md:p-12'}`} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* App Window container */}
      <div
        className={`bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden transition-all duration-300 select-none ${isFullscreen ? 'w-full h-full !rounded-none !border-0' : 'w-full h-full sm:w-auto sm:h-auto sm:w-full sm:max-w-[90vw] md:max-w-6xl sm:h-[70vh] md:h-[68vh]'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Window Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          {/* Left: Mac traffic lights on desktop, spacer on mobile */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            {/* Desktop traffic lights */}
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button
                onClick={() => setIsFullscreen(f => !f)}
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
          <div className="w-full md:w-56 bg-black/20 border-b md:border-b-0 md:border-r border-white/10 px-3 py-2 md:p-6 flex flex-col gap-2 shrink-0">
            <div className="flex flex-row md:flex-col gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0 hide-scroll">
              <button
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'wallpaper' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('wallpaper')}
              >
                 {t('settings.wallpaper')}
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'system' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('system')}
              >
                 {t('settings.system')}
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-all font-semibold text-[13px] tracking-wide text-left whitespace-nowrap ${activeTab === 'ai' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                onClick={() => setActiveTab('ai')}
              >
                 {t('settings.ai')}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col p-3 sm:p-6 sm:pb-2 md:px-8 md:pt-8 md:pb-2 relative bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">

            <div ref={contentScrollRef} className={`flex-1 min-h-0 overflow-y-auto sm:pr-2 md:pr-4 ${activeTab === 'wallpaper' && wpSubTab === 'browse' && (wpSource === 'wallhaven' || wpSource === 'cos') ? 'wp-scrollbar' : 'no-scrollbar'}`}>

              {/* ============ WALLPAPER TAB ============ */}
              {activeTab === 'wallpaper' && (
                <div className="fade-in flex flex-col h-full">
                  {/* Sub-tab bar */}
                  <div className="flex gap-1 mb-4 bg-black/30 rounded-xl p-1 w-fit">
                    <button
                      type="button"
                      onClick={() => setWpSubTab('current')}
                      className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${wpSubTab === 'current' ? 'bg-white/15 text-white shadow-sm' : 'text-white/50 hover:text-white/80'}`}
                    >
                      {t('settings.wpTabCurrent')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWpSubTab('browse')}
                      className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${wpSubTab === 'browse' ? 'bg-white/15 text-white shadow-sm' : 'text-white/50 hover:text-white/80'}`}
                    >
                      {t('settings.wpTabBrowse')}
                    </button>
                  </div>

                  {/* ---- Current Wallpaper sub-tab ---- */}
                  {wpSubTab === 'current' && (
                    <div className="space-y-5 fade-in">
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">{t('settings.wpCurrentTitle')}</h3>
                        <p className="text-[12px] text-white/50 mb-4">{t('settings.wpCurrentDesc')}</p>
                      </div>

                      {/* Current wallpaper path / URL */}
                      <div>
                        <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('settings.wpCurrentPath')}</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={bg}
                            onChange={e => setBg(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { applyBackground(bg); (e.target as HTMLInputElement).blur(); } }}
                            className="flex-1 min-w-0 bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner font-mono"
                            placeholder={t('settings.wpCurrentPathPlaceholder')}
                          />
                          <button
                            type="button"
                            onClick={() => applyBackground(bg)}
                            className="px-4 py-3 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] text-black font-semibold text-[13px] transition-colors shrink-0 active:scale-95"
                          >
                            {t('settings.wpCurrentApply')}
                          </button>
                        </div>
                      </div>

                      {/* Preview image */}
                      <div>
                        <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('settings.wpCurrentPreview')}</label>
                        {currentPreviewUrl ? (
                          <div
                            className="relative group w-full max-w-md aspect-video rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all cursor-pointer shadow-lg"
                            onClick={() => setCurrentBgFullscreen(true)}
                          >
                            <img
                              src={currentPreviewUrl}
                              alt="Current wallpaper"
                              className="w-full h-full object-cover"
                            />
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 text-white/80 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                                {t('settings.wpCurrentClickToEnlarge')}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full max-w-md aspect-video rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-white/30 text-[13px]">
                            No preview
                          </div>
                        )}
                      </div>

                      {/* Upload local image */}
                      <div>
                        <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('settings.wpCurrentUpload')}</label>
                        <div className="flex flex-wrap gap-3">
                          {bgPreview && (
                            <button
                              type="button"
                              onClick={() => { const u = `idb://${IDB_BG_KEY}?t=${Date.now()}`; setBg(u); applyBackground(u); }}
                              className={`w-24 h-16 rounded-xl bg-cover bg-center border-2 transition-all shadow-md focus:outline-none ${bg.startsWith(`idb://${IDB_BG_KEY}`) ? 'border-[#72d565] ring-2 ring-[#72d565]/30 shadow-[#72d565]/20' : 'border-[#72d565]/50 hover:border-[#72d565] hover:shadow-lg'}`}
                              style={{ backgroundImage: `url("${bgPreview}")` }}
                              title="Local Custom Image"
                            />
                          )}
                          <label
                            title={t('settings.wpCurrentUpload')}
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

                  {/* ---- Browse Wallpapers sub-tab ---- */}
                  {wpSubTab === 'browse' && (
                    <div className="space-y-3 fade-in flex flex-col flex-1 min-h-0" ref={wpScrollRef}>
                      {/* Header + Source selector */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-white mb-0.5">{t('settings.wpBrowseTitle')}</h3>
                          <p className="text-[12px] text-white/50">{t('settings.wpBrowseDesc')}</p>
                        </div>

                        {/* Source dropdown */}
                        <div className="relative" ref={wpSourceRef}>
                          <button
                            type="button"
                            onClick={() => setWpSourceDropdownOpen(v => !v)}
                            className="flex items-center gap-2 bg-black/40 border border-white/10 hover:border-white/25 rounded-lg px-3 py-2 text-[13px] text-white/80 transition-colors min-w-[160px] justify-between"
                          >
                            <span className="truncate">{wpSourceOptions.find(o => o.value === wpSource)?.label}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform shrink-0 ${wpSourceDropdownOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                          </button>
                          {wpSourceDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl shadow-black/40 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                              {wpSourceOptions.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => { setWpSource(opt.value); setWpSourceDropdownOpen(false); }}
                                  className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                                    wpSource === opt.value
                                      ? 'text-[#72d565] bg-[#72d565]/10'
                                      : 'text-white/70 hover:text-white hover:bg-white/8'
                                  }`}
                                >
                                  {wpSource === opt.value && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="inline mr-1.5 -mt-0.5"><path d="M20 6 9 17l-5-5"/></svg>
                                  )}
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* === Source: COS (Tencent Cloud Object Storage) === */}
                      {wpSource === 'cos' && (
                        <>
                          {/* Error */}
                          {cosError && (
                            <div className="text-red-400 text-[12px] bg-red-500/10 rounded-lg px-3 py-2">
                              {cosError}
                            </div>
                          )}

                          {/* Loading */}
                          {cosLoading && (
                            <div className="flex justify-center py-8">
                              <svg className="animate-spin w-6 h-6 text-white/50" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            </div>
                          )}

                          {/* COS Wallpaper grid */}
                          {!cosLoading && cosResult && cosResult.wallpapers.length > 0 && (
                            <>
                            <div className={`grid gap-3 sm:gap-4 content-start ${isFullscreen ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4'}`}>
                              {cosMobileItems.map(item => (
                                <div
                                  key={item.id}
                                  className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-[#72d565]/50 transition-all"
                                  onClick={() => setCosPreviewItem(item)}
                                >
                                  <div className={isFullscreen ? 'w-full pb-[72%] sm:pb-[68%]' : 'w-full pb-[72%] sm:pb-[66%]'} />
                                  <img
                                    src={item.thumbSmall}
                                    alt={item.id.split('/').pop() || item.id}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                  {/* Hover overlay */}
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <div className="p-2 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
                                    </div>
                                  </div>
                                  {/* File name badge */}
                                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-gradient-to-t from-black/60 to-transparent">
                                    <p className="text-[9px] text-white/60 truncate">{item.id.split('/').pop()}</p>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Infinite scroll sentinel & loading indicator */}
                            <div ref={cosSentinelRef} className="flex flex-col items-center py-3 gap-2">
                              {cosLoadingMore && (
                                <svg className="animate-spin w-5 h-5 text-white/40" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              )}
                              {!cosHasMore && cosMobileItems.length > 0 && (
                                <span className="text-[11px] text-white/30">{t('settings.wpNoMore')}</span>
                              )}
                            </div>
                            </>
                          )}

                          {/* Empty state */}
                          {!cosLoading && cosResult && cosResult.wallpapers.length === 0 && (
                            <div className="text-center text-white/40 py-8 text-[13px]">
                              {t('settings.wpCosEmpty')}
                            </div>
                          )}
                        </>
                      )}

                      {/* === Source: Built-in wallpapers === */}
                      {wpSource === 'builtin' && (
                        <div className="space-y-3 fade-in">
                          <p className="text-[12px] text-white/50">{t('settings.wpBuiltinDesc')}</p>
                          <div className="flex flex-wrap gap-3">
                            {[
                              { url: builtinBgWebp, title: 'CatHeadTab Default' },
                            ].map(item => (
                              <button
                                key={item.url}
                                type="button"
                                onClick={() => { setBg(item.url); applyBackground(item.url); }}
                                className={`w-28 h-20 sm:w-32 sm:h-[5.5rem] rounded-xl bg-cover bg-center border-2 transition-all shadow-md focus:outline-none ${bg === item.url ? 'border-[#72d565] ring-2 ring-[#72d565]/30 shadow-[#72d565]/20' : 'border-white/20 hover:border-white/50 hover:shadow-lg'}`}
                                style={{ backgroundImage: `url("${item.url}")` }}
                                title={item.title}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* === Source: Local folder === */}
                      {wpSource === 'local' && (
                        <div className="space-y-4 fade-in">
                          {/* Folder picker bar */}
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={handleSelectFolder}
                              disabled={localLoading}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#72d565] hover:bg-[#5bb84f] text-black font-semibold text-[13px] transition-colors disabled:opacity-50"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                              </svg>
                              {t('settings.wpLocalSelectFolder')}
                            </button>
                            {localFolderName && (
                              <span className="text-[12px] text-white/50 truncate">
                                📂 {localFolderName}
                                <span className="ml-2 text-white/30">({localFileHandles.length} {t('settings.wpLocalImageCount')})</span>
                              </span>
                            )}
                          </div>

                          {/* Loading */}
                          {localLoading && (
                            <div className="flex items-center justify-center py-12">
                              <svg className="animate-spin w-8 h-8 text-white/60" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            </div>
                          )}

                          {/* Empty state — no folder selected yet */}
                          {!localLoading && localFileHandles.length === 0 && !localFolderName && (
                            <div className="flex flex-col items-center justify-center py-12">
                              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-white/15 mb-4">
                                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                              </svg>
                              <p className="text-[13px] text-white/30 text-center">{t('settings.wpLocalEmptyHint')}</p>
                            </div>
                          )}

                          {/* Empty state — folder selected but no images */}
                          {!localLoading && localFileHandles.length === 0 && localFolderName && (
                            <div className="flex flex-col items-center justify-center py-12">
                              <p className="text-[13px] text-white/40 text-center">{t('settings.wpLocalNoImages')}</p>
                            </div>
                          )}

                          {/* Page loading indicator */}
                          {localPageLoading && (
                            <div className="flex items-center justify-center py-8">
                              <svg className="animate-spin w-6 h-6 text-white/50" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            </div>
                          )}

                          {/* Image grid — current page only (thumbnails for fast rendering) */}
                          {!localLoading && !localPageLoading && localPageImages.length > 0 && (
                            <div className={`grid gap-3 sm:gap-4 content-start ${isFullscreen ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4'}`}>
                              {localPageImages.map(img => (
                                <div
                                  key={img.name}
                                  className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-[#72d565]/50 transition-all"
                                  onClick={() => openLocalPreview(img.name, img.handle)}
                                >
                                  <div className={isFullscreen ? 'w-full pb-[72%] sm:pb-[68%]' : 'w-full pb-[72%] sm:pb-[66%]'} />
                                  <img
                                    src={img.thumbUrl}
                                    alt={img.name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                  />
                                  {/* Hover overlay */}
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 text-white/80 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                                      {t('settings.wpLocalPreview')}
                                    </div>
                                  </div>
                                  {/* File name badge */}
                                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-gradient-to-t from-black/60 to-transparent">
                                    <p className="text-[9px] text-white/60 truncate">{img.name}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Pagination controls */}
                          {!localLoading && localFileHandles.length > LOCAL_PAGE_SIZE && (
                            <div className="flex items-center justify-center gap-3 pt-2">
                              <button
                                type="button"
                                onClick={() => setLocalPage(p => Math.max(0, p - 1))}
                                disabled={localPage === 0 || localPageLoading}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-[12px] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                ← {t('settings.wpLocalPrev')}
                              </button>
                              <span className="text-[12px] text-white/40 min-w-[80px] text-center">
                                {localPage + 1} / {localTotalPages}
                              </span>
                              <button
                                type="button"
                                onClick={() => setLocalPage(p => Math.min(localTotalPages - 1, p + 1))}
                                disabled={localPage >= localTotalPages - 1 || localPageLoading}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-[12px] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                {t('settings.wpLocalNext')} →
                              </button>
                            </div>
                          )}

                          {/* Compressing indicator */}
                          {isCompressing && (
                            <div className="flex items-center justify-center gap-2 py-3">
                              <svg className="animate-spin w-4 h-4 text-[#72d565]" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span className="text-[12px] text-white/50">{t('settings.wpLocalApplying')}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* === Source: Wallhaven === */}
                      {wpSource === 'wallhaven' && (
                        <>
                          {/* Search bar — admin only */}
                          {isAdmin && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={wpQuery}
                              onChange={e => setWpQuery(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleWpSearch()}
                              className="flex-1 bg-black/40 border border-white/10 hover:border-white/30 rounded-lg px-3 py-2 sm:py-1.5 text-[13px] text-white focus:outline-none focus:border-[#72d565]/50 transition-all"
                              placeholder={t('settings.wpSearchPlaceholder')}
                            />
                            <button
                              type="button"
                              onClick={handleWpSearch}
                              disabled={wpLoading}
                              className="px-4 py-2 sm:py-1.5 rounded-lg bg-[#72d565] hover:bg-[#5bb84f] text-black font-semibold text-[13px] transition-colors disabled:opacity-50"
                            >
                              {wpLoading ? '...' : t('settings.wpSearch')}
                            </button>
                          </div>
                          )}

                          {/* Filters row */}
                          <div className="flex flex-wrap gap-2.5 sm:gap-2 items-center">
                            {/* Sorting - custom dropdown */}
                            <div className="relative" ref={wpSortRef}>
                              <button
                                type="button"
                                onClick={() => setWpSortOpen(v => !v)}
                                className="flex items-center gap-1.5 bg-black/40 border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 sm:px-2.5 sm:py-1 text-[12px] text-white/80 cursor-pointer transition-colors"
                              >
                                <span>
                                  {({
                                    toplist: t('settings.wpSortToplist'),
                                    date_added: t('settings.wpSortLatest'),
                                    random: t('settings.wpSortRandom'),
                                    views: t('settings.wpSortViews'),
                                    favorites: t('settings.wpSortFavorites'),
                                    relevance: t('settings.wpSortToplist'),
                                  } as Record<WallpaperSorting, string>)[wpSorting]}
                                </span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${wpSortOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                              </button>
                              {wpSortOpen && (
                                <div className="absolute top-full left-0 mt-1 z-50 min-w-[120px] bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl shadow-black/40 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                                  {([
                                    { value: 'toplist', label: t('settings.wpSortToplist') },
                                    { value: 'date_added', label: t('settings.wpSortLatest') },
                                    { value: 'random', label: t('settings.wpSortRandom') },
                                    { value: 'views', label: t('settings.wpSortViews') },
                                    { value: 'favorites', label: t('settings.wpSortFavorites') },
                                  ] as { value: WallpaperSorting; label: string }[]).map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => { setWpSorting(opt.value); setWpSortOpen(false); }}
                                      className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                                        wpSorting === opt.value
                                          ? 'text-[#72d565] bg-[#72d565]/10'
                                          : 'text-white/70 hover:text-white hover:bg-white/8'
                                      }`}
                                    >
                                      {wpSorting === opt.value && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="inline mr-1.5 -mt-0.5"><path d="M20 6 9 17l-5-5"/></svg>
                                      )}
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Category toggles */}
                            <div className="flex gap-1.5 sm:gap-1 ml-auto">
                              {(['general', 'anime', 'people'] as WallpaperCategoryFilter[]).map(cat => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => toggleWpCategory(cat)}
                                  className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-[12px] sm:text-[11px] font-medium transition-all ${wpCategories.has(cat) ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
                                >
                                  {t(`settings.wpCat_${cat}`)}
                                </button>
                              ))}
                            </div>

                            {/* Purity toggles — only shown when backend has API key and allows multiple purity levels */}
                            {wpHasApiKey && wpAllowedPurity.length > 1 && (
                              <div className="flex gap-1.5 sm:gap-1 items-center">
                                <span className="text-[11px] text-white/30 mr-0.5">{t('settings.wpPurityLabel')}:</span>
                                {wpAllowedPurity.map(p => {
                                  const colorMap: Record<WallpaperPurityFilter, { active: string; inactive: string }> = {
                                    sfw: { active: 'bg-green-500/30 text-green-300 border-green-500/40', inactive: 'bg-white/5 text-white/40 hover:text-white/60 border-transparent' },
                                    sketchy: { active: 'bg-yellow-500/30 text-yellow-300 border-yellow-500/40', inactive: 'bg-white/5 text-white/40 hover:text-white/60 border-transparent' },
                                    nsfw: { active: 'bg-red-500/30 text-red-300 border-red-500/40', inactive: 'bg-white/5 text-white/40 hover:text-white/60 border-transparent' },
                                  };
                                  const isActive = wpPurity.has(p);
                                  return (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => toggleWpPurity(p)}
                                      className={`px-2.5 py-1 sm:px-2 sm:py-0.5 rounded-md text-[12px] sm:text-[11px] font-medium transition-all border ${isActive ? colorMap[p].active : colorMap[p].inactive}`}
                                    >
                                      {t(`settings.wpPurity_${p}`)}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Error */}
                          {wpError && (
                            <div className="text-red-400 text-[12px] bg-red-500/10 rounded-lg px-3 py-2">
                              {wpError}
                            </div>
                          )}

                          {/* Loading */}
                          {wpLoading && (
                            <div className="flex justify-center py-8">
                              <svg className="animate-spin w-6 h-6 text-white/50" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            </div>
                          )}

                          {/* Wallpaper grid */}
                          {!wpLoading && wpResult && wpResult.wallpapers.length > 0 && (
                            <>
                            <div className={`grid gap-3 sm:gap-4 content-start ${isFullscreen ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4'}`}>
                              {wpMobileItems.map(item => (
                                <div
                                  key={item.id}
                                  className={`relative group cursor-pointer rounded-lg overflow-hidden border ${purityBorderClass(item.purity)} transition-all`}
                                  onClick={() => setWpPreviewItem(item)}
                                >
                                  <div className={isFullscreen ? 'w-full pb-[72%] sm:pb-[68%]' : 'w-full pb-[72%] sm:pb-[66%]'} />
                                  <img
                                    src={item.thumbSmall}
                                    alt={`Wallpaper ${item.id}`}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                  {/* Purity badge (sketchy/nsfw only) */}
                                  {item.purity !== 'sfw' && (
                                    <div className={`absolute top-0.5 left-0.5 text-[8px] font-bold px-1 rounded ${item.purity === 'nsfw' ? 'bg-red-500/80 text-white' : 'bg-yellow-500/80 text-black'}`}>
                                      {item.purity === 'nsfw' ? 'NSFW' : 'Sketchy'}
                                    </div>
                                  )}
                                  {/* Hover overlay */}
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <div className="p-2 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
                                    </div>
                                  </div>
                                  {/* Resolution badge */}
                                  <div className="absolute bottom-0.5 right-0.5 text-[9px] text-white/60 bg-black/50 px-1 rounded">
                                    {item.width}×{item.height}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Infinite scroll sentinel & loading indicator */}
                            <div ref={wpSentinelRef} className="flex flex-col items-center py-3 gap-2">
                              {wpLoadingMore && (
                                <svg className="animate-spin w-5 h-5 text-white/40" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              )}
                              {!wpHasMore && wpMobileItems.length > 0 && (
                                <span className="text-[11px] text-white/30">{t('settings.wpNoMore')}</span>
                              )}
                            </div>
                            </>
                          )}

                          {/* Empty state */}
                          {!wpLoading && wpResult && wpResult.wallpapers.length === 0 && (
                            <div className="text-center text-white/40 py-8 text-[13px]">
                              {t('settings.wpNoResults')}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ============ SYSTEM TAB ============ */}
              {activeTab === 'system' && (
                <div className="space-y-6 fade-in">
                  {/* Language section */}
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.langTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-3">{t('settings.langDesc')}</p>

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

                  {/* Divider */}
                  <div className="border-t border-white/5" />

                  {/* Lock screen timeout section */}
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.lockTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-3">{t('settings.lockDesc')}</p>

                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('settings.lockLabel')}</label>
                    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                      {([
                        { ms: 1 * 60 * 1000, label: 'settings.lock1min' },
                        { ms: 3 * 60 * 1000, label: 'settings.lock3min' },
                        { ms: 5 * 60 * 1000, label: 'settings.lock5min' },
                        { ms: 10 * 60 * 1000, label: 'settings.lock10min' },
                        { ms: 30 * 60 * 1000, label: 'settings.lock30min' },
                        { ms: 0, label: 'settings.lockNever' },
                      ] as const).map((opt, idx, arr) => (
                        <button
                          key={opt.ms}
                          className={`w-full px-5 py-4 text-[14px] font-medium flex justify-between ${idx < arr.length - 1 ? 'border-b border-white/5' : ''} ${lockIdleTimeout === opt.ms ? 'bg-white/5 text-white/90' : 'text-white/50 hover:bg-white/5 hover:text-white/90'}`}
                          onClick={() => {
                            setLockIdleTimeout(opt.ms);
                            // Sync to cloud if logged in
                            if (jwtToken) {
                              client.put('/api/v1/user/preferences', { lockIdleTimeout: opt.ms }).catch(err => {
                                console.error('Failed to sync lockIdleTimeout to cloud', err);
                              });
                            }
                          }}
                        >
                          {t(opt.label)}
                          {lockIdleTimeout === opt.ms && <span className="text-[#72d565]">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/5" />

                  {/* Server connection section */}
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.sysTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.sysDesc')}</p>

                    <label className="block text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2 ml-1">{t('settings.sysLabel')}</label>
                    {isEnvConfigured ? (
                      <div className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3.5 text-[14px] text-white/50 cursor-not-allowed select-all">
                        {ENV_API_URL}
                        <span className="ml-2 text-[11px] text-[#72d565]/70 font-medium">({t('settings.sysEnvConfigured')})</span>
                      </div>
                    ) : (
                      <input
                        type="url"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onBlur={() => applyServerUrl(url)}
                        onKeyDown={e => { if (e.key === 'Enter') { applyServerUrl(url); (e.target as HTMLInputElement).blur(); } }}
                        className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#72d565]/50 focus:bg-black/60 transition-all shadow-inner"
                        placeholder="http://localhost:8080"
                      />
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/5" />

                  {/* Layout Import/Export section */}
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{t('settings.importExportTitle')}</h3>
                    <p className="text-[13px] text-white/50 mb-5">{t('settings.importExportDesc')}</p>

                    <div className="flex flex-wrap gap-3">
                      {/* Export button */}
                      <button
                        type="button"
                        onClick={handleExportLayout}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] text-black font-semibold text-[13px] transition-colors active:scale-95 shadow-md"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        {t('settings.exportLayout')}
                      </button>

                      {/* Import button */}
                      <button
                        type="button"
                        onClick={() => importFileRef.current?.click()}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-semibold text-[13px] transition-colors active:scale-95 border border-white/10 shadow-md"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        {t('settings.importLayout')}
                      </button>
                      <input
                        ref={importFileRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleImportFile}
                      />
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/5" />

                  {/* Reset to default layout */}
                  <div>
                    <h4 className="text-[13px] font-semibold text-red-400/70 mb-2">{t('settings.dangerZone')}</h4>
                    <ResetLayoutButton language={language} />
                  </div>
                </div>
              )}

              {/* ============ AI TAB ============ */}
              {activeTab === 'ai' && (
                <div className="space-y-6 fade-in">
                  <AISettingsSection />
                </div>
              )}
            </div>

            {/* Scroll to top floating button */}
            {showScrollTop && activeTab === 'wallpaper' && wpSubTab === 'browse' && (wpSource === 'wallhaven' || wpSource === 'cos') && (
              <button
                type="button"
                onClick={scrollToTop}
                className="absolute bottom-4 right-12 md:bottom-5 md:right-14 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 hover:border-white/30 text-white/70 hover:text-white flex items-center justify-center shadow-lg backdrop-blur-sm transition-all active:scale-90 z-10 animate-fadeIn"
                title="Back to top"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 15-6-6-6 6"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* === Fullscreen wallpaper preview overlay (from Wallhaven) === */}
      {wpPreviewItem && (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-md pointer-events-auto"
          onClick={() => setWpPreviewItem(null)}
        >
          {/* Top bar with info & close */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[11px] sm:text-[13px] text-white/50 truncate mr-3">
              {purityBadge(wpPreviewItem.purity) && (
                <span className={`text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded ${purityBadge(wpPreviewItem.purity)!.color}`}>
                  {purityBadge(wpPreviewItem.purity)!.label}
                </span>
              )}
              <span>{wpPreviewItem.width}×{wpPreviewItem.height} · {wpPreviewItem.fileType} · ❤ {wpPreviewItem.favorites} · 👁 {wpPreviewItem.views}</span>
            </div>
            <button
              type="button"
              onClick={() => setWpPreviewItem(null)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          {/* Full image area */}
          <div className="flex-1 flex items-center justify-center px-2 sm:px-4 min-h-0" onClick={e => e.stopPropagation()}>
            <img
              src={wpPreviewItem.fullUrl}
              alt={`Preview ${wpPreviewItem.id}`}
              width={wpPreviewItem.width}
              height={wpPreviewItem.height}
              style={{ aspectRatio: `${wpPreviewItem.width} / ${wpPreviewItem.height}` }}
              className="max-w-full max-h-full rounded-lg shadow-2xl object-contain opacity-0 transition-opacity duration-300"
              onLoad={e => { (e.target as HTMLImageElement).classList.remove('opacity-0'); }}
            />
          </div>

          {/* Bottom action bar */}
          <div className="flex items-center justify-center gap-3 px-4 py-4 sm:py-5 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => handleSelectWallpaper(wpPreviewItem)}
              className="px-6 sm:px-8 py-2.5 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] text-black font-bold text-[13px] sm:text-[14px] transition-colors shadow-lg shadow-[#72d565]/20 active:scale-95"
            >
              {t('settings.wpUseThis')}
            </button>
            <button
              type="button"
              onClick={() => {
                const a = document.createElement('a');
                a.href = wpPreviewItem.fullUrl;
                a.download = `wallpaper-${wpPreviewItem.id}.${wpPreviewItem.fileType || 'jpg'}`;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.click();
              }}
              className="px-5 sm:px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-medium text-[13px] sm:text-[14px] transition-colors active:scale-95 flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {t('settings.wpDownload')}
            </button>
            <button
              type="button"
              onClick={() => setWpPreviewItem(null)}
              className="px-5 sm:px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-medium text-[13px] sm:text-[14px] transition-colors active:scale-95"
            >
              {t('settings.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* === Fullscreen current wallpaper preview overlay === */}

      {/* === COS wallpaper preview overlay === */}
      {cosPreviewItem && (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-md pointer-events-auto"
          onClick={() => setCosPreviewItem(null)}
        >
          {/* Top bar with info & close */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[11px] sm:text-[13px] text-white/50 truncate mr-3">
              <span>{cosPreviewItem.id.split('/').pop()} · {cosPreviewItem.fileType}</span>
            </div>
            <button
              type="button"
              onClick={() => setCosPreviewItem(null)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          {/* Full image area */}
          <div className="flex-1 flex items-center justify-center px-2 sm:px-4 min-h-0" onClick={e => e.stopPropagation()}>
            <img
              src={cosPreviewItem.fullUrl}
              alt={cosPreviewItem.id.split('/').pop() || cosPreviewItem.id}
              className="max-w-full max-h-full rounded-lg shadow-2xl object-contain opacity-0 transition-opacity duration-300"
              onLoad={e => { (e.target as HTMLImageElement).classList.remove('opacity-0'); }}
            />
          </div>

          {/* Bottom action bar */}
          <div className="flex items-center justify-center gap-3 px-4 py-4 sm:py-5 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => handleSelectCosWallpaper(cosPreviewItem)}
              className="px-6 sm:px-8 py-2.5 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] text-black font-bold text-[13px] sm:text-[14px] transition-colors shadow-lg shadow-[#72d565]/20 active:scale-95"
            >
              {t('settings.wpUseThis')}
            </button>
            <button
              type="button"
              onClick={() => setCosPreviewItem(null)}
              className="px-5 sm:px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-medium text-[13px] sm:text-[14px] transition-colors active:scale-95"
            >
              {t('settings.cancel')}
            </button>
          </div>
        </div>
      )}
      {currentBgFullscreen && currentPreviewUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md pointer-events-auto"
          onClick={() => setCurrentBgFullscreen(false)}
        >
          <button
            type="button"
            onClick={() => setCurrentBgFullscreen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors z-10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <img
            src={currentPreviewUrl}
            alt="Wallpaper fullscreen preview"
            className="max-w-[95vw] max-h-[95vh] rounded-lg shadow-2xl object-contain opacity-0 transition-opacity duration-300"
            onClick={e => e.stopPropagation()}
            onLoad={e => { (e.target as HTMLImageElement).classList.remove('opacity-0'); }}
          />
        </div>
      )}

      {/* === Fullscreen local image preview overlay === */}
      {localPreview && (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-md pointer-events-auto"
          onClick={closeLocalPreview}
        >
          {/* Top bar with file name & close */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-[11px] sm:text-[13px] text-white/50 truncate mr-3 font-mono">
              {localPreview.name}
            </span>
            <button
              type="button"
              onClick={closeLocalPreview}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          {/* Full image area */}
          <div className="flex-1 flex items-center justify-center px-2 sm:px-4 min-h-0" onClick={e => e.stopPropagation()}>
            {localPreviewLoading || !localPreview.url ? (
              <svg className="animate-spin w-8 h-8 text-white/40" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <img
                src={localPreview.url}
                alt={localPreview.name}
                className="max-w-full max-h-full rounded-lg shadow-2xl object-contain opacity-0 transition-opacity duration-300"
                onLoad={e => { (e.target as HTMLImageElement).classList.remove('opacity-0'); }}
              />
            )}
          </div>

          {/* Bottom action bar */}
          <div className="flex items-center justify-center gap-3 px-4 py-4 sm:py-5 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => handleLocalImageSelect(localPreview.handle)}
              disabled={isCompressing}
              className="px-6 sm:px-8 py-2.5 rounded-xl bg-[#72d565] hover:bg-[#5bb84f] text-black font-bold text-[13px] sm:text-[14px] transition-colors shadow-lg shadow-[#72d565]/20 active:scale-95 disabled:opacity-50"
            >
              {isCompressing ? t('settings.wpLocalApplying') : t('settings.wpLocalApply')}
            </button>
            <button
              type="button"
              onClick={closeLocalPreview}
              className="px-5 sm:px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-medium text-[13px] sm:text-[14px] transition-colors active:scale-95"
            >
              {t('settings.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* === Import confirm dialog (Overwrite / Merge) === */}

      {importConfirmData && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto"
          onClick={() => setImportConfirmData(null)}
        >
          <div
            className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md mx-4 p-6 animate-scaleIn"
            onClick={e => e.stopPropagation()}
          >
            {/* Title */}
            <h3 className="text-lg font-bold text-white mb-1">{t('settings.importConfirmTitle')}</h3>
            <p className="text-[13px] text-white/50 mb-5">
              {importConfirmData.pages.flat().length + importConfirmData.dock.length} items
            </p>

            {/* Options */}
            <div className="space-y-3">
              {/* Overwrite option */}
              <button
                type="button"
                onClick={handleImportOverwrite}
                className="w-full flex items-start gap-3 p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 group-hover:bg-red-500/30 transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                </div>
                <div>
                  <span className="block text-[14px] font-semibold text-red-300">{t('settings.importOverwrite')}</span>
                  <span className="block text-[12px] text-white/40 mt-0.5">{t('settings.importOverwriteDesc')}</span>
                </div>
              </button>

              {/* Merge option */}
              <button
                type="button"
                onClick={handleImportMerge}
                className="w-full flex items-start gap-3 p-4 rounded-xl bg-[#72d565]/10 hover:bg-[#72d565]/20 border border-[#72d565]/20 hover:border-[#72d565]/40 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#72d565]/20 flex items-center justify-center shrink-0 group-hover:bg-[#72d565]/30 transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#72d565]">
                    <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 009 9"/>
                  </svg>
                </div>
                <div>
                  <span className="block text-[14px] font-semibold text-[#72d565]">{t('settings.importMerge')}</span>
                  <span className="block text-[12px] text-white/40 mt-0.5">{t('settings.importMergeDesc')}</span>
                </div>
              </button>
            </div>

            {/* Cancel */}
            <button
              type="button"
              onClick={() => setImportConfirmData(null)}
              className="w-full mt-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-[13px] font-medium transition-colors"
            >
              {t('settings.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};