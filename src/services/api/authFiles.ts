/**
 * 认证文件与 OAuth 排除模型相关 API
 */

import { apiClient } from './client';
import type { AuthFilesListParams, AuthFilesResponse } from '@/types/authFile';

export const authFilesApi = {
  list: (params?: AuthFilesListParams) => apiClient.get<AuthFilesResponse>('/auth-files', { params }),

  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiClient.postForm('/auth-files', formData);
  },

  deleteFile: (name: string) => apiClient.delete(`/auth-files?name=${encodeURIComponent(name)}`),

  deleteAll: () => apiClient.delete('/auth-files', { params: { all: true } }),

  reloadFromStore: () =>
    apiClient.post<ReloadAuthFilesFromStoreResponse>('/auth-files/reload-from-store'),

  // Remove a specific project from a multi-project credential
  removeProject: (name: string, projectId: string) =>
    apiClient.patch('/auth-files/remove-project', { name, project_id: projectId }),

  downloadBlob: async (name: string): Promise<Blob> => {
    const response = await apiClient.getRaw(
      `/auth-files/download?name=${encodeURIComponent(name)}`,
      {
        responseType: 'blob',
      }
    );
    return new Blob([response.data]);
  },

  downloadText: async (name: string): Promise<string> => {
    const blob = await authFilesApi.downloadBlob(name);
    return blob.text();
  },

  async downloadJsonObject(name: string): Promise<Record<string, unknown>> {
    const rawText = await authFilesApi.downloadText(name);
    return parseAuthFileJsonObject(rawText);
  },

  saveText: (name: string, text: string) => saveAuthFileText(name, text),

  saveJsonObject: (name: string, json: Record<string, unknown>) =>
    saveAuthFileText(name, JSON.stringify(json)),

  patchProxyURLBatch: (payload: {
    names: string[];
    proxyUrl: string;
    dryRun?: boolean;
    stopOnError?: boolean;
  }) =>
    apiClient.patch<AuthFilesProxyURLBatchResponse>('/auth-files/proxy-url/batch', {
      names: payload.names,
      proxy_url: payload.proxyUrl,
      dry_run: payload.dryRun ?? false,
      stop_on_error: payload.stopOnError ?? false,
    }),

  patchFieldsBatch: (payload: AuthFilesFieldsBatchPayload) => {
    const body: Record<string, unknown> = {
      names: payload.names,
      dry_run: payload.dryRun ?? false,
      stop_on_error: payload.stopOnError ?? false,
    };

    if (payload.prefix !== undefined) {
      body.prefix = payload.prefix;
    }
    if (payload.headers !== undefined) {
      body.headers = payload.headers;
    }
    if (payload.priority !== undefined) {
      body.priority = payload.priority;
    }
    if (payload.note !== undefined) {
      body.note = payload.note;
    }

    return apiClient.patch<AuthFilesFieldsBatchResponse>('/auth-files/fields/batch', body);
  },

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get('/oauth-excluded-models');
    return normalizeOauthExcludedModels(data);
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch('/oauth-excluded-models', { provider, models }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put('/oauth-excluded-models', normalizeOauthExcludedModels(map)),

  // OAuth 模型别名
  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await apiClient.get(OAUTH_MODEL_ALIAS_ENDPOINT);
    return normalizeOauthModelAlias(data);
  },

  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    const normalizedAliases =
      normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
      channel: normalizedChannel,
      aliases: normalizedAliases,
    });
  },

  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();

    try {
      await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
        channel: normalizedChannel,
        aliases: [],
      });
    } catch (err: unknown) {
      const status = getStatusCode(err);
      if (status !== 405) throw err;
      await apiClient.delete(
        `${OAUTH_MODEL_ALIAS_ENDPOINT}?channel=${encodeURIComponent(normalizedChannel)}`
      );
    }
  },

  // 获取认证凭证支持的模型
  async getModelsForAuthFile(
    name: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const data = await apiClient.get<Record<string, unknown>>(
      `/auth-files/models?name=${encodeURIComponent(name)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },

  // 获取指定 channel 的模型定义
  async getModelDefinitions(
    channel: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
};
