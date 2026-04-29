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
  email?: string;
  prefix?: string;
  proxy_url?: string;
  base_url?: string;
  expires_at?: string;
  status?: string;
  state?: string;
  status_message?: string;
  last_error_message?: string;
  disabled?: boolean;
  unavailable?: boolean;
  quota_checked?: boolean | null;
  quota_level?: string;
  quota_exceeded?: boolean;
  quota_reason?: string;
  quota_model?: string;
  quota_backoff_level?: number | null;
  available_models?: import('./authFile').AuthFileModelItem[];
  available_model_count?: number;
  model_refresh_status?: string;
  model_last_checked_at?: string | number | null;
  model_last_success_at?: string | number | null;
  model_last_error?: string;
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

export interface CodexPayloadModelRule {
  name: string;
  protocol: 'codex';
}

export interface CodexPayloadRule {
  models: CodexPayloadModelRule[];
  params: Record<string, unknown>;
}

export interface CodexPayloadFilterRule {
  models: CodexPayloadModelRule[];
  params: string[];
}

export interface CodexHeaderFieldHint {
  id: string;
  label: string;
  value_type: string;
  description: string;
  example?: unknown;
}

export interface CodexRuleTargetGuide {
  id: string;
  title: string;
  raw: boolean;
  description: string;
}

export interface CodexFieldGroup {
  id: string;
  title: string;
  description: string;
  rule_targets?: string[];
  paths: string[];
}

export interface CodexPayloadFieldHint {
  path: string;
  label: string;
  value_type: string;
  rule_targets: string[];
  description: string;
  enum?: string[];
  example?: unknown;
  official: boolean;
}

export interface CodexFilterPathHint {
  path: string;
  label: string;
  description: string;
}

export interface CodexPayloadPreset {
  id: string;
  title: string;
  description: string;
  rule_target: string;
  raw: boolean;
  official: boolean;
  models: CodexPayloadModelRule[];
  params?: Record<string, unknown>;
  paths?: string[];
}

export interface CodexContextWindowsGuide {
  gpt5_max_context_tokens: number;
  gpt41_max_context_tokens: number;
  gpt5_supports_official_one_million: boolean;
  official_one_million_recommended_family: string;
}

export interface CodexConfigGuide {
  context_windows: CodexContextWindowsGuide;
  header_fields: CodexHeaderFieldHint[];
  rule_targets: CodexRuleTargetGuide[];
  field_groups: CodexFieldGroup[];
  field_hints: CodexPayloadFieldHint[];
  filter_paths: CodexFilterPathHint[];
  presets: CodexPayloadPreset[];
  official_docs?: Record<string, string>;
}

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
  guide?: CodexConfigGuide;
  notes?: Record<string, unknown>;
}

export interface CodexAuthConfigPayload {
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
}

export interface CodexAuthDetail {
  snapshot?: CodexAuthSnapshot;
  events?: CodexAuthEvent[];
}
