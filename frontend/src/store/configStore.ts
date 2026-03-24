import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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

export interface UserProfile {
  username: string;
  email: string;
  email_verified: boolean;
  avatar_url: string;
  has_password: boolean;
  user_id: string;
}

interface ConfigState {
  serverUrl: string
  jwtToken: string | null
  language: 'zh' | 'en'
  backgroundImage: string
  userProfile: UserProfile | null
  setServerUrl: (url: string) => void
  setLanguage: (lang: 'zh' | 'en') => void
  setJwtToken: (token: string | null) => void
  setBackgroundImage: (url: string) => void
  setUserProfile: (profile: UserProfile | null) => void
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
      backgroundImage: 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?q=80&w=2070&auto=format&fit=crop',
      userProfile: null,
      setServerUrl: (url) => set({ serverUrl: url }),
      setLanguage: (lang) => set({ language: lang }),
      setJwtToken: (token) => set({ jwtToken: token }),
      setBackgroundImage: (url) => set({ backgroundImage: url }),
      setUserProfile: (profile) => set({ userProfile: profile }),
      logout: () => set({ jwtToken: null, userProfile: null }),
      isConfigured: () => !!(ENV_API_URL || get().serverUrl),
      getEffectiveServerUrl: () => ENV_API_URL || get().serverUrl,
    }),
    {
      name: 'catheadtab-config',
      storage: createJSONStorage(() => customStorage),
    }
  )
)
