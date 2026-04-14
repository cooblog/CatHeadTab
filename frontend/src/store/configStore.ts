import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import builtinBgWebp from '../assets/bg.webp'

/**
 * ENV_API_URL is the backend API base URL injected at build time via the
 * `VITE_API_URL` environment variable. When set, it takes precedence over
 * the user-configured serverUrl and the server-address input is hidden.
 *
 * Example `.env`:
 *   VITE_API_URL=https://api.catheadtab.com
 */
export const ENV_API_URL: string = (import.meta.env.VITE_API_URL as string || '').replace(/\/+$/, '');

/**
 * Whether the backend API URL is pre-configured via environment variable.
 * When true, users don't need to manually enter a server address.
 */
export const isEnvConfigured: boolean = !!ENV_API_URL;

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  username: string;
  email: string;
  email_verified: boolean;
  avatar_url: string;
  has_password: boolean;
  user_id: string;
  role: UserRole;
}

/** Per-provider AI configuration. API keys are stored separately per provider. */
export interface AIProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface ConfigState {
  serverUrl: string
  jwtToken: string | null
  language: 'zh' | 'en'
  backgroundImage: string
  userProfile: UserProfile | null
  /** Whether the lock screen is currently shown. */
  isLocked: boolean
  /** Idle timeout before auto-lock (milliseconds). 0 means never. */
  lockIdleTimeout: number
  /** Timestamp (ms) when the user last resolved a sync conflict. Used to suppress re-prompting after refresh. */
  lastSyncResolvedAt: number
  /** Timestamp (ms) when local data (layout/preferences) was last modified by the user. */
  lastLocalModifiedAt: number
  /** Currently active AI provider key (e.g. "openai", "deepseek"). */
  aiActiveProvider: string
  /** Per-provider configs. Each provider has its own apiKey, baseUrl, model. */
  aiProviderConfigs: Record<string, AIProviderConfig>
  setServerUrl: (url: string) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setJwtToken: (token: string | null) => void
  setBackgroundImage: (url: string) => void
  setUserProfile: (profile: UserProfile | null) => void
  setLocked: (locked: boolean) => void
  setLockIdleTimeout: (ms: number) => void
  setLastSyncResolvedAt: (ts: number) => void
  setLastLocalModifiedAt: (ts: number) => void
  /** Set the active provider and optionally update its config. */
  setAIProvider: (providerKey: string, config?: Partial<AIProviderConfig>) => void
  /** Update config for a specific provider without switching active. */
  updateAIProviderConfig: (providerKey: string, config: Partial<AIProviderConfig>) => void
  /** Get the currently active provider's config. */
  getActiveAIConfig: () => { provider: string } & AIProviderConfig
  /** Convenience: set lastLocalModifiedAt to Date.now(). Call when user changes layout/preferences. */
  markLocalModified: () => void
  logout: () => void
  isConfigured: () => boolean
  /** Returns the effective API URL (env variable takes precedence over user input). */
  getEffectiveServerUrl: () => string
}

// Custom storage combining localStorage (web fallback) and chrome.storage if available
export const customStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(name);
      return (data[name] as string) || null;
    }
    return localStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [name]: value });
    } else {
      localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove(name);
    } else {
      localStorage.removeItem(name);
    }
  },
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      serverUrl: '',
      jwtToken: null,
      language: 'zh',
      backgroundImage: builtinBgWebp,
      userProfile: null,
      isLocked: false,
      lockIdleTimeout: 0,
      lastSyncResolvedAt: 0,
      lastLocalModifiedAt: 0,
      aiActiveProvider: '',
      aiProviderConfigs: {},
      setServerUrl: (url) => set({ serverUrl: url }),
      setLanguage: (lang) => set({ language: lang }),
      setJwtToken: (token) => set({ jwtToken: token }),
      setBackgroundImage: (url) => set({ backgroundImage: url }),
      setUserProfile: (profile) => set({ userProfile: profile }),
      setLocked: (locked) => set({ isLocked: locked }),
      setLockIdleTimeout: (ms) => set({ lockIdleTimeout: ms }),
      setLastSyncResolvedAt: (ts) => set({ lastSyncResolvedAt: ts }),
      setLastLocalModifiedAt: (ts) => set({ lastLocalModifiedAt: ts }),
      setAIProvider: (providerKey, config) => set((state) => {
        const existing = state.aiProviderConfigs[providerKey] || { apiKey: '', baseUrl: '', model: '' };
        return {
          aiActiveProvider: providerKey,
          aiProviderConfigs: {
            ...state.aiProviderConfigs,
            [providerKey]: { ...existing, ...config },
          },
        };
      }),
      updateAIProviderConfig: (providerKey, config) => set((state) => {
        const existing = state.aiProviderConfigs[providerKey] || { apiKey: '', baseUrl: '', model: '' };
        return {
          aiProviderConfigs: {
            ...state.aiProviderConfigs,
            [providerKey]: { ...existing, ...config },
          },
        };
      }),
      getActiveAIConfig: () => {
        const state = get();
        const cfg = state.aiProviderConfigs[state.aiActiveProvider] || { apiKey: '', baseUrl: '', model: '' };
        return { provider: state.aiActiveProvider, ...cfg };
      },
      markLocalModified: () => set({ lastLocalModifiedAt: Date.now() }),
      logout: () => set({ jwtToken: null, userProfile: null }),
      isConfigured: () => !!(ENV_API_URL || get().serverUrl),
      getEffectiveServerUrl: () => ENV_API_URL || get().serverUrl,
    }),
    {
      name: 'catheadtab-config',
      storage: createJSONStorage(() => customStorage),
      // AI config is persisted locally but NEVER included in cloud sync
      // (syncPreferencesToCloud only sends backgroundImage & lockIdleTimeout)
    }
  )
)
