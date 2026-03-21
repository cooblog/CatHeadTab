import { useConfigStore } from '../store/configStore';
import { en } from './locales/en';
import { zh } from './locales/zh';

export type TranslationKeys = keyof typeof en;

const locales: Record<string, typeof en> = { en, zh };

export const useTranslation = () => {
  const { language } = useConfigStore();
  
  const targetDict = locales[language] || locales.zh;

  const t = (key: TranslationKeys, params?: Record<string, string>) => {
    let text = targetDict[key] || en[key] || key;
    if (params) {
      Object.keys(params).forEach(p => {
        text = text.replace(`{${p}}`, params[p]);
      });
    }
    return text;
  };

  return { t, language };
};
