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

  importCodex() {
    return apiClient.post('/web-image-auths/import-codex');
  },

  setStatus(payload: { name?: string; auth_id?: string; disabled: boolean }) {
    return apiClient.patch('/web-image-auths/status', payload);
  },

  deleteAuth(name: string) {
    return apiClient.delete(`/web-image-auths?name=${encodeURIComponent(name)}`);
  },

  refreshQuota() {
    return apiClient.post('/web-image-auths/quota-refresh');
  },

  async listTasks(): Promise<WebImageTask[]> {
    const data = await apiClient.get<WebImageTasksResponse>('/web-image-tasks');
    return Array.isArray(data?.tasks) ? data.tasks : [];
  },
};
