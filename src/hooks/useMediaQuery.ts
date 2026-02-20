/**
 * 媒体查询 Hook
 */

import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    try {
      return window.matchMedia(query).matches;
    } catch (error) {
      console.warn(`[useMediaQuery] Failed to match media query "${query}":`, error);
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    let mounted = true;
    let mediaQueryList: MediaQueryList | null = null;

    try {
      mediaQueryList = window.matchMedia(query);

      const listener = (event: MediaQueryListEvent) => {
        if (mounted) {
          setMatches(event.matches);
        }
      };

      listener({ matches: mediaQueryList.matches } as MediaQueryListEvent);

      if (mediaQueryList.addEventListener) {
        mediaQueryList.addEventListener('change', listener);
      } else {
        mediaQueryList.addListener(listener);
      }

      return () => {
        mounted = false;
        if (!mediaQueryList) return;

        if (mediaQueryList.removeEventListener) {
          mediaQueryList.removeEventListener('change', listener);
        } else {
          mediaQueryList.removeListener(listener);
        }
      };
    } catch (error) {
      console.warn(`[useMediaQuery] Failed to setup media query listener for "${query}":`, error);
      return () => {
        mounted = false;
      };
    }
  }, [query]);

  return matches;
}
