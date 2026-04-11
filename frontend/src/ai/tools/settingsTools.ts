import { defineTool } from './schema';
import { useConfigStore } from '../../store/configStore';

export const changeWallpaper = defineTool<{ url: string }>({
  description: 'Change the desktop wallpaper to a URL.',
  schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
  execute: async ({ url }) => {
    if (!url.startsWith('http')) return { success: false, message: 'URL must start with http.' };
    useConfigStore.getState().setBackgroundImage(url);
    return { success: true, message: 'Wallpaper changed.' };
  },
});

export const changeLanguage = defineTool<{ language: 'zh' | 'en' }>({
  description: 'Switch the interface language.',
  schema: { type: 'object', required: ['language'], properties: { language: { type: 'string', enum: ['zh', 'en'] } } },
  execute: async ({ language }) => {
    useConfigStore.getState().setLanguage(language);
    return { success: true, message: `Switched to ${language === 'zh' ? 'Chinese' : 'English'}.` };
  },
});

export const getSystemInfo = defineTool<Record<string, never>>({
  description: 'Get current system configuration.',
  schema: { type: 'object', properties: {} },
  execute: async () => {
    const s = useConfigStore.getState();
    return { language: s.language, serverConnected: s.isConfigured(), loggedIn: !!s.jwtToken, username: s.userProfile?.username || null };
  },
});
