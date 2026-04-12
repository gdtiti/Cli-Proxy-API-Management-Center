/**
 * Auth file related types.
 * Based on the legacy src/modules/auth-files.js implementation.
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  auth_index?: string | number | null;
  runtimeOnly?: boolean | string;
  runtime_only?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean | null;
  status?: string;
  state?: string;
  statusMessage?: string;
  status_message?: string;
  lastRefresh?: string | number | null;
  last_refresh?: string | number | null;
  modified?: number;
  modtime?: number | string;
  email?: string;
  account?: string;
  label?: string;
  alias?: string;
  prefix?: string;
  proxy_url?: string;
  base_url?: string;
  expires_at?: string | number | null;
  updated_at?: string | number | null;
  next_retry_after?: string | number | null;
  next_recover_at?: string | number | null;
  quota_checked?: boolean | null;
  quota_level?: string;
  quota_exceeded?: boolean | null;
  quota_reason?: string;
  quota_backoff_level?: number | null;
  metadata?: Record<string, unknown> | null;
  attributes?: Record<string, unknown> | null;
  id_token?: Record<string, unknown> | string | null;
  [key: string]: unknown;
}

export interface AuthFilesListPagination {
  total?: number;
  offset?: number;
  limit?: number;
}

export interface AuthFilesListParams {
  provider?: string;
  type?: string;
  name?: string;
  status?: string;
  state?: string;
  email?: string;
  prefix?: string;
  proxy_url?: string;
  auth_index?: string;
  quota_level?: string;
  quota_checked?: boolean;
  runtime_only?: boolean;
  disabled?: boolean;
  expired?: boolean;
  has_expiry?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
  pagination?: AuthFilesListPagination;
}
