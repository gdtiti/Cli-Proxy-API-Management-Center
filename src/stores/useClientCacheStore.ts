/**
 * 客户端缓存 Store
 * 管理多个 API 客户端配置的持久化存储
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '@/services/storage/secureStorage';

export interface ClientConfig {
  id: string;
  name: string;
  apiBase: string;
  managementKey: string;
  createdAt: number;
  lastConnectedAt: number | null;
}

interface ClientCacheState {
  clients: ClientConfig[];
  activeClientId: string | null;
  keyboardShortcutsEnabled: boolean;
  hasHydrated: boolean;

  // CRUD 操作
  addClient: (client: Omit<ClientConfig, 'id' | 'createdAt' | 'lastConnectedAt'>) => string;
  updateClient: (id: string, updates: Partial<Omit<ClientConfig, 'id' | 'createdAt'>>) => void;
  deleteClient: (id: string) => void;
  getClients: () => ClientConfig[];
  getClientById: (id: string) => ClientConfig | undefined;

  // 活动客户端
  setActiveClient: (id: string | null) => void;
  clearActiveClient: () => void;
  updateLastConnected: (id: string) => void;

  // 快捷键设置
  setKeyboardShortcutsEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = 'client-cache';
const MAX_CLIENTS = 20;

const generateId = (): string => {
  return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const useClientCacheStore = create<ClientCacheState>()(
  persist(
    (set, get) => ({
      clients: [],
      activeClientId: null,
      keyboardShortcutsEnabled: true,
      hasHydrated: true,

      // 添加客户端
      addClient: (clientData) => {
        const { clients } = get();

        // 限制最大客户端数量
        if (clients.length >= MAX_CLIENTS) {
          throw new Error(`最多只能保存 ${MAX_CLIENTS} 个客户端配置`);
        }

        // 验证必填字段
        if (!clientData.name.trim()) {
          throw new Error('请输入客户端名称');
        }
        if (!clientData.apiBase.trim()) {
          throw new Error('请输入服务器地址');
        }
        if (!clientData.managementKey.trim()) {
          throw new Error('请输入管理密钥');
        }

        const id = generateId();
        const newClient: ClientConfig = {
          id,
          name: clientData.name.trim(),
          apiBase: clientData.apiBase.trim(),
          managementKey: clientData.managementKey,
          createdAt: Date.now(),
          lastConnectedAt: null,
        };

        // 使用 secureStorage 加密存储密钥
        secureStorage.setItem(`${STORAGE_KEY}-${id}-key`, clientData.managementKey, {
          encrypt: true,
        });

        // 保存不含密钥的配置到 persist storage
        const clientWithoutKey = { ...newClient, managementKey: '' };
        set({
          clients: [...clients, clientWithoutKey],
          activeClientId: id,
        });

        return id;
      },

      // 更新客户端
      updateClient: (id, updates) => {
        const { clients } = get();
        const index = clients.findIndex((c) => c.id === id);
        if (index === -1) {
          throw new Error('客户端不存在');
        }

        const updatedClients = [...clients];
        const oldClient = updatedClients[index];

        // 如果更新了密钥，重新加密存储
        if (updates.managementKey) {
          secureStorage.setItem(`${STORAGE_KEY}-${id}-key`, updates.managementKey, {
            encrypt: true,
          });
        }

        updatedClients[index] = {
          ...oldClient,
          ...updates,
          managementKey: updates.managementKey ? '' : oldClient.managementKey,
        };

        set({ clients: updatedClients });
      },

      // 删除客户端
      deleteClient: (id) => {
        const { clients, activeClientId } = get();
        const newClients = clients.filter((c) => c.id !== id);

        // 删除加密存储的密钥
        secureStorage.removeItem(`${STORAGE_KEY}-${id}-key`);

        set({
          clients: newClients,
          activeClientId: activeClientId === id ? null : activeClientId,
        });
      },

      // 获取所有客户端
      getClients: () => {
        const { clients } = get();
        return clients.map((client) => ({
          ...client,
          // 从 secureStorage 获取密钥
          managementKey:
            secureStorage.getItem<string>(`${STORAGE_KEY}-${client.id}-key`, { encrypt: true }) ||
            '',
        }));
      },

      // 根据 ID 获取客户端
      getClientById: (id) => {
        const { clients } = get();
        const client = clients.find((c) => c.id === id);
        if (!client) return undefined;

        return {
          ...client,
          managementKey:
            secureStorage.getItem<string>(`${STORAGE_KEY}-${client.id}-key`, { encrypt: true }) ||
            '',
        };
      },

      // 设置活动客户端
      setActiveClient: (id) => {
        set({ activeClientId: id });
      },

      // 清除活动客户端
      clearActiveClient: () => {
        set({ activeClientId: null });
      },

      // 更新最后连接时间
      updateLastConnected: (id) => {
        const { clients } = get();
        const index = clients.findIndex((c) => c.id === id);
        if (index === -1) return;

        const updatedClients = [...clients];
        updatedClients[index] = {
          ...updatedClients[index],
          lastConnectedAt: Date.now(),
        };

        set({ clients: updatedClients });
      },

      // 设置快捷键是否启用
      setKeyboardShortcutsEnabled: (enabled) => {
        set({ keyboardShortcutsEnabled: enabled });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        clients: state.clients,
        activeClientId: state.activeClientId,
        keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
      }),
      onRehydrateStorage: () => () => {
        useClientCacheStore.setState({ hasHydrated: true });
      },
    }
  )
);
