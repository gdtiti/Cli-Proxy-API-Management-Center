import type { Language } from '@/types';
import { STORAGE_KEY_LANGUAGE } from '@/utils/constants';

const parseStoredLanguage = (value: string): Language | null => {
  try {
    const parsed = JSON.parse(value);
    const candidate = parsed?.state?.language ?? parsed?.language ?? parsed;
    if (candidate === 'zh-CN' || candidate === 'en') {
      return candidate;
    }
  } catch {
    if (value === 'zh-CN' || value === 'en') {
      return value;
    }
  }
  return null;
};

const getStoredLanguage = (): Language | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LANGUAGE);
    if (!stored) {
      return null;
    }
    return parseStoredLanguage(stored);
  } catch {
    return null;
  }
};

export const getInitialLanguage = (): Language => getStoredLanguage() ?? 'zh-CN';
