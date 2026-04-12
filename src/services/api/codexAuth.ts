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
  total?: number;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
}

export interface CodexEventsQuery {
  authIndex?: string;
  keyword?: string;
  eventType?: string;
  quotaExceeded?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface CodexEventsResult {
  items: CodexAuthEvent[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  limit: number;
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

  async getEvents(params?: CodexEventsQuery): Promise<CodexEventsResult> {
    const query = new URLSearchParams();
    if (params?.authIndex) {
      query.set('auth_index', params.authIndex);
    }
    if (params?.keyword) {
      query.set('keyword', params.keyword);
    }
    if (params?.eventType) {
      query.set('event_type', params.eventType);
    }
    if (params?.quotaExceeded !== undefined) {
      query.set('quota_exceeded', String(params.quotaExceeded));
    }
    if (params?.page) {
      query.set('page', String(params.page));
    }
    if (params?.pageSize) {
      query.set('page_size', String(params.pageSize));
    }
    if (params?.sortBy) {
      query.set('sort_by', params.sortBy);
    }
    if (params?.sortOrder) {
      query.set('sort_order', params.sortOrder);
    }
    if (params?.limit) {
      query.set('limit', String(params.limit));
    }
    const suffix = query.toString();
    const data = await apiClient.get<CodexEventsResponse>(
      `/codex-auth-events${suffix ? `?${suffix}` : ''}`
    );
    const items = Array.isArray(data?.events) ? data.events : [];
    return {
      items,
      total: typeof data?.total === 'number' ? data.total : items.length,
      page: typeof data?.page === 'number' ? data.page : 1,
      pageSize: typeof data?.page_size === 'number' ? data.page_size : items.length || 1,
      sortBy: typeof data?.sort_by === 'string' ? data.sort_by : params?.sortBy || 'created_at',
      sortOrder: (data?.sort_order === 'asc' ? 'asc' : 'desc'),
      limit: typeof data?.limit === 'number' ? data.limit : params?.limit || 100,
    };
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
      guide: data?.guide,
      notes: data?.notes ?? {},
    };
  },

  updateConfig(payload: CodexAuthConfigPayload) {
    return apiClient.put('/codex-auth-config', payload);
  },
};
