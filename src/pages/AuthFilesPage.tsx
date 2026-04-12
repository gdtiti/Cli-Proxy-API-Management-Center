import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from '@/hooks/useInterval';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconBot, IconDownload, IconInfo, IconTrash2 } from '@/components/ui/icons';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import { apiCallApi, authFilesApi, getApiCallErrorMessage, usageApi } from '@/services/api';
import { apiClient } from '@/services/api/client';
import type { AuthFileItem, CodexQuotaWindow, GeminiCliQuotaBucketState } from '@/types';
import type { KeyStats, KeyStatBucket, UsageDetail } from '@/utils/usage';
import { collectUsageDetails, calculateStatusBarData } from '@/utils/usage';
import { formatFileSize } from '@/utils/format';
import styles from './AuthFilesPage.module.scss';

type ThemeColors = { bg: string; text: string; border?: string };
type TypeColorSet = { light: ThemeColors; dark?: ThemeColors };
type ResolvedTheme = 'light' | 'dark';

// 标签类型颜色配置（对齐重构前 styles.css 的 file-type-badge 颜色）
const TYPE_COLORS: Record<string, TypeColorSet> = {
  qwen: {
    light: { bg: '#e8f5e9', text: '#2e7d32' },
    dark: { bg: '#1b5e20', text: '#81c784' }
  },
  gemini: {
    light: { bg: '#e3f2fd', text: '#1565c0' },
    dark: { bg: '#0d47a1', text: '#64b5f6' }
  },
  'gemini-cli': {
    light: { bg: '#e7efff', text: '#1e4fa3' },
    dark: { bg: '#1c3f73', text: '#a8c7ff' }
  },
  aistudio: {
    light: { bg: '#f0f2f5', text: '#2f343c' },
    dark: { bg: '#373c42', text: '#cfd3db' }
  },
  claude: {
    light: { bg: '#fce4ec', text: '#c2185b' },
    dark: { bg: '#880e4f', text: '#f48fb1' }
  },
  codex: {
    light: { bg: '#fff3e0', text: '#ef6c00' },
    dark: { bg: '#e65100', text: '#ffb74d' }
  },
  antigravity: {
    light: { bg: '#e0f7fa', text: '#006064' },
    dark: { bg: '#004d40', text: '#80deea' }
  },
  iflow: {
    light: { bg: '#f3e5f5', text: '#7b1fa2' },
    dark: { bg: '#4a148c', text: '#ce93d8' }
  },
  empty: {
    light: { bg: '#f5f5f5', text: '#616161' },
    dark: { bg: '#424242', text: '#bdbdbd' }
  },
  unknown: {
    light: { bg: '#f0f0f0', text: '#666666', border: '1px dashed #999999' },
    dark: { bg: '#3a3a3a', text: '#aaaaaa', border: '1px dashed #666666' }
  }
};

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();

const OAUTH_PROVIDER_EXCLUDES = new Set(['all', 'unknown', 'empty']);

interface ExcludedFormState {
  provider: string;
  modelsText: string;
}
// 标准化 auth_index 值（与 usage.ts 中的 normalizeAuthIndex 保持一致）
function normalizeAuthIndexValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function isRuntimeOnlyAuthFile(file: AuthFileItem): boolean {
  const raw = file['runtime_only'] ?? file.runtimeOnly;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}

// 解析认证文件的统计数据
function resolveAuthFileStats(
  file: AuthFileItem,
  stats: KeyStats
): KeyStatBucket {
  const defaultStats: KeyStatBucket = { success: 0, failure: 0 };
  const rawFileName = file?.name || '';

  // 兼容 auth_index 和 authIndex 两种字段名（API 返回的是 auth_index）
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndexValue(rawAuthIndex);

  // 尝试根据 authIndex 匹配
  if (authIndexKey && stats.byAuthIndex?.[authIndexKey]) {
    return stats.byAuthIndex[authIndexKey];
  }

  // 尝试根据 source (文件名) 匹配
  if (rawFileName && stats.bySource?.[rawFileName]) {
    const fromName = stats.bySource[rawFileName];
    if (fromName.success > 0 || fromName.failure > 0) {
      return fromName;
    }
  }

  // 尝试去掉扩展名后匹配
  if (rawFileName) {
    const nameWithoutExt = rawFileName.replace(/\.[^/.]+$/, '');
    if (nameWithoutExt && nameWithoutExt !== rawFileName) {
      const fromNameWithoutExt = stats.bySource?.[nameWithoutExt];
      if (fromNameWithoutExt && (fromNameWithoutExt.success > 0 || fromNameWithoutExt.failure > 0)) {
        return fromNameWithoutExt;
      }
    }
  }

  return defaultStats;
}

type StateFilterValue = 'all' | 'normal' | 'disabled';
type QuotaFilterValue = 'all' | 'unchecked' | 'low' | 'medium' | 'high' | 'full';
type ExpiryFilterValue = 'all' | 'expired' | 'valid';
type HasExpiryFilterValue = 'all' | 'yes' | 'no';
type SortFieldValue = 'name' | 'modified' | 'state' | 'quota_level' | 'expires_at' | 'next_retry_after';
type SortOrderValue = 'asc' | 'desc';

interface CodexUsageWindow {
  used_percent?: number | string;
  usedPercent?: number | string;
  reset_after_seconds?: number | string;
  resetAfterSeconds?: number | string;
  reset_at?: number | string;
  resetAt?: number | string;
}

interface CodexRateLimitInfo {
  allowed?: boolean;
  limit_reached?: boolean;
  limitReached?: boolean;
  primary_window?: CodexUsageWindow | null;
  primaryWindow?: CodexUsageWindow | null;
  secondary_window?: CodexUsageWindow | null;
  secondaryWindow?: CodexUsageWindow | null;
}

interface CodexUsagePayload {
  plan_type?: string;
  planType?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
  code_review_rate_limit?: CodexRateLimitInfo | null;
  codeReviewRateLimit?: CodexRateLimitInfo | null;
}

interface GeminiCliQuotaBucket {
  modelId?: string;
  model_id?: string;
  tokenType?: string;
  token_type?: string;
  remainingFraction?: number | string;
  remaining_fraction?: number | string;
  remainingAmount?: number | string;
  remaining_amount?: number | string;
  resetTime?: string;
  reset_time?: string;
}

interface GeminiCliQuotaPayload {
  buckets?: GeminiCliQuotaBucket[];
}

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const GEMINI_CLI_QUOTA_URL = 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota';

const CODEX_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json',
  'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal'
};

const GEMINI_CLI_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json'
};

const createStatusError = (message: string, status?: number) => {
  const error = new Error(message) as Error & { status?: number };
  if (status !== undefined) {
    error.status = status;
  }
  return error;
};

function normalizeStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
}

function normalizeNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeQuotaFraction(value: unknown): number | null {
  const normalized = normalizeNumberValue(value);
  if (normalized !== null) return normalized;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
      const parsed = Number(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed / 100 : null;
    }
  }
  return null;
}

function parseCodexUsagePayload(payload: unknown): CodexUsagePayload | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as CodexUsagePayload;
    } catch {
      return null;
    }
  }
  return typeof payload === 'object' ? (payload as CodexUsagePayload) : null;
}

function parseGeminiCliQuotaPayload(payload: unknown): GeminiCliQuotaPayload | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as GeminiCliQuotaPayload;
    } catch {
      return null;
    }
  }
  return typeof payload === 'object' ? (payload as GeminiCliQuotaPayload) : null;
}

function decodeBase64UrlPayload(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return window.atob(padded);
  } catch {
    return null;
  }
}

function parseIdTokenPayload(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
  }
  const segments = value.split('.');
  if (segments.length < 2) return null;
  const decoded = decodeBase64UrlPayload(segments[1]);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractCodexChatgptAccountId(value: unknown): string | null {
  const payload = parseIdTokenPayload(value);
  return payload ? normalizeStringValue(payload.chatgpt_account_id ?? payload.chatgptAccountId) : null;
}

function resolveCodexChatgptAccountId(file: AuthFileItem): string | null {
  const metadata = file && typeof file.metadata === 'object' && file.metadata !== null
    ? (file.metadata as Record<string, unknown>)
    : null;
  const attributes = file && typeof file.attributes === 'object' && file.attributes !== null
    ? (file.attributes as Record<string, unknown>)
    : null;

  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];
  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }
  return null;
}

function resolveCodexPlanType(file: AuthFileItem): string | null {
  const metadata = file && typeof file.metadata === 'object' && file.metadata !== null
    ? (file.metadata as Record<string, unknown>)
    : null;
  const attributes = file && typeof file.attributes === 'object' && file.attributes !== null
    ? (file.attributes as Record<string, unknown>)
    : null;
  return normalizeStringValue(
    file.plan_type ??
      file.planType ??
      metadata?.plan_type ??
      metadata?.planType ??
      attributes?.plan_type ??
      attributes?.planType
  )?.toLowerCase() ?? null;
}

function extractGeminiCliProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (matches.length === 0) return null;
  return matches[matches.length - 1]?.[1]?.trim() || null;
}

function resolveGeminiCliProjectId(file: AuthFileItem): string | null {
  const metadata = file && typeof file.metadata === 'object' && file.metadata !== null
    ? (file.metadata as Record<string, unknown>)
    : null;
  const attributes = file && typeof file.attributes === 'object' && file.attributes !== null
    ? (file.attributes as Record<string, unknown>)
    : null;

  const candidates = [file.account, metadata?.account, attributes?.account];
  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }
  return null;
}

function formatQuotaResetLabel(window: CodexUsageWindow | null | undefined): string {
  if (!window) return '-';
  const resetAfter = normalizeNumberValue(window.reset_after_seconds ?? window.resetAfterSeconds);
  if (resetAfter !== null && resetAfter >= 0) {
    if (resetAfter < 60) return `${Math.round(resetAfter)}s`;
    if (resetAfter < 3600) return `${Math.ceil(resetAfter / 60)}m`;
    if (resetAfter < 86400) return `${Math.ceil(resetAfter / 3600)}h`;
    return `${Math.ceil(resetAfter / 86400)}d`;
  }
  const resetAt = normalizeNumberValue(window.reset_at ?? window.resetAt);
  if (resetAt !== null) {
    const time = resetAt > 1e12 ? resetAt : resetAt * 1000;
    const date = new Date(time);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }
  return '-';
}

function buildCodexQuotaWindows(payload: CodexUsagePayload, t: ReturnType<typeof useTranslation>['t']): CodexQuotaWindow[] {
  const rateLimit = payload.rate_limit ?? payload.rateLimit ?? undefined;
  const codeReviewLimit = payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? undefined;
  const windows: CodexQuotaWindow[] = [];
  const addWindow = (id: string, label: string, window?: CodexUsageWindow | null, limitReached?: boolean, allowed?: boolean) => {
    if (!window) return;
    const usedPercentRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const resetLabel = formatQuotaResetLabel(window);
    const usedPercent = usedPercentRaw ?? ((limitReached || allowed === false) && resetLabel !== '-' ? 100 : null);
    windows.push({ id, label, usedPercent, resetLabel });
  };

  addWindow(
    'primary',
    t('codex_quota.primary_window'),
    rateLimit?.primary_window ?? rateLimit?.primaryWindow,
    rateLimit?.limit_reached ?? rateLimit?.limitReached,
    rateLimit?.allowed
  );
  addWindow(
    'secondary',
    t('codex_quota.secondary_window'),
    rateLimit?.secondary_window ?? rateLimit?.secondaryWindow,
    rateLimit?.limit_reached ?? rateLimit?.limitReached,
    rateLimit?.allowed
  );
  addWindow(
    'code-review',
    t('codex_quota.code_review_window'),
    codeReviewLimit?.primary_window ?? codeReviewLimit?.primaryWindow,
    codeReviewLimit?.limit_reached ?? codeReviewLimit?.limitReached,
    codeReviewLimit?.allowed
  );
  return windows;
}

function buildGeminiCliQuotaBuckets(payload: GeminiCliQuotaPayload): GeminiCliQuotaBucketState[] {
  const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
  return buckets
    .map<GeminiCliQuotaBucketState | null>((bucket, index) => {
      const modelId = normalizeStringValue(bucket.modelId ?? bucket.model_id);
      if (!modelId) return null;
      const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
      const remainingFractionRaw = normalizeQuotaFraction(bucket.remainingFraction ?? bucket.remaining_fraction);
      const remainingAmount = normalizeNumberValue(bucket.remainingAmount ?? bucket.remaining_amount);
      const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
      const fallbackFraction = remainingAmount !== null ? (remainingAmount <= 0 ? 0 : null) : (resetTime ? 0 : null);
      return {
        id: `${modelId}-${tokenType || 'default'}-${index}`,
        label: modelId,
        remainingFraction: remainingFractionRaw ?? fallbackFraction,
        remainingAmount,
        resetTime,
        tokenType,
        modelIds: [modelId],
      } satisfies GeminiCliQuotaBucketState;
    })
    .filter((item): item is GeminiCliQuotaBucketState => item !== null);
}

export function AuthFilesPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilterValue>('all');
  const [quotaFilter, setQuotaFilter] = useState<QuotaFilterValue>('all');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilterValue>('all');
  const [hasExpiryFilter, setHasExpiryFilter] = useState<HasExpiryFilterValue>('all');
  const [sortBy, setSortBy] = useState<SortFieldValue>('modified');
  const [sortOrder, setSortOrder] = useState<SortOrderValue>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [keyStats, setKeyStats] = useState<KeyStats>({ bySource: {}, byAuthIndex: {} });
  const [usageDetails, setUsageDetails] = useState<UsageDetail[]>([]);

  // 详情弹窗相关
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AuthFileItem | null>(null);
  const [quotaRefreshing, setQuotaRefreshing] = useState(false);
  const [liveQuotaError, setLiveQuotaError] = useState('');
  const [liveCodexPlanType, setLiveCodexPlanType] = useState<string | null>(null);
  const [liveCodexQuota, setLiveCodexQuota] = useState<CodexQuotaWindow[]>([]);
  const [liveGeminiCliQuota, setLiveGeminiCliQuota] = useState<GeminiCliQuotaBucketState[]>([]);

  // 模型列表弹窗相关
  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<{ id: string; display_name?: string; type?: string }[]>([]);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<'unsupported' | null>(null);

  // OAuth 排除模型相关
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedError, setExcludedError] = useState<'unsupported' | null>(null);
  const [excludedModalOpen, setExcludedModalOpen] = useState(false);
  const [excludedForm, setExcludedForm] = useState<ExcludedFormState>({ provider: '', modelsText: '' });
  const [savingExcluded, setSavingExcluded] = useState(false);

  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useAuthFilesStats();
  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    batchDownloading,
    statusUpdating,
    batchStatusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleBatchDownload,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    deselectAll,
    batchDownload,
    batchSetStatus,
    batchDelete,
  } = useAuthFilesData({ refreshKeyStats });

  const statusBarCache = useAuthFilesStatusBarCache(files, usageDetails);

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  } = useAuthFilesOauth({ viewMode, files });

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels();

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    loadFiles,
    loadKeyStats: refreshKeyStats,
  });

  const disableControls = connectionStatus !== 'connected';

  const formatDateTime = useCallback((value: unknown): string => {
    if (value === undefined || value === null || value === '') return '-';
    const asNumber = Number(value);
    const date =
      Number.isFinite(asNumber) && !Number.isNaN(asNumber)
        ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
        : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }, []);

  const toDate = useCallback((value: unknown): Date | null => {
    if (value === undefined || value === null || value === '') return null;
    const asNumber = Number(value);
    const date =
      Number.isFinite(asNumber) && !Number.isNaN(asNumber)
        ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
        : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }, []);

  const formatModified = useCallback((item: AuthFileItem): string => {
    const raw = item['modtime'] ?? item.modified ?? item.updated_at;
    return formatDateTime(raw);
  }, [formatDateTime]);

  const hasExpiry = useCallback((item: AuthFileItem): boolean => Boolean(toDate(item.expires_at)), [toDate]);
  const isExpired = useCallback((item: AuthFileItem): boolean => {
    const expiryDate = toDate(item.expires_at);
    return Boolean(expiryDate && expiryDate.getTime() <= Date.now());
  }, [toDate]);

  // 加载文件列表
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list({
        state: stateFilter !== 'all' ? stateFilter : undefined,
        quota_level: quotaFilter !== 'all' ? quotaFilter : undefined,
        expired: expiryFilter === 'all' ? undefined : expiryFilter === 'expired',
        has_expiry: hasExpiryFilter === 'all' ? undefined : hasExpiryFilter === 'yes',
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [expiryFilter, hasExpiryFilter, quotaFilter, sortBy, sortOrder, stateFilter, t]);

  // 加载 key 统计和 usage 明细（API 层已有60秒超时）
  const loadKeyStats = useCallback(async () => {
    // 防止重复请求
    if (loadingKeyStatsRef.current) return;
    loadingKeyStatsRef.current = true;
    try {
      const usageResponse = await usageApi.getUsage();
      const usageData = usageResponse?.usage ?? usageResponse;
      const stats = await usageApi.getKeyStats(usageData);
      setKeyStats(stats);
      // 收集 usage 明细用于状态栏
      const details = collectUsageDetails(usageData);
      setUsageDetails(details);
    } catch {
      // 静默失败
    } finally {
      loadingKeyStatsRef.current = false;
    }
  }, []);

  // 加载 OAuth 排除列表
  const loadExcluded = useCallback(async () => {
    try {
      const res = await authFilesApi.getOauthExcludedModels();
      excludedUnsupportedRef.current = false;
      setExcluded(res || {});
      setExcludedError(null);
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setExcluded({});
        setExcludedError('unsupported');
        if (!excludedUnsupportedRef.current) {
          excludedUnsupportedRef.current = true;
          showNotification(t('oauth_excluded.upgrade_required'), 'warning');
        }
        return;
      }
      // 静默失败
    }
  }, [showNotification, t]);

  useEffect(() => {
    const persisted = readAuthFilesUiState();
    if (!persisted) return;

    if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
      setFilter(persisted.filter);
    }
    if (typeof persisted.problemOnly === 'boolean') {
      setProblemOnly(persisted.problemOnly);
    }
    if (typeof persisted.compactMode === 'boolean') {
      setCompactMode(persisted.compactMode);
    }
    if (typeof persisted.search === 'string') {
      setSearch(persisted.search);
    }
    if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
      setPage(Math.max(1, Math.round(persisted.page)));
    }
    const legacyPageSize =
      typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)
        ? clampCardPageSize(persisted.pageSize)
        : null;
    const regularPageSize =
      typeof persisted.regularPageSize === 'number' && Number.isFinite(persisted.regularPageSize)
        ? clampCardPageSize(persisted.regularPageSize)
        : legacyPageSize ?? DEFAULT_REGULAR_PAGE_SIZE;
    const compactPageSize =
      typeof persisted.compactPageSize === 'number' && Number.isFinite(persisted.compactPageSize)
        ? clampCardPageSize(persisted.compactPageSize)
        : legacyPageSize ?? DEFAULT_COMPACT_PAGE_SIZE;
    setPageSizeByMode({
      regular: regularPageSize,
      compact: compactPageSize,
    });
    if (isAuthFilesSortMode(persisted.sortMode)) {
      setSortMode(persisted.sortMode);
    }
  }, []);

  useEffect(() => {
    writeAuthFilesUiState({
      filter,
      problemOnly,
      compactMode,
      search,
      page,
      pageSize,
      regularPageSize: pageSizeByMode.regular,
      compactPageSize: pageSizeByMode.compact,
      sortMode,
    });
  }, [filter, problemOnly, compactMode, search, page, pageSize, pageSizeByMode, sortMode]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  const setCurrentModePageSize = useCallback(
    (next: number) => {
      setPageSizeByMode((current) =>
        compactMode ? { ...current, compact: next } : { ...current, regular: next }
      );
    },
    [compactMode]
  );

  const commitPageSizeInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const next = clampCardPageSize(value);
    setCurrentModePageSize(next);
    setPageSizeInput(String(next));
    setPage(1);
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setPageSizeInput(rawValue);

    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;

    const rounded = Math.round(parsed);
    if (rounded < MIN_CARD_PAGE_SIZE || rounded > MAX_CARD_PAGE_SIZE) return;

    setCurrentModePageSize(rounded);
    setPage(1);
  };

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
      void loadFiles().catch(() => {});
    },
    [loadFiles, sortMode]
  );

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadFiles(), refreshKeyStats(), loadExcluded(), loadModelAlias()]);
  }, [loadFiles, refreshKeyStats, loadExcluded, loadModelAlias]);

  const handleReloadFromStore = useCallback(async () => {
    setReloadingFromStore(true);
    try {
      const result = await authFilesApi.reloadFromStore();
      await Promise.all([loadFiles(), refreshKeyStats()]);
      showNotification(
        t('auth_files.reload_from_store_success', {
          written: result.written,
          removed: result.removed,
        }),
        'success'
      );
    } catch (err: unknown) {
      const apiError = err as ApiError;
      const status = apiError?.status;
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      if (status === 409 || status === 501 || status === 503) {
        showNotification(
          t('auth_files.reload_from_store_unsupported', { message }),
          'warning'
        );
        return;
      }
      showNotification(t('auth_files.reload_from_store_failed', { message }), 'error');
    } finally {
      setReloadingFromStore(false);
    }
  }, [loadFiles, refreshKeyStats, showNotification, t]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    loadFiles();
    void loadKeyStats().catch(() => {});
    loadExcluded();
  }, [loadFiles, loadKeyStats, loadExcluded]);

  useEffect(() => {
    setPage(1);
  }, [filter, search, stateFilter, quotaFilter, expiryFilter, hasExpiryFilter, sortBy, sortOrder]);

  // 定时刷新状态数据（每240秒）
  useInterval(loadKeyStats, 240_000);

  // 提取所有存在的类型
  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [files]);

  const filesMatchingProblemFilter = useMemo(
    () => (problemOnly ? files.filter(hasAuthFileStatusMessage) : files),
    [files, problemOnly]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'default', label: t('auth_files.sort_default') },
      { value: 'az', label: t('auth_files.sort_az') },
      { value: 'priority', label: t('auth_files.sort_priority') },
    ],
    [t]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filesMatchingProblemFilter.length };
    filesMatchingProblemFilter.forEach((file) => {
      if (!file.type) return;
      counts[file.type] = (counts[file.type] || 0) + 1;
    });
    return counts;
  }, [filesMatchingProblemFilter]);

  const activeFilterLabel =
    filter === 'all' ? t('auth_files.filter_all') : getTypeLabel(t, String(filter));
  const activeFilterCount = typeCounts[String(filter)] ?? 0;
  const activeFilterIcon = getAuthFileIcon(String(filter), resolvedTheme);

  const filtered = useMemo(() => {
    return files.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.type || '').toString().toLowerCase().includes(term) ||
        (item.provider || '').toString().toLowerCase().includes(term) ||
        (item.account || '').toString().toLowerCase().includes(term) ||
        (item.email || '').toString().toLowerCase().includes(term) ||
        (item.prefix || '').toString().toLowerCase().includes(term) ||
        (item.status || '').toString().toLowerCase().includes(term) ||
        (item.status_message || '').toString().toLowerCase().includes(term) ||
        (item.quota_reason || '').toString().toLowerCase().includes(term);
      return matchType && matchSearch;
    });
  }, [files, filter, search]);

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  // 统计信息
  const totalSize = useMemo(() => files.reduce((sum, item) => sum + (item.size || 0), 0), [files]);

  // 点击上传
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 处理文件上传（支持多选）
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesToUpload = Array.from(fileList);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    filesToUpload.forEach((file) => {
      if (file.name.endsWith('.json')) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      showNotification(t('auth_files.upload_error_json'), 'error');
    }

    if (validFiles.length === 0) {
      event.target.value = '';
      return;
    }

    setUploading(true);
    let successCount = 0;
    const failed: { name: string; message: string }[] = [];

    for (const file of validFiles) {
      try {
        await authFilesApi.upload(file);
        successCount++;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        failed.push({ name: file.name, message: errorMessage });
      }
    }

    if (successCount > 0) {
      const suffix = validFiles.length > 1 ? ` (${successCount}/${validFiles.length})` : '';
      showNotification(`${t('auth_files.upload_success')}${suffix}`, failed.length ? 'warning' : 'success');
      await loadFiles();
      await loadKeyStats();
    }

    if (failed.length > 0) {
      const details = failed.map((item) => `${item.name}: ${item.message}`).join('; ');
      showNotification(`${t('notification.upload_failed')}: ${details}`, 'error');
    }

    setUploading(false);
    event.target.value = '';
  };

  // 删除单个文件
  const handleDelete = async (name: string) => {
    if (!window.confirm(`${t('auth_files.delete_confirm')} "${name}" ?`)) return;
    setDeleting(name);
    try {
      await authFilesApi.deleteFile(name);
      showNotification(t('auth_files.delete_success'), 'success');
      setFiles((prev) => prev.filter((item) => item.name !== name));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
    } finally {
      setDeleting(null);
    }
  };

  // 删除全部（根据筛选类型）
  const handleDeleteAll = async () => {
    const isFiltered = filter !== 'all';
    const typeLabel = isFiltered ? getTypeLabel(filter) : t('auth_files.filter_all');
    const confirmMessage = isFiltered
      ? t('auth_files.delete_filtered_confirm', { type: typeLabel })
      : t('auth_files.delete_all_confirm');

    if (!window.confirm(confirmMessage)) return;

    setDeletingAll(true);
    try {
      if (!isFiltered) {
        // 删除全部
        await authFilesApi.deleteAll();
        showNotification(t('auth_files.delete_all_success'), 'success');
        setFiles((prev) => prev.filter((file) => isRuntimeOnlyAuthFile(file)));
      } else {
        // 删除筛选类型的文件
        const filesToDelete = files.filter(
          (f) => f.type === filter && !isRuntimeOnlyAuthFile(f)
        );

        if (filesToDelete.length === 0) {
          showNotification(t('auth_files.delete_filtered_none', { type: typeLabel }), 'info');
          setDeletingAll(false);
          return;
        }

        let success = 0;
        let failed = 0;
        const deletedNames: string[] = [];

        for (const file of filesToDelete) {
          try {
            await authFilesApi.deleteFile(file.name);
            success++;
            deletedNames.push(file.name);
          } catch {
            failed++;
          }
        }

        setFiles((prev) => prev.filter((f) => !deletedNames.includes(f.name)));

        if (failed === 0) {
          showNotification(
            t('auth_files.delete_filtered_success', { count: success, type: typeLabel }),
            'success'
          );
        } else {
          showNotification(
            t('auth_files.delete_filtered_partial', { success, failed, type: typeLabel }),
            'warning'
          );
        }
        setFilter('all');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
    } finally {
      setDeletingAll(false);
    }
  };

  // 下载文件
  const handleDownload = async (name: string) => {
    try {
      const response = await apiClient.getRaw(`/auth-files/download?name=${encodeURIComponent(name)}`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      window.URL.revokeObjectURL(url);
      showNotification(t('auth_files.download_success'), 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
    }
  };

  // 显示详情弹窗
  const showDetails = (file: AuthFileItem) => {
    setSelectedFile(file);
    setLiveQuotaError('');
    setLiveCodexPlanType(null);
    setLiveCodexQuota([]);
    setLiveGeminiCliQuota([]);
    setDetailModalOpen(true);
  };

  // 显示模型列表
  const showModels = async (item: AuthFileItem) => {
    setModelsFileName(item.name);
    setModelsFileType(item.type || '');
    setModelsList([]);
    setModelsError(null);
    setModelsModalOpen(true);
    setModelsLoading(true);
    try {
      const models = await authFilesApi.getModelsForAuthFile(item.name);
      setModelsList(models);
    } catch (err) {
      // 检测是否是 API 不支持的错误 (404 或特定错误消息)
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('Not Found')) {
        setModelsError('unsupported');
      } else {
        showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
      }
    } finally {
      setModelsLoading(false);
    }
  };

  // 检查模型是否被 OAuth 排除
  const isModelExcluded = (modelId: string, providerType: string): boolean => {
    const excludedModels = excluded[providerType] || [];
    return excludedModels.some(pattern => {
      if (pattern.includes('*')) {
        // 支持通配符匹配
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
        return regex.test(modelId);
      }
      return pattern.toLowerCase() === modelId.toLowerCase();
    });
  };

  // 获取类型标签显示文本
  const getTypeLabel = (type: string): string => {
    const key = `auth_files.filter_${type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (type.toLowerCase() === 'iflow') return 'iFlow';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // 获取类型颜色
  const getTypeColor = (type: string): ThemeColors => {
    const set = TYPE_COLORS[type] || TYPE_COLORS.unknown;
    return resolvedTheme === 'dark' && set.dark ? set.dark : set.light;
  };

  const getStateLabel = useCallback((item: AuthFileItem): string => {
    const state = String(item.state || '').toLowerCase();
    if (state === 'disabled' || item.disabled) return t('auth_files.state_disabled');
    if (state === 'normal' || state === 'enabled' || state === 'ready' || state === '') return t('auth_files.state_normal');
    return item.state || t('auth_files.state_unknown');
  }, [t]);

  const getStateTone = useCallback((item: AuthFileItem): 'success' | 'error' | 'warning' => {
    const state = String(item.state || '').toLowerCase();
    if (state === 'disabled' || item.disabled) return 'error';
    if (state === 'normal' || state === 'enabled' || state === 'ready' || state === '') return 'success';
    return 'warning';
  }, []);

  const getQuotaLevelLabel = useCallback((level: unknown): string => {
    const normalized = String(level || 'unchecked').toLowerCase();
    return t(`auth_files.quota_level_${normalized}`, { defaultValue: normalized });
  }, [t]);

  const getQuotaTone = useCallback((level: unknown): 'success' | 'warning' | 'error' => {
    const normalized = String(level || 'unchecked').toLowerCase();
    if (normalized === 'full' || normalized === 'low') return 'error';
    if (normalized === 'medium' || normalized === 'unchecked') return 'warning';
    return 'success';
  }, []);

  const canRefreshQuota = useCallback((item: AuthFileItem | null): boolean => {
    if (!item) return false;
    const authIndex = normalizeAuthIndexValue(item.auth_index ?? item.authIndex);
    if (!authIndex) return false;
    const provider = String(item.type || item.provider || '').toLowerCase();
    return provider === 'codex' || provider === 'gemini-cli';
  }, []);

  const refreshSelectedQuota = useCallback(async () => {
    if (!selectedFile) return;
    const authIndex = normalizeAuthIndexValue(selectedFile.auth_index ?? selectedFile.authIndex);
    if (!authIndex) {
      showNotification(t('auth_files.refresh_quota_missing_auth_index'), 'error');
      return;
    }

    setQuotaRefreshing(true);
    setLiveQuotaError('');
    setLiveCodexPlanType(null);
    setLiveCodexQuota([]);
    setLiveGeminiCliQuota([]);

    try {
      const provider = String(selectedFile.type || selectedFile.provider || '').toLowerCase();
      if (provider === 'codex') {
        const accountId = resolveCodexChatgptAccountId(selectedFile);
        if (!accountId) {
          throw new Error(t('codex_quota.missing_account_id'));
        }
        const result = await apiCallApi.request({
          authIndex,
          method: 'GET',
          url: CODEX_USAGE_URL,
          header: {
            ...CODEX_REQUEST_HEADERS,
            'Chatgpt-Account-Id': accountId,
          },
        });
        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
        }
        const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
        if (!payload) {
          throw new Error(t('codex_quota.empty_windows'));
        }
        setLiveCodexPlanType(normalizeStringValue(payload.plan_type ?? payload.planType) ?? resolveCodexPlanType(selectedFile));
        setLiveCodexQuota(buildCodexQuotaWindows(payload, t));
      } else if (provider === 'gemini-cli') {
        const projectId = resolveGeminiCliProjectId(selectedFile);
        if (!projectId) {
          throw new Error(t('gemini_cli_quota.missing_project_id'));
        }
        const result = await apiCallApi.request({
          authIndex,
          method: 'POST',
          url: GEMINI_CLI_QUOTA_URL,
          header: { ...GEMINI_CLI_REQUEST_HEADERS },
          data: JSON.stringify({ project: projectId }),
        });
        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
        }
        const payload = parseGeminiCliQuotaPayload(result.body ?? result.bodyText);
        setLiveGeminiCliQuota(payload ? buildGeminiCliQuotaBuckets(payload) : []);
      }
      showNotification(t('notification.data_refreshed'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setLiveQuotaError(message);
      showNotification(message, 'error');
    } finally {
      setQuotaRefreshing(false);
    }
  }, [selectedFile, showNotification, t]);

  const renderCodexLiveQuota = useCallback(() => {
    if (!selectedFile || String(selectedFile.type || selectedFile.provider || '').toLowerCase() !== 'codex') {
      return null;
    }
    const planLabel = liveCodexPlanType
      ? t(`codex_quota.plan_${liveCodexPlanType.toLowerCase()}`, {
          defaultValue: liveCodexPlanType,
        })
      : null;
    const isFreePlan = liveCodexPlanType?.toLowerCase() === 'free';

    return (
      <div className={styles.quotaSection}>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>{t('codex_quota.plan_label')}</span>
          <span className={styles.detailValue}>{planLabel || '-'}</span>
        </div>
        {isFreePlan ? (
          <div className={styles.quotaWarning}>{t('codex_quota.no_access')}</div>
        ) : liveCodexQuota.length === 0 ? (
          <div className={styles.quotaMessage}>{t('codex_quota.empty_windows')}</div>
        ) : (
          liveCodexQuota.map((window) => {
            const used = window.usedPercent;
            const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
            const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
            const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
            const quotaBarClass =
              remaining === null
                ? styles.quotaBarFillMedium
                : remaining >= 80
                  ? styles.quotaBarFillHigh
                  : remaining >= 50
                    ? styles.quotaBarFillMedium
                    : styles.quotaBarFillLow;

            return (
              <div key={window.id} className={styles.quotaRow}>
                <div className={styles.quotaRowHeader}>
                  <span className={styles.quotaModel}>{window.label}</span>
                  <div className={styles.quotaMeta}>
                    <span className={styles.quotaPercent}>{percentLabel}</span>
                    <span className={styles.quotaReset}>{window.resetLabel}</span>
                  </div>
                </div>
                <div className={styles.quotaBar}>
                  <div
                    className={`${styles.quotaBarFill} ${quotaBarClass}`}
                    style={{ width: `${Math.round(remaining ?? 0)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }, [liveCodexPlanType, liveCodexQuota, selectedFile, t]);

  const renderGeminiCliLiveQuota = useCallback(() => {
    if (!selectedFile || String(selectedFile.type || selectedFile.provider || '').toLowerCase() !== 'gemini-cli') {
      return null;
    }

    return (
      <div className={styles.quotaSection}>
        {liveGeminiCliQuota.length === 0 ? (
          <div className={styles.quotaMessage}>{t('gemini_cli_quota.empty_buckets')}</div>
        ) : (
          liveGeminiCliQuota.map((bucket) => {
            const fraction = bucket.remainingFraction;
            const clamped = fraction === null ? null : Math.max(0, Math.min(1, fraction));
            const percent = clamped === null ? null : Math.round(clamped * 100);
            const percentLabel = percent === null ? '--' : `${percent}%`;
            const remainingAmountLabel =
              bucket.remainingAmount === null || bucket.remainingAmount === undefined
                ? null
                : t('gemini_cli_quota.remaining_amount', {
                    count: bucket.remainingAmount,
                  });
            const resetLabel = formatDateTime(bucket.resetTime);
            const quotaBarClass =
              percent === null
                ? styles.quotaBarFillMedium
                : percent >= 60
                  ? styles.quotaBarFillHigh
                  : percent >= 20
                    ? styles.quotaBarFillMedium
                    : styles.quotaBarFillLow;

            return (
              <div key={bucket.id} className={styles.quotaRow}>
                <div className={styles.quotaRowHeader}>
                  <span className={styles.quotaModel}>{bucket.label}</span>
                  <div className={styles.quotaMeta}>
                    <span className={styles.quotaPercent}>{percentLabel}</span>
                    {remainingAmountLabel && <span className={styles.quotaAmount}>{remainingAmountLabel}</span>}
                    <span className={styles.quotaReset}>{resetLabel}</span>
                  </div>
                </div>
                <div className={styles.quotaBar}>
                  <div
                    className={`${styles.quotaBarFill} ${quotaBarClass}`}
                    style={{ width: `${percent ?? 0}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }, [formatDateTime, liveGeminiCliQuota, selectedFile, t]);

  // OAuth 排除相关方法
  const openExcludedModal = (provider?: string) => {
    const normalizedProvider = (provider || '').trim();
    const fallbackProvider = normalizedProvider || (filter !== 'all' ? String(filter) : '');
    const lookupKey = fallbackProvider
      ? excludedProviderLookup.get(fallbackProvider.toLowerCase())
      : undefined;
    const models = lookupKey ? excluded[lookupKey] : [];
    setExcludedForm({
      provider: lookupKey || fallbackProvider,
      modelsText: Array.isArray(models) ? models.join('\n') : ''
    });
    setExcludedModalOpen(true);
  };

  const saveExcludedModels = async () => {
    const provider = excludedForm.provider.trim();
    if (!provider) {
      showNotification(t('oauth_excluded.provider_required'), 'error');
      return;
    }
    const models = excludedForm.modelsText
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    setSavingExcluded(true);
    try {
      if (models.length) {
        await authFilesApi.saveOauthExcludedModels(provider, models);
      } else {
        await authFilesApi.deleteOauthExcludedEntry(provider);
      }
      await loadExcluded();
      showNotification(t('oauth_excluded.save_success'), 'success');
      setExcludedModalOpen(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSavingExcluded(false);
    }
  };

  const deleteExcluded = async (provider: string) => {
    if (!window.confirm(t('oauth_excluded.delete_confirm', { provider }))) return;
    try {
      await authFilesApi.deleteOauthExcludedEntry(provider);
      await loadExcluded();
      showNotification(t('oauth_excluded.delete_success'), 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.delete_failed')}: ${errorMessage}`, 'error');
    }
  };

  // 渲染标签筛选器
  const renderFilterTags = () => (
    <div className={styles.filterTags}>
      {existingTypes.map((type) => {
        const isActive = filter === type;
        const color = type === 'all' ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' } : getTypeColor(type);
        const activeTextColor = resolvedTheme === 'dark' ? '#111827' : '#fff';
        return (
          <button
            key={type}
            className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ''}`}
            style={{
              backgroundColor: isActive ? color.text : color.bg,
              color: isActive ? activeTextColor : color.text,
              borderColor: color.text
            }}
            onClick={() => {
              setFilter(type);
              setPage(1);
            }}
          >
            {getTypeLabel(type)}
          </button>
        );
      })}
    </div>
  );

  // 预计算所有认证文件的状态栏数据（避免每次渲染重复计算）
  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    files.forEach((file) => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndexKey = normalizeAuthIndexValue(rawAuthIndex);

      if (authIndexKey) {
        // 过滤出属于该认证文件的 usage 明细
        const filteredDetails = usageDetails.filter((detail) => {
          const detailAuthIndex = normalizeAuthIndexValue(detail.auth_index);
          return detailAuthIndex !== null && detailAuthIndex === authIndexKey;
        });
        cache.set(authIndexKey, calculateStatusBarData(filteredDetails));
      }
    });

    return cache;
  }, [usageDetails, files]);

  // 渲染状态监测栏
  const renderStatusBar = (item: AuthFileItem) => {
    // 认证文件使用 authIndex 来匹配 usage 数据
    const rawAuthIndex = item['auth_index'] ?? item.authIndex;
    const authIndexKey = normalizeAuthIndexValue(rawAuthIndex);

    const statusData = (authIndexKey && statusBarCache.get(authIndexKey)) || calculateStatusBarData([]);
    const hasData = statusData.totalSuccess + statusData.totalFailure > 0;
    const rateClass = !hasData
      ? ''
      : statusData.successRate >= 90
        ? styles.statusRateHigh
        : statusData.successRate >= 50
          ? styles.statusRateMedium
          : styles.statusRateLow;

    return (
      <div className={styles.statusBar}>
        <div className={styles.statusBlocks}>
          {statusData.blocks.map((state, idx) => {
            const blockClass =
              state === 'success'
                ? styles.statusBlockSuccess
                : state === 'failure'
                  ? styles.statusBlockFailure
                  : state === 'mixed'
                    ? styles.statusBlockMixed
                    : styles.statusBlockIdle;
            return <div key={idx} className={`${styles.statusBlock} ${blockClass}`} />;
          })}
        </div>
        <span className={`${styles.statusRate} ${rateClass}`}>
          {hasData ? `${statusData.successRate.toFixed(1)}%` : '--'}
        </span>
      </div>
    );
  };

  // 渲染单个认证文件卡片
  const renderFileCard = (item: AuthFileItem) => {
    const fileStats = resolveAuthFileStats(item, keyStats);
    const isRuntimeOnly = isRuntimeOnlyAuthFile(item);
    const typeColor = getTypeColor(item.type || 'unknown');
    const authIndex = normalizeAuthIndexValue(item.auth_index ?? item.authIndex);
    const provider = item.provider || item.type || '-';
    const expired = isExpired(item);
    const expiryText = formatDateTime(item.expires_at);
    const retryText = formatDateTime(item.next_retry_after);
    const recoverText = formatDateTime(item.next_recover_at);
    const quotaReason = item.quota_reason || item.status_message || item.status || '-';

    return (
      <div key={item.name} className={styles.fileCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderMain}>
            <span
              className={styles.typeBadge}
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                ...(typeColor.border ? { border: typeColor.border } : {})
              }}
            >
              {getTypeLabel(item.type || 'unknown')}
            </span>
            <span className={styles.fileName}>{item.name}</span>
          </div>
          <div className={styles.badgeRow}>
            <span className={`status-badge ${getStateTone(item)}`}>{getStateLabel(item)}</span>
            <span className={`status-badge ${getQuotaTone(item.quota_level)}`}>{getQuotaLevelLabel(item.quota_level)}</span>
            {expired && <span className="status-badge error">{t('auth_files.expired_badge')}</span>}
          </div>
        </div>

        <div className={styles.cardMeta}>
          <span>{t('auth_files.file_size')}: {item.size ? formatFileSize(item.size) : '-'}</span>
          <span>{t('auth_files.file_modified')}: {formatModified(item)}</span>
        </div>

        <div className={styles.cardStats}>
          <span className={`${styles.statPill} ${styles.statSuccess}`}>
            {t('stats.success')}: {fileStats.success}
          </span>
          <span className={`${styles.statPill} ${styles.statFailure}`}>
            {t('stats.failure')}: {fileStats.failure}
          </span>
        </div>

        {/* 状态监测栏 */}
        {renderStatusBar(item)}

        <div className={styles.detailList}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('auth_files.provider_label')}</span>
            <span className={styles.detailValue}>{provider}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('auth_files.auth_index_label')}</span>
            <span className={styles.detailValue}>{authIndex || '-'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('auth_files.account_label')}</span>
            <span className={styles.detailValue}>{item.account || item.email || '-'}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('auth_files.quota_reason_label')}</span>
            <span className={styles.detailValue}>{quotaReason}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('auth_files.expires_at_label')}</span>
            <span className={styles.detailValue}>{hasExpiry(item) ? expiryText : t('auth_files.no_expiry')}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>{t('auth_files.cooldown_label')}</span>
            <span className={styles.detailValue}>
              {recoverText !== '-' ? recoverText : retryText !== '-' ? retryText : '-'}
            </span>
          </div>
        </div>

        <div className={styles.cardActions}>
          {isRuntimeOnly ? (
            <div className={styles.virtualBadge}>{t('auth_files.type_virtual') || '虚拟认证文件'}</div>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => showModels(item)}
                className={styles.iconButton}
                title={t('auth_files.models_button', { defaultValue: '模型' })}
                disabled={disableControls}
              >
                <IconBot className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => showDetails(item)}
                className={styles.iconButton}
                title={t('common.info', { defaultValue: '关于' })}
                disabled={disableControls}
              >
                <IconInfo className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDownload(item.name)}
                className={styles.iconButton}
                title={t('auth_files.download_button')}
                disabled={disableControls}
              >
                <IconDownload className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.name)}
                className={styles.iconButton}
                title={t('auth_files.delete_button')}
                disabled={disableControls || deleting === item.name}
              >
                {deleting === item.name ? (
                  <LoadingSpinner size={14} />
                ) : (
                  <IconTrash2 className={styles.actionIcon} size={16} />
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={styles.filterTags}>
        {existingTypes.map((type) => {
          const isActive = filter === type;
          const iconSrc = getAuthFileIcon(type, resolvedTheme);
          const color =
            type === 'all'
              ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' }
              : getTypeColor(type, resolvedTheme);
          const buttonStyle = {
            '--filter-color': color.text,
            '--filter-surface': color.bg,
            '--filter-active-text': resolvedTheme === 'dark' ? '#111827' : '#ffffff',
          } as CSSProperties;

          return (
            <button
              key={type}
              className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ''}`}
              style={buttonStyle}
              onClick={() => {
                setFilter(type);
                setPage(1);
              }}
            >
              <span className={styles.filterTagLabel}>
                {type === 'all' ? (
                  <span className={`${styles.filterTagIconWrap} ${styles.filterAllIconWrap}`}>
                    <IconFilterAll className={styles.filterAllIcon} size={18} />
                  </span>
                ) : (
                  <span className={styles.filterTagIconWrap}>
                    {iconSrc ? (
                      <img src={iconSrc} alt="" className={styles.filterTagIcon} />
                    ) : (
                      <span className={styles.filterTagIconFallback}>
                        {getTypeLabel(t, type).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                )}
                <span className={styles.filterTagText}>{getTypeLabel(t, type)}</span>
              </span>
              <span className={styles.filterTagCount}>{typeCounts[type] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('auth_files.title_section')}</span>
      {files.length > 0 && <span className={styles.countBadge}>{files.length}</span>}
    </div>
  );

  const deleteAllButtonLabel = problemOnly
    ? filter === 'all'
      ? t('auth_files.delete_problem_button')
      : t('auth_files.delete_problem_button_with_type', { type: getTypeLabel(t, filter) })
    : filter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, filter)}`;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={t('auth_files.title_section')}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={() => { loadFiles(); loadKeyStats(); }} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDeleteAll}
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {filter === 'all' ? t('auth_files.delete_all_button') : `${t('common.delete')} ${getTypeLabel(filter)}`}
            </Button>
            <Button size="sm" onClick={handleUploadClick} disabled={disableControls || uploading} loading={uploading}>
              {t('auth_files.upload_button')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        {/* 筛选区域 */}
        <div className={styles.filterSection}>
          {renderFilterTags()}

          <div className={styles.filterControls}>
            <div className={styles.filterItem}>
              <label>{t('auth_files.search_label')}</label>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('auth_files.search_placeholder')}
              />
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.state_label')}</label>
              <select className={styles.pageSizeSelect} value={stateFilter} onChange={(e) => setStateFilter(e.target.value as StateFilterValue)}>
                <option value="all">{t('auth_files.state_all')}</option>
                <option value="normal">{t('auth_files.state_normal')}</option>
                <option value="disabled">{t('auth_files.state_disabled')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.quota_filter_label')}</label>
              <select className={styles.pageSizeSelect} value={quotaFilter} onChange={(e) => setQuotaFilter(e.target.value as QuotaFilterValue)}>
                <option value="all">{t('auth_files.filter_all')}</option>
                <option value="unchecked">{t('auth_files.quota_level_unchecked')}</option>
                <option value="low">{t('auth_files.quota_level_low')}</option>
                <option value="medium">{t('auth_files.quota_level_medium')}</option>
                <option value="high">{t('auth_files.quota_level_high')}</option>
                <option value="full">{t('auth_files.quota_level_full')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.expiry_filter_label')}</label>
              <select className={styles.pageSizeSelect} value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value as ExpiryFilterValue)}>
                <option value="all">{t('auth_files.expiry_all')}</option>
                <option value="expired">{t('auth_files.expiry_expired')}</option>
                <option value="valid">{t('auth_files.expiry_valid')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.has_expiry_label')}</label>
              <select className={styles.pageSizeSelect} value={hasExpiryFilter} onChange={(e) => setHasExpiryFilter(e.target.value as HasExpiryFilterValue)}>
                <option value="all">{t('auth_files.filter_all')}</option>
                <option value="yes">{t('auth_files.has_expiry_yes')}</option>
                <option value="no">{t('auth_files.has_expiry_no')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.sort_by_label')}</label>
              <select className={styles.pageSizeSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortFieldValue)}>
                <option value="name">{t('auth_files.sort_name')}</option>
                <option value="modified">{t('auth_files.sort_modified')}</option>
                <option value="state">{t('auth_files.sort_state')}</option>
                <option value="quota_level">{t('auth_files.sort_quota_level')}</option>
                <option value="expires_at">{t('auth_files.sort_expires_at')}</option>
                <option value="next_retry_after">{t('auth_files.sort_next_retry_after')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.sort_order_label')}</label>
              <select className={styles.pageSizeSelect} value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrderValue)}>
                <option value="desc">{t('auth_files.sort_order_desc')}</option>
                <option value="asc">{t('auth_files.sort_order_asc')}</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.page_size_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) || 9);
                  setPage(1);
                }}
              >
                <option value={6}>6</option>
                <option value={9}>9</option>
                <option value={12}>12</option>
                <option value={18}>18</option>
                <option value={24}>24</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('common.info')}</label>
              <div className={styles.statsInfo}>
                {files.length} {t('auth_files.files_count')} · {formatFileSize(totalSize)}
              </div>
            </div>
          </div>
        </div>

        {/* 卡片网格 */}
        {loading ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : pageItems.length === 0 ? (
          <EmptyState title={t('auth_files.search_empty_title')} description={t('auth_files.search_empty_desc')} />
        ) : (
          <div className={styles.fileGrid}>
            {pageItems.map(renderFileCard)}
          </div>
        )}

        {/* 分页 */}
        {!loading && filtered.length > pageSize && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              {t('auth_files.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('auth_files.pagination_info', {
                current: currentPage,
                total: totalPages,
                count: filtered.length
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('auth_files.pagination_next')}
            </Button>
          </div>
        )}
      </Card>

      <Card
        title={titleNode}
        extra={
          <Button
            size="sm"
            onClick={() => openExcludedModal()}
            disabled={disableControls || excludedError === 'unsupported'}
          >
            {t('oauth_excluded.add')}
          </Button>
        }
      >
        {excludedError === 'unsupported' ? (
          <EmptyState
            title={t('oauth_excluded.upgrade_required_title')}
            description={t('oauth_excluded.upgrade_required_desc')}
          />
        ) : Object.keys(excluded).length === 0 ? (
          <EmptyState title={t('oauth_excluded.list_empty_all')} />
        ) : (
          <div className={styles.excludedList}>
            {Object.entries(excluded).map(([provider, models]) => (
              <div key={provider} className={styles.excludedItem}>
                <div className={styles.excludedInfo}>
                  <div className={styles.excludedProvider}>{provider}</div>
                  <div className={styles.excludedModels}>
                    {models?.length
                      ? t('oauth_excluded.model_count', { count: models.length })
                      : t('oauth_excluded.no_models')}
                  </div>
                </div>
                <div className={styles.excludedActions}>
                  <Button variant="secondary" size="sm" onClick={() => openExcludedModal(provider)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteExcluded(provider)}>
                    {t('oauth_excluded.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 详情弹窗 */}
      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={selectedFile?.name || t('auth_files.title_section')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => void refreshSelectedQuota()}
              loading={quotaRefreshing}
              disabled={!canRefreshQuota(selectedFile) || quotaRefreshing}
            >
              {t('auth_files.refresh_quota')}
            </Button>
            <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
              {t('common.close')}
            </Button>
            <Button
              onClick={() => {
                if (selectedFile) {
                  const text = JSON.stringify(selectedFile, null, 2);
                  navigator.clipboard.writeText(text).then(() => {
                    showNotification(t('notification.link_copied'), 'success');
                  });
                }
              }}
            >
              {t('common.copy')}
            </Button>
          </>
        }
      >
        {selectedFile && (
          <div className={styles.detailContent}>
            <div className={styles.detailSections}>
              <section className={styles.detailSection}>
                <h3>{t('auth_files.detail_basic')}</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.provider_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.provider || selectedFile.type || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.auth_index_label')}</span>
                    <span className={styles.detailValue}>{normalizeAuthIndexValue(selectedFile.auth_index ?? selectedFile.authIndex) || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.account_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.account || selectedFile.label || selectedFile.alias || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.email_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.email || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.prefix_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.prefix || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.proxy_url_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.proxy_url || '-'}</span>
                  </div>
                </div>
              </section>

              <section className={styles.detailSection}>
                <h3>{t('auth_files.detail_status')}</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.state_label')}</span>
                    <span className={styles.detailValue}>{getStateLabel(selectedFile)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.status_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.status || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.status_message_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.status_message || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.base_url_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.base_url || '-'}</span>
                  </div>
                </div>
              </section>

              <section className={styles.detailSection}>
                <h3>{t('auth_files.detail_quota')}</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.quota_filter_label')}</span>
                    <span className={styles.detailValue}>{getQuotaLevelLabel(selectedFile.quota_level)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.quota_checked_label')}</span>
                    <span className={styles.detailValue}>
                      {selectedFile.quota_checked === undefined ? '-' : selectedFile.quota_checked ? t('auth_files.boolean_yes') : t('auth_files.boolean_no')}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.quota_exceeded_label')}</span>
                    <span className={styles.detailValue}>
                      {selectedFile.quota_exceeded === undefined ? '-' : selectedFile.quota_exceeded ? t('auth_files.boolean_yes') : t('auth_files.boolean_no')}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.quota_backoff_level_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.quota_backoff_level || '-'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.quota_reason_label')}</span>
                    <span className={styles.detailValue}>{selectedFile.quota_reason || '-'}</span>
                  </div>
                </div>
                {canRefreshQuota(selectedFile) && (
                  <div className={styles.refreshHint}>{t('auth_files.refresh_quota_hint')}</div>
                )}
                {liveQuotaError && <div className={styles.quotaError}>{liveQuotaError}</div>}
                {renderCodexLiveQuota()}
                {renderGeminiCliLiveQuota()}
              </section>

              <section className={styles.detailSection}>
                <h3>{t('auth_files.detail_time')}</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.file_modified')}</span>
                    <span className={styles.detailValue}>{formatModified(selectedFile)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.last_refresh_label')}</span>
                    <span className={styles.detailValue}>{formatDateTime(selectedFile.last_refresh)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.expires_at_label')}</span>
                    <span className={styles.detailValue}>{hasExpiry(selectedFile) ? formatDateTime(selectedFile.expires_at) : t('auth_files.no_expiry')}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.next_retry_after_label')}</span>
                    <span className={styles.detailValue}>{formatDateTime(selectedFile.next_retry_after)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.next_recover_at_label')}</span>
                    <span className={styles.detailValue}>{formatDateTime(selectedFile.next_recover_at)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>{t('auth_files.updated_at_label')}</span>
                    <span className={styles.detailValue}>{formatDateTime(selectedFile.updated_at)}</span>
                  </div>
                </div>
              </section>

              <section className={styles.detailSection}>
                <h3>{t('auth_files.detail_raw')}</h3>
                <pre className={styles.jsonContent}>{JSON.stringify(selectedFile, null, 2)}</pre>
              </section>
            </div>
          </div>
        )}
      </Modal>

      {/* 模型列表弹窗 */}
      <Modal
        open={modelsModalOpen}
        onClose={() => setModelsModalOpen(false)}
        title={t('auth_files.models_title', { defaultValue: '支持的模型' }) + ` - ${modelsFileName}`}
        footer={
          <Button variant="secondary" onClick={() => setModelsModalOpen(false)}>
            {t('common.close')}
          </Button>
        }
      >
        {modelsLoading ? (
          <div className={styles.hint}>{t('auth_files.models_loading', { defaultValue: '正在加载模型列表...' })}</div>
        ) : modelsError === 'unsupported' ? (
          <EmptyState
            title={t('auth_files.models_unsupported', { defaultValue: '当前版本不支持此功能' })}
            description={t('auth_files.models_unsupported_desc', { defaultValue: '请更新 CLI Proxy API 到最新版本后重试' })}
          />
        ) : modelsList.length === 0 ? (
          <EmptyState
            title={t('auth_files.models_empty', { defaultValue: '该凭证暂无可用模型' })}
            description={t('auth_files.models_empty_desc', { defaultValue: '该认证凭证可能尚未被服务器加载或没有绑定任何模型' })}
          />
        ) : (
          <div className={styles.modelsList}>
            {modelsList.map((model) => {
              const isExcluded = isModelExcluded(model.id, modelsFileType);
              return (
                <div
                  key={model.id}
                  className={`${styles.modelItem} ${isExcluded ? styles.modelItemExcluded : ''}`}
                  onClick={() => {
                    navigator.clipboard.writeText(model.id);
                    showNotification(t('notification.link_copied', { defaultValue: '已复制到剪贴板' }), 'success');
                  }}
                  title={isExcluded ? t('auth_files.models_excluded_hint', { defaultValue: '此模型已被 OAuth 排除' }) : t('common.copy', { defaultValue: '点击复制' })}
                >
                  <span className={styles.modelId}>{model.id}</span>
                  {model.display_name && model.display_name !== model.id && (
                    <span className={styles.modelDisplayName}>{model.display_name}</span>
                  )}
                  {model.type && (
                    <span className={styles.modelType}>{model.type}</span>
                  )}
                  {isExcluded && (
                    <span className={styles.modelExcludedBadge}>{t('auth_files.models_excluded_badge', { defaultValue: '已排除' })}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* OAuth 排除弹窗 */}
      <Modal
        open={excludedModalOpen}
        onClose={() => setExcludedModalOpen(false)}
        title={t('oauth_excluded.add_title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcludedModalOpen(false)} disabled={savingExcluded}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveExcludedModels} loading={savingExcluded}>
              {t('oauth_excluded.save')}
            </Button>
          </>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.filterSection}>
          {renderFilterTags()}

          <div className={styles.filterContent}>
            <div className={styles.filterControlsPanel}>
              <div className={styles.filterControls}>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.search_label')}</label>
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder={t('auth_files.search_placeholder')}
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.page_size_label')}</label>
                  <input
                    className={styles.pageSizeSelect}
                    type="number"
                    min={MIN_CARD_PAGE_SIZE}
                    max={MAX_CARD_PAGE_SIZE}
                    step={1}
                    value={pageSizeInput}
                    onChange={handlePageSizeChange}
                    onBlur={(e) => commitPageSizeInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.sort_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={sortMode}
                    options={sortOptions}
                    onChange={handleSortModeChange}
                    ariaLabel={t('auth_files.sort_label')}
                    fullWidth
                  />
                </div>
                <div className={`${styles.filterItem} ${styles.filterToggleItem}`}>
                  <label>{t('auth_files.display_options_label')}</label>
                  <div className={styles.filterToggleGroup}>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={problemOnly}
                        onChange={(value) => {
                          setProblemOnly(value);
                          setPage(1);
                        }}
                        ariaLabel={t('auth_files.problem_filter_only')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.problem_filter_only')}
                          </span>
                        }
                      />
                    </div>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={compactMode}
                        onChange={(value) => setCompactMode(value)}
                        ariaLabel={t('auth_files.compact_mode_label')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.compact_mode_label')}
                          </span>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className={styles.hint}>{t('common.loading')}</div>
            ) : pageItems.length === 0 ? (
              <EmptyState
                title={t('auth_files.search_empty_title')}
                description={t('auth_files.search_empty_desc')}
              />
            ) : (
              <div
                className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''} ${compactMode ? styles.fileGridCompact : ''}`}
              >
                {pageItems.map((file) => (
                  <AuthFileCard
                    key={file.name}
                    file={file}
                    compact={compactMode}
                    selected={selectedFiles.has(file.name)}
                    resolvedTheme={resolvedTheme}
                    disableControls={disableControls}
                    deleting={deleting}
                    statusUpdating={statusUpdating}
                    quotaFilterType={quotaFilterType}
                    keyStats={keyStats}
                    statusBarCache={statusBarCache}
                    onShowModels={showModels}
                    onDownload={handleDownload}
                    onOpenPrefixProxyEditor={openPrefixProxyEditor}
                    onDelete={handleDelete}
                    onToggleStatus={handleStatusToggle}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            )}

            {!loading && sorted.length > pageSize && (
              <div className={styles.pagination}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  {t('auth_files.pagination_prev')}
                </Button>
                <div className={styles.pageInfo}>
                  {t('auth_files.pagination_info', {
                    current: currentPage,
                    total: totalPages,
                    count: sorted.length,
                  })}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                >
                  {t('auth_files.pagination_next')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <OAuthExcludedCard
        disableControls={disableControls}
        excludedError={excludedError}
        excluded={excluded}
        onAdd={() => openExcludedEditor()}
        onEdit={openExcludedEditor}
        onDelete={deleteExcluded}
      />

      <OAuthModelAliasCard
        disableControls={disableControls}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdd={() => openModelAliasEditor()}
        onEditProvider={openModelAliasEditor}
        onDeleteProvider={deleteModelAlias}
        modelAliasError={modelAliasError}
        modelAlias={modelAlias}
        allProviderModels={allProviderModels}
        onUpdate={handleMappingUpdate}
        onDeleteLink={handleDeleteLink}
        onToggleFork={handleToggleFork}
        onRenameAlias={handleRenameAlias}
        onDeleteAlias={handleDeleteAlias}
      />

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

      <AuthFilesPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onCopyText={copyTextWithNotification}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />

      <AuthFilesBatchFieldsEditorModal
        open={batchFieldsEditorOpen}
        disableControls={disableControls}
        selectedNames={selectedNames}
        state={batchFieldsEditor}
        onClose={closeBatchFieldsEditor}
        onToggleField={handleBatchFieldsEditorToggle}
        onChangeField={handleBatchFieldsEditorChange}
        onSubmit={() => void handleBatchFieldsEditorSave()}
      />

      {batchActionBarVisible && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.batchActionContainer} ref={floatingBatchActionsRef}>
              <div className={styles.batchActionBar}>
                <div className={styles.batchActionLeft}>
                  <span className={styles.batchSelectionText}>
                    {t('auth_files.batch_selected', { count: selectionCount })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_select_page')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(sorted)}
                    disabled={selectableFilteredItems.length === 0}
                  >
                    {t('auth_files.batch_select_filtered')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => invertVisibleSelection(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_invert_page')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    {t('auth_files.batch_deselect')}
                  </Button>
                </div>
                <div className={styles.batchActionRight}>
                  <Button
                    size="sm"
                    onClick={openBatchFieldsEditor}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_edit_button')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void batchDownload(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_download')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, true)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, false)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_disable')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => batchDelete(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
