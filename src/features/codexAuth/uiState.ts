export const CODEX_AUTH_TABS = ['accounts', 'usage', 'events', 'config'] as const;
export const CODEX_AUTH_PAGE_SIZES = [10, 20, 50] as const;

export type CodexAuthTabKey = (typeof CODEX_AUTH_TABS)[number];
export type StoredSortDirection = 'asc' | 'desc';
export type StoredSortState = {
  key?: string | null;
  direction?: StoredSortDirection;
};

export type CodexAuthUiState = {
  activeTab?: CodexAuthTabKey;
  accountsSearch?: string;
  accountsStatus?: string;
  accountsPage?: number;
  accountsPageSize?: number;
  accountsSort?: StoredSortState;
  usageSearch?: string;
  usagePage?: number;
  usagePageSize?: number;
  usageSort?: StoredSortState;
  eventsSearch?: string;
  eventsAuthIndex?: string;
  eventsPage?: number;
  eventsPageSize?: number;
  eventsSort?: StoredSortState;
};

const CODEX_AUTH_UI_STATE_KEY = 'codexAuthPage.uiState';
const CODEX_AUTH_TAB_SET = new Set<CodexAuthTabKey>(CODEX_AUTH_TABS);

export const isCodexAuthTabKey = (value: unknown): value is CodexAuthTabKey =>
  typeof value === 'string' && CODEX_AUTH_TAB_SET.has(value as CodexAuthTabKey);

export const clampCodexAuthPageSize = (value: unknown, fallback = CODEX_AUTH_PAGE_SIZES[0]) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return CODEX_AUTH_PAGE_SIZES.includes(rounded as (typeof CODEX_AUTH_PAGE_SIZES)[number])
    ? rounded
    : fallback;
};

export const clampCodexAuthPage = (value: unknown, fallback = 1) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
};

export const normalizeStoredSortState = <K extends string>(
  value: unknown,
  allowedKeys: readonly K[]
): { key: K | null; direction: StoredSortDirection } | null => {
  if (!value || typeof value !== 'object') return null;

  const rawKey = 'key' in value ? value.key : undefined;
  const rawDirection = 'direction' in value ? value.direction : undefined;
  const direction = rawDirection === 'desc' ? 'desc' : rawDirection === 'asc' ? 'asc' : null;

  if (rawKey == null) {
    return direction ? { key: null, direction } : null;
  }
  if (typeof rawKey !== 'string') return null;
  if (!allowedKeys.includes(rawKey as K)) return null;
  return {
    key: rawKey as K,
    direction: direction ?? 'asc',
  };
};

export const readCodexAuthUiState = (): CodexAuthUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CODEX_AUTH_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CodexAuthUiState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const writeCodexAuthUiState = (state: CodexAuthUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CODEX_AUTH_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};
