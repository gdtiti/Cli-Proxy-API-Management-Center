export const AUTH_FILES_SORT_MODES = [
  'default',
  'az',
  'priority',
  'concurrency',
  'usage_count',
  'last_used_at',
  'quota',
  'expires_at',
  'cooldown',
] as const;
export const AUTH_FILES_STATUS_FILTERS = ['all', 'enabled', 'disabled'] as const;
export const AUTH_FILES_QUOTA_FILTERS = ['all', 'unchecked', 'low', 'medium', 'high', 'full'] as const;
export const AUTH_FILES_USAGE_TIME_RANGES = ['7h', '24h', '7d', 'all'] as const;
export const AUTH_FILES_EXPIRY_FILTERS = [
  'all',
  'expired',
  'expiring_soon',
  'has_value',
  'no_value',
] as const;

export type AuthFilesSortMode = (typeof AUTH_FILES_SORT_MODES)[number];
export type AuthFilesStatusFilter = (typeof AUTH_FILES_STATUS_FILTERS)[number];
export type AuthFilesQuotaFilter = (typeof AUTH_FILES_QUOTA_FILTERS)[number];
export type AuthFilesUsageTimeRange = (typeof AUTH_FILES_USAGE_TIME_RANGES)[number];
export type AuthFilesExpiryFilter = (typeof AUTH_FILES_EXPIRY_FILTERS)[number];

export type AuthFilesUiState = {
  filter?: string;
  problemOnly?: boolean;
  compactMode?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  regularPageSize?: number;
  compactPageSize?: number;
  sortMode?: AuthFilesSortMode;
  statusFilter?: AuthFilesStatusFilter;
  quotaFilter?: AuthFilesQuotaFilter;
  usageTimeRange?: AuthFilesUsageTimeRange;
  expiryFilter?: AuthFilesExpiryFilter;
  modelFilter?: string;
};

const AUTH_FILES_UI_STATE_KEY = 'authFilesPage.uiState';
const AUTH_FILES_SORT_MODE_SET = new Set<AuthFilesSortMode>(AUTH_FILES_SORT_MODES);
const AUTH_FILES_STATUS_FILTER_SET = new Set<AuthFilesStatusFilter>(AUTH_FILES_STATUS_FILTERS);
const AUTH_FILES_QUOTA_FILTER_SET = new Set<AuthFilesQuotaFilter>(AUTH_FILES_QUOTA_FILTERS);
const AUTH_FILES_USAGE_TIME_RANGE_SET = new Set<AuthFilesUsageTimeRange>(AUTH_FILES_USAGE_TIME_RANGES);
const AUTH_FILES_EXPIRY_FILTER_SET = new Set<AuthFilesExpiryFilter>(AUTH_FILES_EXPIRY_FILTERS);

export const isAuthFilesSortMode = (value: unknown): value is AuthFilesSortMode =>
  typeof value === 'string' && AUTH_FILES_SORT_MODE_SET.has(value as AuthFilesSortMode);

export const isAuthFilesStatusFilter = (value: unknown): value is AuthFilesStatusFilter =>
  typeof value === 'string' && AUTH_FILES_STATUS_FILTER_SET.has(value as AuthFilesStatusFilter);

export const isAuthFilesQuotaFilter = (value: unknown): value is AuthFilesQuotaFilter =>
  typeof value === 'string' && AUTH_FILES_QUOTA_FILTER_SET.has(value as AuthFilesQuotaFilter);

export const isAuthFilesUsageTimeRange = (value: unknown): value is AuthFilesUsageTimeRange =>
  typeof value === 'string' &&
  AUTH_FILES_USAGE_TIME_RANGE_SET.has(value as AuthFilesUsageTimeRange);

export const isAuthFilesExpiryFilter = (value: unknown): value is AuthFilesExpiryFilter =>
  typeof value === 'string' && AUTH_FILES_EXPIRY_FILTER_SET.has(value as AuthFilesExpiryFilter);

export const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_FILES_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthFilesUiState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AUTH_FILES_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};
