import {
  useCallback,
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { animate, type AnimationPlaybackControlsWithThen } from '@/utils/animate';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconFilterAll } from '@/components/ui/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { copyToClipboard } from '@/utils/clipboard';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  getAuthFileIcon,
  getTypeColor,
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  parsePriorityValue,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import {
  AuthFilesBatchFieldsEditorModal,
  type AuthFilesBatchFieldsEditorState,
} from '@/features/authFiles/components/AuthFilesBatchFieldsEditorModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  isAuthFilesExpiryFilter,
  isAuthFilesQuotaFilter,
  isAuthFilesSortMode,
  isAuthFilesStatusFilter,
  readAuthFilesUiState,
  writeAuthFilesUiState,
  type AuthFilesExpiryFilter,
  type AuthFilesQuotaFilter,
  type AuthFilesSortMode,
  type AuthFilesStatusFilter,
} from '@/features/authFiles/uiState';
import { authFilesApi } from '@/services/api/authFiles';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import type { ApiError, AuthFileItem } from '@/types';
import styles from './AuthFilesPage.module.scss';

const easePower3Out = (progress: number) => 1 - (1 - progress) ** 4;
const easePower2In = (progress: number) => progress ** 3;
const BATCH_BAR_BASE_TRANSFORM = 'translateX(-50%)';
const BATCH_BAR_HIDDEN_TRANSFORM = 'translateX(-50%) translateY(56px)';
const DEFAULT_REGULAR_PAGE_SIZE = 9;
const DEFAULT_COMPACT_PAGE_SIZE = 12;
const EXPIRY_SOON_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTA_LEVEL_RANK = {
  unchecked: 0,
  low: 1,
  medium: 2,
  high: 3,
  full: 4,
} as const;
type DerivedQuotaLevel = keyof typeof QUOTA_LEVEL_RANK;

type BatchEditableField = 'prefix' | 'priority' | 'note' | 'headers';

const createInitialBatchFieldsEditorState = (): AuthFilesBatchFieldsEditorState => ({
  prefixEnabled: false,
  prefix: '',
  priorityEnabled: false,
  priority: '',
  noteEnabled: false,
  note: '',
  headersEnabled: false,
  headersText: '',
  saving: false,
});

const parseBatchHeadersInput = (rawText: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid header line: ${line}`);
    }

    const name = line.slice(0, separatorIndex).trim();
    if (!name) {
      throw new Error(`Invalid header line: ${line}`);
    }

    headers[name] = line.slice(separatorIndex + 1).trim();
  });

  return headers;
};

const toTrimmedString = (value: unknown) => String(value ?? '').trim();

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return null;
};

const getTimestamp = (value: unknown): number | null => {
  const normalized = toTrimmedString(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
};

const isQuotaChecked = (file: AuthFileItem) => {
  const checked = parseBoolean(file.quota_checked);
  if (checked !== null) return checked;
  return Boolean(
    toTrimmedString(file.quota_level) ||
      toTrimmedString(file.quota_reason) ||
      toTrimmedString(file.updated_at) ||
      toTrimmedString(file.next_retry_after) ||
      toTrimmedString(file.next_recover_at) ||
      parseBoolean(file.quota_exceeded)
  );
};

const getQuotaLevel = (file: AuthFileItem): DerivedQuotaLevel => {
  if (!isQuotaChecked(file)) return 'unchecked';
  const normalized = toTrimmedString(file.quota_level).toLowerCase();
  if (['max', 'maximum', 'full', 'available'].includes(normalized)) return 'full';
  if (normalized === 'high') return 'high';
  if (['medium', 'mid'].includes(normalized)) return 'medium';
  if (
    ['low', 'limited', 'warning', 'critical', 'exceeded', 'empty', 'none'].includes(normalized)
  ) {
    return 'low';
  }
  return parseBoolean(file.quota_exceeded) ? 'low' : 'medium';
};

const getExpiryTimestamp = (file: AuthFileItem) => getTimestamp(file.expires_at);

const getCooldownTimestamp = (file: AuthFileItem) =>
  getTimestamp(file.next_retry_after ?? file.next_recover_at);

const matchesStatusFilter = (file: AuthFileItem, statusFilter: AuthFilesStatusFilter) => {
  if (statusFilter === 'all') return true;
  return statusFilter === 'disabled' ? Boolean(file.disabled) : !file.disabled;
};

const matchesQuotaFilter = (file: AuthFileItem, quotaFilter: AuthFilesQuotaFilter) => {
  if (quotaFilter === 'all') return true;
  return getQuotaLevel(file) === quotaFilter;
};

const matchesExpiryFilter = (
  file: AuthFileItem,
  expiryFilter: AuthFilesExpiryFilter,
  now: number
) => {
  if (expiryFilter === 'all') return true;
  const expiresAt = getExpiryTimestamp(file);
  if (expiryFilter === 'has_value') return expiresAt !== null;
  if (expiryFilter === 'no_value') return expiresAt === null;
  if (expiresAt === null) return false;
  if (expiryFilter === 'expired') return expiresAt <= now;
  return expiresAt > now && expiresAt - now <= EXPIRY_SOON_MS;
};

const matchesSearch = (file: AuthFileItem, term: string) => {
  if (!term) return true;
  return [
    file.name,
    file.type,
    file.provider,
    file.account,
    file.email,
    file.label,
    file.alias,
    file.prefix,
    file.auth_index,
    file.authIndex,
    file.status,
    file.status_message,
    file.statusMessage,
  ].some((value) => toTrimmedString(value).toLowerCase().includes(term));
};

const compareOptionalNumber = (left: number | null, right: number | null) => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
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

  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<AuthFilesStatusFilter>('all');
  const [quotaFilter, setQuotaFilter] = useState<AuthFilesQuotaFilter>('all');
  const [expiryFilter, setExpiryFilter] = useState<AuthFilesExpiryFilter>('all');
  const [pageSizeByMode, setPageSizeByMode] = useState({
    regular: DEFAULT_REGULAR_PAGE_SIZE,
    compact: DEFAULT_COMPACT_PAGE_SIZE,
  });
  const [pageSizeInput, setPageSizeInput] = useState('9');
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [reloadingFromStore, setReloadingFromStore] = useState(false);
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>('default');
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const [batchFieldsEditorOpen, setBatchFieldsEditorOpen] = useState(false);
  const [batchFieldsEditor, setBatchFieldsEditor] = useState<AuthFilesBatchFieldsEditorState>(
    createInitialBatchFieldsEditorState
  );
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const previousSelectionCountRef = useRef(0);
  const selectionCountRef = useRef(0);

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
  const normalizedFilter = normalizeProviderKey(String(filter));
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;
  const pageSize = compactMode ? pageSizeByMode.compact : pageSizeByMode.regular;

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
    if (isAuthFilesStatusFilter(persisted.statusFilter)) {
      setStatusFilter(persisted.statusFilter);
    }
    if (isAuthFilesQuotaFilter(persisted.quotaFilter)) {
      setQuotaFilter(persisted.quotaFilter);
    }
    if (isAuthFilesExpiryFilter(persisted.expiryFilter)) {
      setExpiryFilter(persisted.expiryFilter);
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
      statusFilter,
      quotaFilter,
      expiryFilter,
    });
  }, [
    compactMode,
    expiryFilter,
    filter,
    page,
    pageSize,
    pageSizeByMode,
    problemOnly,
    quotaFilter,
    search,
    sortMode,
    statusFilter,
  ]);

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
    },
    [sortMode]
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
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadKeyStats, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

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
      { value: 'quota', label: t('auth_files.sort_quota') },
      { value: 'expires_at', label: t('auth_files.sort_expires_at') },
      { value: 'cooldown', label: t('auth_files.sort_cooldown') },
    ],
    [t]
  );

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('auth_files.status_filter_all') },
      { value: 'enabled', label: t('auth_files.status_filter_enabled') },
      { value: 'disabled', label: t('auth_files.status_filter_disabled') },
    ],
    [t]
  );

  const quotaFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('auth_files.quota_filter_all') },
      { value: 'unchecked', label: t('auth_files.quota_filter_unchecked') },
      { value: 'low', label: t('auth_files.quota_filter_low') },
      { value: 'medium', label: t('auth_files.quota_filter_medium') },
      { value: 'high', label: t('auth_files.quota_filter_high') },
      { value: 'full', label: t('auth_files.quota_filter_full') },
    ],
    [t]
  );

  const expiryFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('auth_files.expiry_filter_all') },
      { value: 'expired', label: t('auth_files.expiry_filter_expired') },
      { value: 'expiring_soon', label: t('auth_files.expiry_filter_expiring_soon') },
      { value: 'has_value', label: t('auth_files.expiry_filter_has_value') },
      { value: 'no_value', label: t('auth_files.expiry_filter_no_value') },
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
    const term = search.trim().toLowerCase();
    const now = Date.now();
    return filesMatchingProblemFilter.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      return (
        matchType &&
        matchesStatusFilter(item, statusFilter) &&
        matchesQuotaFilter(item, quotaFilter) &&
        matchesExpiryFilter(item, expiryFilter, now) &&
        matchesSearch(item, term)
      );
    });
  }, [expiryFilter, filesMatchingProblemFilter, filter, quotaFilter, search, statusFilter]);

  const downloadableFilteredFiles = useMemo(
    () => filtered.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [filtered]
  );

  const downloadableAllFiles = useMemo(
    () => files.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [files]
  );

  const hasActiveFilter =
    filter !== 'all' ||
    problemOnly ||
    statusFilter !== 'all' ||
    quotaFilter !== 'all' ||
    expiryFilter !== 'all' ||
    Boolean(search.trim());

  const batchDownloadArchiveName = useMemo(() => {
    const segments = ['auth-files'];
    if (filter !== 'all') {
      const normalized = normalizeProviderKey(String(filter));
      if (normalized) {
        segments.push(normalized);
      }
    }
    if (problemOnly) {
      segments.push('problem');
    }
    if (search.trim()) {
      segments.push('filtered');
    }
    return `${segments.join('-')}.zip`;
  }, [filter, problemOnly, search]);

  const batchDownloadAllArchiveName = useMemo(() => 'auth-files-all.zip', []);

  const requestBatchDownload = useCallback(
    (targetFiles: AuthFileItem[], archiveName: string) => {
      const count = targetFiles.length;

      // Large exports can easily hit browser resource limits, especially when each file
      // must be downloaded first and then packed into a ZIP archive in memory.
      // Surface an explicit warning for the full-export path so the user sees the cause.
      const CONFIRM_THRESHOLD = 2000;
      if (count >= CONFIRM_THRESHOLD) {
        showConfirmation({
          title: t('auth_files.batch_download_large_title', { defaultValue: 'Too many files' }),
          message: (
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                {t('auth_files.batch_download_large_message', {
                  count,
                  defaultValue:
                    'This export will try to download and zip {{count}} auth files. Very large exports may hit browser resource limits and fail.',
                })}
              </div>
              <div style={{ opacity: 0.85 }}>
                {t('auth_files.batch_download_large_hint', {
                  defaultValue:
                    'Filter by provider before exporting when possible. For full exports, prefer a local script that writes files to a directory first.',
                })}
              </div>
            </div>
          ),
          variant: 'secondary',
          confirmText: t('auth_files.batch_download_large_confirm', {
            defaultValue: 'Continue download',
          }),
          cancelText: t('common.cancel'),
          onConfirm: async () => {
            await handleBatchDownload(targetFiles, { archiveName });
          },
        });
        return;
      }

      void handleBatchDownload(targetFiles, { archiveName });
    },
    [handleBatchDownload, showConfirmation, t]
  );
  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortMode === 'default') {
      copy.sort((a, b) => {
        const providerA = normalizeProviderKey(String(a.provider ?? a.type ?? 'unknown'));
        const providerB = normalizeProviderKey(String(b.provider ?? b.type ?? 'unknown'));
        const providerCompare = providerA.localeCompare(providerB);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'az') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'priority') {
      copy.sort((a, b) => {
        const pa = parsePriorityValue(a.priority ?? a['priority']) ?? 0;
        const pb = parsePriorityValue(b.priority ?? b['priority']) ?? 0;
        return pb - pa;
      });
    } else if (sortMode === 'quota') {
      copy.sort((a, b) => {
        const quotaCompare = QUOTA_LEVEL_RANK[getQuotaLevel(b)] - QUOTA_LEVEL_RANK[getQuotaLevel(a)];
        if (quotaCompare !== 0) return quotaCompare;
        const cooldownCompare = compareOptionalNumber(getCooldownTimestamp(a), getCooldownTimestamp(b));
        if (cooldownCompare !== 0) return cooldownCompare;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'expires_at') {
      copy.sort((a, b) => {
        const expiresCompare = compareOptionalNumber(getExpiryTimestamp(a), getExpiryTimestamp(b));
        if (expiresCompare !== 0) return expiresCompare;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'cooldown') {
      copy.sort((a, b) => {
        const cooldownCompare = compareOptionalNumber(getCooldownTimestamp(a), getCooldownTimestamp(b));
        if (cooldownCompare !== 0) return cooldownCompare;
        return a.name.localeCompare(b.name);
      });
    }
    return copy;
  }, [filtered, sortMode]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);
  const selectablePageItems = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems]
  );
  const selectableFilteredItems = useMemo(
    () => sorted.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [sorted]
  );
  const selectedNames = useMemo(() => Array.from(selectedFiles), [selectedFiles]);
  const selectedHasStatusUpdating = useMemo(
    () => selectedNames.some((name) => statusUpdating[name] === true),
    [selectedNames, statusUpdating]
  );
  const batchStatusButtonsDisabled =
    disableControls ||
    selectedNames.length === 0 ||
    batchStatusUpdating ||
    selectedHasStatusUpdating;

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const closeBatchFieldsEditor = useCallback(() => {
    if (batchFieldsEditor.saving) return;
    setBatchFieldsEditorOpen(false);
    setBatchFieldsEditor(createInitialBatchFieldsEditorState());
  }, [batchFieldsEditor.saving]);

  const openBatchFieldsEditor = useCallback(() => {
    if (selectedNames.length === 0) {
      showNotification(t('auth_files.batch_edit_no_files'), 'warning');
      return;
    }
    setBatchFieldsEditor(createInitialBatchFieldsEditorState());
    setBatchFieldsEditorOpen(true);
  }, [selectedNames.length, showNotification, t]);

  const handleBatchFieldsEditorToggle = useCallback((field: BatchEditableField, enabled: boolean) => {
    setBatchFieldsEditor((current) => {
      switch (field) {
        case 'prefix':
          return { ...current, prefixEnabled: enabled };
        case 'priority':
          return { ...current, priorityEnabled: enabled };
        case 'note':
          return { ...current, noteEnabled: enabled };
        case 'headers':
          return { ...current, headersEnabled: enabled };
        default:
          return current;
      }
    });
  }, []);

  const handleBatchFieldsEditorChange = useCallback((field: BatchEditableField, value: string) => {
    setBatchFieldsEditor((current) => {
      switch (field) {
        case 'prefix':
          return { ...current, prefix: value };
        case 'priority':
          return { ...current, priority: value };
        case 'note':
          return { ...current, note: value };
        case 'headers':
          return { ...current, headersText: value };
        default:
          return current;
      }
    });
  }, []);

  const handleBatchFieldsEditorSave = useCallback(async () => {
    if (selectedNames.length === 0) {
      showNotification(t('auth_files.batch_edit_no_files'), 'warning');
      return;
    }

    const payload: Parameters<typeof authFilesApi.patchFieldsBatch>[0] = {
      names: selectedNames,
    };

    if (batchFieldsEditor.prefixEnabled) {
      payload.prefix = batchFieldsEditor.prefix;
    }

    if (batchFieldsEditor.priorityEnabled) {
      const rawPriority = batchFieldsEditor.priority.trim();
      if (!rawPriority) {
        payload.priority = 0;
      } else {
        const parsedPriority = Number(rawPriority);
        if (!Number.isInteger(parsedPriority)) {
          showNotification(t('auth_files.batch_edit_priority_invalid'), 'error');
          return;
        }
        payload.priority = parsedPriority;
      }
    }

    if (batchFieldsEditor.noteEnabled) {
      payload.note = batchFieldsEditor.note;
    }

    if (batchFieldsEditor.headersEnabled) {
      try {
        payload.headers = parseBatchHeadersInput(batchFieldsEditor.headersText);
      } catch {
        showNotification(t('auth_files.batch_edit_headers_invalid'), 'error');
        return;
      }
      if (Object.keys(payload.headers).length === 0) {
        showNotification(t('auth_files.batch_edit_headers_empty'), 'warning');
        return;
      }
    }

    const hasEditableField =
      payload.prefix !== undefined ||
      payload.priority !== undefined ||
      payload.note !== undefined ||
      payload.headers !== undefined;

    if (!hasEditableField) {
      showNotification(t('auth_files.batch_edit_no_fields'), 'warning');
      return;
    }

    setBatchFieldsEditor((current) => ({ ...current, saving: true }));
    try {
      const response = await authFilesApi.patchFieldsBatch(payload);
      showNotification(
        t('auth_files.batch_edit_success', {
          updated: response.summary.updated,
          unchanged: response.summary.unchanged,
          failed: response.summary.failed,
          skipped: response.summary.skipped,
        }),
        response.summary.failed > 0 ? 'warning' : 'success'
      );
      await Promise.all([loadFiles(), refreshKeyStats()]);
      deselectAll();
      setBatchFieldsEditorOpen(false);
      setBatchFieldsEditor(createInitialBatchFieldsEditorState());
    } catch (error) {
      const message = error instanceof Error ? error.message : t('notification.save_failed');
      showNotification(message, 'error');
      setBatchFieldsEditor((current) => ({ ...current, saving: false }));
    }
  }, [batchFieldsEditor, deselectAll, loadFiles, refreshKeyStats, selectedNames, showNotification, t]);

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) {
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
      return;
    }

    const updatePadding = () => {
      const height = actionsEl.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--auth-files-action-bar-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(actionsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
    };
  }, [batchActionBarVisible, selectionCount]);

  useEffect(() => {
    selectionCountRef.current = selectionCount;
    if (selectionCount > 0) {
      setBatchActionBarVisible(true);
    }
  }, [selectionCount]);

  useLayoutEffect(() => {
    if (!batchActionBarVisible) return;
    const currentCount = selectionCount;
    const previousCount = previousSelectionCountRef.current;
    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

    batchActionAnimationRef.current?.stop();
    batchActionAnimationRef.current = null;

    if (currentCount > 0 && previousCount === 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_HIDDEN_TRANSFORM, BATCH_BAR_BASE_TRANSFORM],
          opacity: [0, 1],
        },
        {
          duration: 0.28,
          ease: easePower3Out,
          onComplete: () => {
            actionsEl.style.transform = BATCH_BAR_BASE_TRANSFORM;
            actionsEl.style.opacity = '1';
          },
        }
      );
    } else if (currentCount === 0 && previousCount > 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_BASE_TRANSFORM, BATCH_BAR_HIDDEN_TRANSFORM],
          opacity: [1, 0],
        },
        {
          duration: 0.22,
          ease: easePower2In,
          onComplete: () => {
            if (selectionCountRef.current === 0) {
              setBatchActionBarVisible(false);
            }
          },
        }
      );
    }

    previousSelectionCountRef.current = currentCount;
  }, [batchActionBarVisible, selectionCount]);

  useEffect(
    () => () => {
      batchActionAnimationRef.current?.stop();
      batchActionAnimationRef.current = null;
    },
    []
  );

  const renderFilterTags = () => (
    <aside className={styles.filterRail}>
      <div className={styles.filterRailHeader}>
        <span className={styles.filterRailEyebrow}>
          {t('nav.ai_providers', { defaultValue: 'Providers' })}
        </span>
        <div className={styles.filterRailHero}>
          <div className={styles.filterRailHeroTitle}>
            {filter === 'all' ? (
              <span className={`${styles.filterRailHeroIcon} ${styles.filterAllIconWrap}`}>
                <IconFilterAll className={styles.filterAllIcon} size={22} />
              </span>
            ) : (
              <div className={styles.filterRailHeroIcon}>
                {activeFilterIcon ? (
                  <img src={activeFilterIcon} alt="" className={styles.filterRailHeroIconImage} />
                ) : (
                  <span className={styles.filterRailHeroIconFallback}>
                    {activeFilterLabel.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
            )}
            <div className={styles.filterRailHeroText}>
              <span className={styles.filterRailTitle}>{activeFilterLabel}</span>
              <span className={styles.filterRailDescription}>{t('auth_files.title_section')}</span>
            </div>
          </div>
          <div className={styles.filterRailMeta}>
            <span className={styles.filterRailCount}>{activeFilterCount}</span>
            {problemOnly && (
              <span className={styles.filterRailMode}>{t('auth_files.problem_filter_only')}</span>
            )}
          </div>
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
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={handleHeaderRefresh} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleReloadFromStore()}
              disabled={disableControls || loading || uploading || reloadingFromStore}
              loading={reloadingFromStore}
            >
              {t('auth_files.reload_from_store_button')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => requestBatchDownload(downloadableAllFiles, batchDownloadAllArchiveName)}
              disabled={
                disableControls ||
                loading ||
                uploading ||
                batchDownloading ||
                downloadableAllFiles.length === 0
              }
              loading={batchDownloading}
            >
              {t('auth_files.batch_download_all_button', {
                defaultValue: 'Download all',
              })}
            </Button>
            {hasActiveFilter ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => requestBatchDownload(downloadableFilteredFiles, batchDownloadArchiveName)}
                disabled={
                  disableControls ||
                  loading ||
                  uploading ||
                  batchDownloading ||
                  downloadableFilteredFiles.length === 0
                }
                loading={batchDownloading}
              >
                {t('auth_files.batch_download_button', {
                  defaultValue: 'Download filtered',
                })}
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              {t('auth_files.upload_button')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                handleDeleteAll({
                  filter,
                  problemOnly,
                  onResetFilterToAll: () => setFilter('all'),
                  onResetProblemOnly: () => setProblemOnly(false),
                })
              }
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {deleteAllButtonLabel}
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
                <div className={styles.filterItem}>
                  <label>{t('auth_files.status_filter_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={statusFilter}
                    options={statusFilterOptions}
                    onChange={(value) => {
                      if (!isAuthFilesStatusFilter(value)) return;
                      setStatusFilter(value);
                      setPage(1);
                    }}
                    ariaLabel={t('auth_files.status_filter_label')}
                    fullWidth
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.quota_filter_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={quotaFilter}
                    options={quotaFilterOptions}
                    onChange={(value) => {
                      if (!isAuthFilesQuotaFilter(value)) return;
                      setQuotaFilter(value);
                      setPage(1);
                    }}
                    ariaLabel={t('auth_files.quota_filter_label')}
                    fullWidth
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.expiry_filter_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={expiryFilter}
                    options={expiryFilterOptions}
                    onChange={(value) => {
                      if (!isAuthFilesExpiryFilter(value)) return;
                      setExpiryFilter(value);
                      setPage(1);
                    }}
                    ariaLabel={t('auth_files.expiry_filter_label')}
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
