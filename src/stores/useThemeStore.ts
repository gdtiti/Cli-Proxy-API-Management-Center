/**
 * 主题状态管理
 * 从原项目 src/modules/theme.js 迁移
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, ThemeFamily } from '@/types';
import { STORAGE_KEY_THEME } from '@/utils/constants';

type ResolvedTheme = 'light' | 'dark';
type AppliedTheme = ResolvedTheme | 'white';

interface ThemeState {
  theme: Theme;
  themeFamily: ThemeFamily;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  setThemeFamily: (themeFamily: ThemeFamily) => void;
  cycleTheme: () => void;
  initializeTheme: () => () => void;
}

const DEFAULT_THEME_FAMILY: ThemeFamily = 'official';

const getSystemTheme = (): ResolvedTheme => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const getAvailableThemes = (themeFamily: ThemeFamily): Theme[] => {
  return themeFamily === 'dear7575'
    ? ['light', 'dark', 'auto']
    : ['light', 'white', 'dark', 'auto'];
};

const normalizeThemeForFamily = (theme: Theme, themeFamily: ThemeFamily): Theme => {
  if (themeFamily === 'dear7575' && theme === 'white') {
    return 'light';
  }

  return theme;
};

const resolveAutoTheme = (themeFamily: ThemeFamily): AppliedTheme => {
  if (getSystemTheme() === 'dark') {
    return 'dark';
  }

  return themeFamily === 'official' ? 'white' : 'light';
};

const normalizeResolvedTheme = (theme: AppliedTheme): ResolvedTheme => {
  return theme === 'dark' ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme, themeFamily: ThemeFamily): AppliedTheme => {
  const normalizedTheme = normalizeThemeForFamily(theme, themeFamily);

  if (normalizedTheme === 'auto') {
    return resolveAutoTheme(themeFamily);
  }

  if (normalizedTheme === 'white') {
    return 'white';
  }

  return normalizedTheme;
};

const applyTheme = (resolved: AppliedTheme, themeFamily: ThemeFamily) => {
  document.documentElement.setAttribute('data-theme-family', themeFamily);

  if (resolved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    return;
  }

  if (resolved === 'white') {
    document.documentElement.setAttribute('data-theme', 'white');
    return;
  }

  document.documentElement.removeAttribute('data-theme');
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'auto',
      themeFamily: DEFAULT_THEME_FAMILY,
      resolvedTheme: 'light',

      setTheme: (theme) => {
        const { themeFamily } = get();
        const nextTheme = normalizeThemeForFamily(theme, themeFamily);
        const resolved = resolveTheme(nextTheme, themeFamily);
        applyTheme(resolved, themeFamily);
        const nextResolvedTheme = normalizeResolvedTheme(resolved);
        if (get().theme === nextTheme && get().resolvedTheme === nextResolvedTheme) {
          return;
        }
        set({
          theme: nextTheme,
          resolvedTheme: nextResolvedTheme,
        });
      },

      setThemeFamily: (themeFamily) => {
        const nextTheme = normalizeThemeForFamily(get().theme, themeFamily);
        const resolved = resolveTheme(nextTheme, themeFamily);
        applyTheme(resolved, themeFamily);
        const nextResolvedTheme = normalizeResolvedTheme(resolved);

        if (
          get().themeFamily === themeFamily &&
          get().theme === nextTheme &&
          get().resolvedTheme === nextResolvedTheme
        ) {
          return;
        }

        set({
          themeFamily,
          theme: nextTheme,
          resolvedTheme: nextResolvedTheme,
        });
      },

      cycleTheme: () => {
        const { theme, themeFamily, setTheme } = get();
        const order = getAvailableThemes(themeFamily);
        const currentIndex = order.indexOf(theme);
        const nextTheme = order[(currentIndex + 1) % order.length];
        setTheme(nextTheme);
      },

      initializeTheme: () => {
        const { themeFamily, setThemeFamily } = get();
        setThemeFamily(themeFamily);

        // 监听系统主题变化（仅在 auto 模式下生效）
        if (!window.matchMedia) {
          return () => {};
        }

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = () => {
          const { theme: currentTheme, themeFamily: currentThemeFamily } = get();
          if (currentTheme === 'auto') {
            const resolved = resolveAutoTheme(currentThemeFamily);
            applyTheme(resolved, currentThemeFamily);
            set({ resolvedTheme: normalizeResolvedTheme(resolved) });
          }
        };

        mediaQuery.addEventListener('change', listener);

        return () => mediaQuery.removeEventListener('change', listener);
      },
    }),
    {
      name: STORAGE_KEY_THEME,
    }
  )
);
