/**
 * 客户端快捷键 Hook
 * 实现 Ctrl+1~9 快速切换客户端
 */

import { useEffect, useCallback } from 'react';
import { useClientCacheStore } from './useClientCacheStore';

export function useClientKeyboardShortcuts() {
  const clients = useClientCacheStore((state) => state.clients);
  const getClients = useClientCacheStore((state) => state.getClients);
  const setActiveClient = useClientCacheStore((state) => state.setActiveClient);
  const keyboardShortcutsEnabled = useClientCacheStore((state) => state.keyboardShortcutsEnabled);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // 检查快捷键是否启用
      if (!keyboardShortcutsEnabled) return;

      // 检查是否按住 Ctrl 或 Command (Mac)
      const isCtrlPressed = event.ctrlKey || event.metaKey;

      if (!isCtrlPressed) return;

      // 检查数字键 1-9
      const key = event.key;
      if (key >= '1' && key <= '9') {
        const index = parseInt(key, 10) - 1;
        const allClients = getClients();

        if (index < allClients.length) {
          event.preventDefault();
          const client = allClients[index];
          setActiveClient(client.id);
        }
      }
    },
    [keyboardShortcutsEnabled, getClients, setActiveClient]
  );

  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, keyboardShortcutsEnabled]);

  return {
    // 返回客户端列表用于显示快捷键提示
    clients: clients.slice(0, 9).map((c, i) => ({
      index: i + 1,
      name: c.name,
    })),
  };
}
