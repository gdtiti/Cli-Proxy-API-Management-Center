import { apiClient } from './client';
import type {
  CodexAuthConfig,
  CodexAuthDetail,
  CodexAuthEvent,
  CodexAuthSnapshot,
  CodexUsageRollup,
} from '@/types';

interface CodexQuotaResponse {
  accounts?: CodexAuthSnapshot[];
}

interface CodexUsageResponse {
  usage?: CodexUsageRollup[];
}

interface CodexEventsResponse {
  events?: CodexAuthEvent[];
}

export const codexAuthApi = {
  async getQuota(): Promise<CodexAuthSnapshot[]> {
    const data = await apiClient.get<CodexQuotaResponse>('/codex-auth-quota');
    return Array.isArray(data?.accounts) ? data.accounts : [];
  },

  async getQuotaDetail(authIndex: string): Promise<CodexAuthDetail> {
    return apiClient.get<CodexAuthDetail>(`/codex-auth-quota/${encodeURIComponent(authIndex)}`);
  },

  async getEvents(params?: { authIndex?: string; limit?: number }): Promise<CodexAuthEvent[]> {
    const query = new URLSearchParams();
    if (params?.authIndex) {
      query.set('auth_index', params.authIndex);
    }
    if (params?.limit) {
      query.set('limit', String(params.limit));
    }
    const suffix = query.toString();
    const data = await apiClient.get<CodexEventsResponse>(
      `/codex-auth-events${suffix ? `?${suffix}` : ''}`
    );
    return Array.isArray(data?.events) ? data.events : [];
  },

  async getUsage(): Promise<CodexUsageRollup[]> {
    const data = await apiClient.get<CodexUsageResponse>('/codex-auth-usage');
    return Array.isArray(data?.usage) ? data.usage : [];
  },

  async getConfig(): Promise<CodexAuthConfig> {
    const data = await apiClient.get<CodexAuthConfig>('/codex-auth-config');
    return {
      codex_header_defaults: {
        user_agent: data?.codex_header_defaults?.user_agent ?? '',
        beta_features: data?.codex_header_defaults?.beta_features ?? '',
      },
      payload: {
        default: Array.isArray(data?.payload?.default) ? data.payload.default : [],
        default_raw: Array.isArray(data?.payload?.default_raw) ? data.payload.default_raw : [],
        override: Array.isArray(data?.payload?.override) ? data.payload.override : [],
        override_raw: Array.isArray(data?.payload?.override_raw) ? data.payload.override_raw : [],
        filter: Array.isArray(data?.payload?.filter) ? data.payload.filter : [],
      },
      notes: data?.notes ?? {},
    };
  },

  updateConfig(payload: CodexAuthConfig) {
    return apiClient.put('/codex-auth-config', payload);
  },
};
