/**
 * 客户端选择器组件
 * 提供下拉菜单快速选择已保存的客户端配置
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useClientCacheStore, type ClientConfig } from '@/stores/useClientCacheStore';

interface ClientSelectorProps {
  onSelectClient: (client: ClientConfig) => void;
}

export function ClientSelector({ onSelectClient }: ClientSelectorProps) {
  const { t } = useTranslation();
  const clients = useClientCacheStore((state) => state.clients);
  const activeClientId = useClientCacheStore((state) => state.activeClientId);
  const setActiveClient = useClientCacheStore((state) => state.setActiveClient);
  const getClientById = useClientCacheStore((state) => state.getClientById);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const clientId = e.target.value;
    if (!clientId) return;

    const client = getClientById(clientId);
    if (client) {
      setActiveClient(clientId);
      onSelectClient(client);
    }
  };

  if (clients.length === 0) {
    return null;
  }

  return (
    <div className="client-selector">
      <select
        value={activeClientId || ''}
        onChange={handleChange}
        className="input client-selector-select"
        aria-label={t('client_selector.label')}
      >
        <option value="">{t('client_selector.placeholder')}</option>
        {clients.map((client, index) => (
          <option key={client.id} value={client.id}>
            {index + 1}. {client.name} ({client.apiBase})
          </option>
        ))}
      </select>
    </div>
  );
}
