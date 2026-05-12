import { apiClient } from './client';

export interface WebImageAuthAccount {
  id?: string;
  auth_index?: string;
  name?: string;
  provider?: string;
  email?: string;
  account?: string;
  account_id?: string;
  account_type?: string;
  status?: string;
  status_message?: string;
  disabled?: boolean;
  unavailable?: boolean;
  quota?: {
    image_quota_remaining?: number;
    image_quota_reset_after_seconds?: number;
    image_quota_restore_at?: string;
    image_quota_unknown?: boolean;
    image_quota_last_refreshed_at?: string;
  };
}

export interface WebImageTask {
  id: string;
  model?: string;
  endpoint?: string;
  auth_id?: string;
  auth_index?: string;
  account_id?: string;
  prompt?: string;
  size?: string;
  quality?: string;
  output_format?: string;
  status?: string;
  stage?: string;
  error?: string;
  http_status?: number;
  input_count?: number;
  output_count?: number;
  upload_files?: string[];
  output_files?: string[];
  request_log_file?: string;
  started_at?: string;
  completed_at?: string;
  duration_millis?: number;
  events?: Array<{
    at?: string;
    stage?: string;
    status?: string;
    message?: string;
  }>;
}

export interface WebImageQuotaRefreshResult {
  auth_id?: string;
  auth_index?: string;
  status: string;
  http_status?: number;
  error?: string;
  quota?: WebImageAuthAccount['quota'];
}

export interface WebImageQuotaRefreshStatus {
  id?: string;
  running: boolean;
  started_at?: string;
  finished_at?: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  current_auth?: string;
  message?: string;
  results?: WebImageQuotaRefreshResult[];
}

interface WebImageAuthsResponse {
  accounts?: WebImageAuthAccount[];
  total?: number;
}

interface WebImageTasksResponse {
  tasks?: WebImageTask[];
  total?: number;
}

export const webImageApi = {
  async listAuths(): Promise<WebImageAuthAccount[]> {
    const data = await apiClient.get<WebImageAuthsResponse>('/web-image-auths');
    return Array.isArray(data?.accounts) ? data.accounts : [];
  },

  createAuth(payload: {
    access_token: string;
    account_id?: string;
    email?: string;
    plan_type?: string;
    proxy_url?: string;
    note?: string;
    disabled?: boolean;
  }) {
    return apiClient.post('/web-image-auths', payload);
  },

  batchCreateAuths(payload: {
    text: string;
    plan_type?: string;
    proxy_url?: string;
    note?: string;
    disabled?: boolean;
  }) {
    return apiClient.post('/web-image-auths/batch', payload);
  },

  importCodex() {
    return apiClient.post('/web-image-auths/import-codex');
  },

  setStatus(payload: { name?: string; auth_id?: string; disabled: boolean }) {
    return apiClient.patch('/web-image-auths/status', payload);
  },

  deleteAuth(name: string) {
    return apiClient.delete(`/web-image-auths?name=${encodeURIComponent(name)}`);
  },

  refreshQuota(payload?: { concurrency?: number; auth_ids?: string[] }) {
    return apiClient.post<WebImageQuotaRefreshStatus>('/web-image-auths/quota-refresh', payload || {});
  },

  getRefreshQuotaStatus() {
    return apiClient.get<WebImageQuotaRefreshStatus>('/web-image-auths/quota-refresh');
  },

  async streamRefreshQuota(
    onProgress: (status: WebImageQuotaRefreshStatus) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(apiClient.buildUrl('/web-image-auths/quota-refresh/events'), {
      method: 'GET',
      headers: {
        ...apiClient.authHeaders(),
        Accept: 'text/event-stream',
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(`quota refresh stream failed: HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error('quota refresh stream is empty');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\n\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        onProgress(JSON.parse(data) as WebImageQuotaRefreshStatus);
      }
    }
  },

  async listTasks(): Promise<WebImageTask[]> {
    const data = await apiClient.get<WebImageTasksResponse>('/web-image-tasks');
    return Array.isArray(data?.tasks) ? data.tasks : [];
  },
};
