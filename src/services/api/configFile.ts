/**
 * 配置文件相关 API（/config.yaml）
 */

import { apiClient } from './client';

export interface ReloadConfigFromStoreResponse {
  ok: boolean;
  source: string;
  target: string;
  store: string;
  changed: boolean;
}

export const configFileApi = {
  async fetchConfigYaml(): Promise<string> {
    const response = await apiClient.getRaw('/config.yaml', {
      responseType: 'text',
      headers: { Accept: 'application/yaml, text/yaml, text/plain' }
    });
    const data: unknown = response.data;
    if (typeof data === 'string') return data;
    if (data === undefined || data === null) return '';
    return String(data);
  },

  async saveConfigYaml(content: string): Promise<void> {
    await apiClient.put('/config.yaml', content, {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*'
      }
    });
  },

  reloadFromStore(): Promise<ReloadConfigFromStoreResponse> {
    return apiClient.post<ReloadConfigFromStoreResponse>('/config.yaml/reload-from-store');
  },
};
