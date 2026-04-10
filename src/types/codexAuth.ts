export interface CodexUsageRollup {
  auth_id?: string;
  auth_index?: string;
  provider?: string;
  account?: string;
  request_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  recovered_tokens?: number | null;
  avg_input_tokens?: number;
  avg_output_tokens?: number;
  avg_cached_tokens?: number;
  avg_reasoning_tokens?: number;
  avg_total_tokens?: number;
  last_requested_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CodexAuthSnapshot {
  auth_id?: string;
  auth_index?: string;
  provider?: string;
  file_name?: string;
  label?: string;
  account_type?: string;
  account?: string;
  expires_at?: string;
  status?: string;
  status_message?: string;
  last_error_message?: string;
  disabled?: boolean;
  unavailable?: boolean;
  quota_exceeded?: boolean;
  quota_reason?: string;
  quota_model?: string;
  next_recover_at?: string;
  last_refreshed_at?: string;
  next_refresh_after?: string;
  next_retry_after?: string;
  updated_at?: string;
  usage?: CodexUsageRollup;
  [key: string]: unknown;
}

export interface CodexAuthEvent {
  id?: string;
  auth_id?: string;
  auth_index?: string;
  provider?: string;
  event_type?: string;
  reason?: string;
  status_message?: string;
  last_error?: string;
  http_status?: number;
  disabled?: boolean;
  unavailable?: boolean;
  quota_exceeded?: boolean;
  quota_reason?: string;
  quota_model?: string;
  disabled_at?: string | null;
  enabled_at?: string | null;
  recover_at?: string | null;
  request_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  recovered_tokens?: number | null;
  created_at?: string;
  [key: string]: unknown;
}

export type CodexPayloadRule = Record<string, unknown>;
export type CodexPayloadFilterRule = Record<string, unknown>;

export interface CodexAuthConfig {
  codex_header_defaults: {
    user_agent?: string;
    beta_features?: string;
  };
  payload: {
    default: CodexPayloadRule[];
    default_raw: CodexPayloadRule[];
    override: CodexPayloadRule[];
    override_raw: CodexPayloadRule[];
    filter: CodexPayloadFilterRule[];
  };
  notes?: Record<string, unknown>;
}

export interface CodexAuthDetail {
  snapshot?: CodexAuthSnapshot;
  events?: CodexAuthEvent[];
}
