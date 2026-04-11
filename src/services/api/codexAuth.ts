import { apiClient } from './client';
import type {
  CodexAuthConfig,
  CodexAuthConfigPayload,
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

const normalizePayloadRules = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const codexAuthApi = {
  async getQuota(): Promise<CodexAuthSnapshot[]> {
    const data = await apiClient.get<CodexQuotaResponse>('/codex-auth-quota');
    return Array.isArray(data?.accounts) ? data.accounts : [];
  },

  getQuotaDetail(authIndex: string): Promise<CodexAuthDetail> {
    return apiClient.get<CodexAuthDetail>(`/codex-auth-quota/${encodeURIComponent(authIndex)}`);
  },

  async getEvents(params?: { authIndex?: string; limit?: number }): Promise<CodexAuthEvent[]> {
    const query = new URLSearchParams();
    if (params?.authIndex) query.set('auth_index', params.authIndex);
    if (params?.limit) query.set('limit', String(params.limit));
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
        default: normalizePayloadRules(data?.payload?.default),
        default_raw: normalizePayloadRules(data?.payload?.default_raw),
        override: normalizePayloadRules(data?.payload?.override),
        override_raw: normalizePayloadRules(data?.payload?.override_raw),
        filter: normalizePayloadRules(data?.payload?.filter),
      },
      notes: data?.notes ?? {},
    };
  },

  updateConfig(payload: CodexAuthConfigPayload) {
    return apiClient.put('/codex-auth-config', payload);
  },
};
