/**
 * Generic quota section component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  ResolvedTheme,
} from '@/types';
import { authFilesApi } from '@/services/api';
import { IconRefreshCw } from '@/components/ui/icons';
import { isRuntimeOnlyAuthFile } from '@/utils/quota/validators';
import { QuotaCard, QuotaProgressBar, type QuotaStatusState } from './QuotaCard';
import type { QuotaConfig } from './quotaConfigs';
import { useGridColumns } from './useGridColumns';
import { useQuotaLoader, type QuotaLoadProgress } from './useQuotaLoader';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

type ViewMode = 'paged' | 'all';
type QuotaPanelTab = 'summary' | 'credentials';
type RefreshScope = 'page' | 'all';

interface PendingQuotaRefreshRequest {
  scope: RefreshScope;
  concurrency: number;
}

const MAX_SHOW_ALL_THRESHOLD = 500;
const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500, 1000] as const;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_REFRESH_CONCURRENCY = 10;
const MAX_REFRESH_CONCURRENCY = 1000;

interface QuotaPaginationState<T> {
  pageSize: number;
  totalPages: number;
  currentPage: number;
  pageItems: T[];
  setPageSize: (size: number, resetPage?: boolean) => void;
  goToPrev: () => void;
  goToNext: () => void;
  goToPage: (page: number) => void;
  loading: boolean;
  loadingScope: 'page' | 'all' | null;
  setLoading: (loading: boolean, scope?: 'page' | 'all' | null) => void;
}

const useQuotaPagination = <T,>(items: T[], defaultPageSize = 6): QuotaPaginationState<T> => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [loading, setLoadingState] = useState(false);
  const [loadingScope, setLoadingScope] = useState<'page' | 'all' | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize]
  );

  const currentPage = useMemo(() => Math.min(page, totalPages), [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const setPageSize = useCallback((size: number, resetPage = true) => {
    setPageSizeState((prev) => {
      if (prev === size) return prev;
      if (resetPage) setPage(1);
      return size;
    });
  }, []);

  const goToPrev = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const goToPage = useCallback(
    (target: number) => {
      setPage(Math.max(1, Math.min(totalPages, target)));
    },
    [totalPages]
  );

  const setLoading = useCallback((isLoading: boolean, scope?: 'page' | 'all' | null) => {
    setLoadingState(isLoading);
    setLoadingScope(isLoading ? (scope ?? null) : null);
  }, []);

  return {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    goToPage,
    loading,
    loadingScope,
    setLoading,
  };
};

interface QuotaSectionProps<TState extends QuotaStatusState, TData> {
  config: QuotaConfig<TState, TData>;
  files: AuthFileItem[];
  loading: boolean;
  disabled: boolean;
  onFileDeleted?: (name: string) => void;
}

interface QuotaSummaryRow {
  id: string;
  label: string;
  modelNames: string[];
  resetLabels: string[];
  credentialCount: number;
  remainingValues: number[];
}

interface QuotaSummaryItem extends QuotaSummaryRow {
  averageRemaining: number | null;
}

export function QuotaSection<TState extends QuotaStatusState, TData>({
  config,
  files,
  loading,
  disabled,
  onFileDeleted,
}: QuotaSectionProps<TState, TData>) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  // Delete state management
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [deletingFailedFiles, setDeletingFailedFiles] = useState(false);
  // Single card refresh state
  const [refreshingFile, setRefreshingFile] = useState<string | null>(null);

  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    completed: number;
    success: number;
    error: number;
  } | null>(null);

  const [, gridRef] = useGridColumns(220); // Keep in sync with QuotaPage.module.scss grid min width
  const storageKey = `quota_view_mode_${config.type}`;
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'paged';
    const saved = localStorage.getItem(storageKey);
    return saved === 'all' ? 'all' : 'paged';
  });
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, mode);
      }
    },
    [storageKey]
  );

  const [pageSizeOption, setPageSizeOption] = useState<number>(DEFAULT_PAGE_SIZE);
  const [showTooManyWarning, setShowTooManyWarning] = useState(false);
  const [activeTab, setActiveTab] = useState<QuotaPanelTab>('summary');
  const [refreshModalOpen, setRefreshModalOpen] = useState(false);
  const [refreshConcurrencyInput, setRefreshConcurrencyInput] = useState(
    String(DEFAULT_REFRESH_CONCURRENCY)
  );
  const [refreshConcurrencyError, setRefreshConcurrencyError] = useState('');
  const [refreshProgress, setRefreshProgress] = useState<QuotaLoadProgress | null>(null);

  const filteredFiles = useMemo(
    () => files.filter((file) => config.filterFn(file)),
    [files, config]
  );

  const { quota, loadQuota, loadQuotaSequential } = useQuotaLoader(config);

  // Status filter: all | idle | success | error
  const [statusFilter, setStatusFilter] = useState<'all' | 'idle' | 'success' | 'error'>('all');

  const displayFiles = useMemo(() => {
    if (statusFilter === 'all') return filteredFiles;
    return filteredFiles.filter((file) => {
      const state = quota[file.name]?.status ?? 'idle';
      return state === statusFilter;
    });
  }, [filteredFiles, quota, statusFilter]);

  const failedDisplayFiles = useMemo(
    () =>
      displayFiles.filter(
        (file) => quota[file.name]?.status === 'error' && !isRuntimeOnlyAuthFile(file)
      ),
    [displayFiles, quota]
  );

  const showAllAllowed = displayFiles.length <= MAX_SHOW_ALL_THRESHOLD;
  const effectiveViewMode: ViewMode = viewMode === 'all' && !showAllAllowed ? 'paged' : viewMode;

  const {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    goToPage,
    loading: sectionLoading,
    setLoading,
  } = useQuotaPagination(displayFiles, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (showAllAllowed) return;
    if (viewMode !== 'all') return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setViewMode('paged');
      setShowTooManyWarning(true);
    });

    return () => {
      cancelled = true;
    };
  }, [showAllAllowed, viewMode, setViewMode]);

  // Update page size based on view mode and user selection
  useEffect(() => {
    if (effectiveViewMode === 'all') {
      setPageSize(Math.max(1, displayFiles.length), false);
    } else {
      setPageSize(pageSizeOption);
    }
  }, [effectiveViewMode, displayFiles.length, pageSizeOption, setPageSize]);

  const pendingQuotaRefreshRef = useRef<PendingQuotaRefreshRequest | null>(null);
  const stopRefreshRef = useRef(false);
  const prevFilesLoadingRef = useRef(loading);

  const parseRefreshConcurrency = useCallback((): number | null => {
    const parsed = Number.parseInt(refreshConcurrencyInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRefreshConcurrencyError(t('quota_management.refresh_concurrency_invalid'));
      return null;
    }

    setRefreshConcurrencyError('');
    return Math.min(parsed, MAX_REFRESH_CONCURRENCY);
  }, [refreshConcurrencyInput, t]);

  const handleOpenRefreshModal = useCallback(() => {
    setRefreshConcurrencyError('');
    setRefreshModalOpen(true);
  }, []);

  const handleStopRefresh = useCallback(() => {
    stopRefreshRef.current = true;
  }, []);

  const handleStartRefresh = useCallback(
    (scope: RefreshScope) => {
      const concurrency = parseRefreshConcurrency();
      if (!concurrency) return;

      setBatchProgress(null);
      pendingQuotaRefreshRef.current = { scope, concurrency };
      stopRefreshRef.current = false;
      setRefreshProgress(null);
      setRefreshModalOpen(false);
      void triggerHeaderRefresh();
    },
    [parseRefreshConcurrency]
  );

  const removeDeletedFiles = useCallback(
    (deletedNames: string[]) => {
      if (deletedNames.length === 0) return;

      setQuota((prev) => {
        const next = { ...prev };
        deletedNames.forEach((name) => {
          delete next[name];
        });
        return next;
      });

      deletedNames.forEach((name) => {
        onFileDeleted?.(name);
      });
    },
    [onFileDeleted, setQuota]
  );

  // Delete handler
  const handleDelete = useCallback(
    async (name: string) => {
      if (!window.confirm(t('quota_management.delete_confirm', { name }))) return;

      setDeletingFile(name);
      try {
        await authFilesApi.deleteFile(name);
        removeDeletedFiles([name]);
        showNotification(t('quota_management.delete_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t('common.unknown_error');
        showNotification(t('quota_management.delete_failed', { message: errorMessage }), 'error');
      } finally {
        setDeletingFile(null);
      }
    },
    [removeDeletedFiles, showNotification, t]
  );

  const handleDeleteFailedFiles = useCallback(() => {
    if (failedDisplayFiles.length === 0) {
      showNotification(
        t('quota_management.delete_failed_empty', {
          defaultValue: '当前失败列表中没有可删除的认证文件',
        }),
        'info'
      );
      return;
    }

    showConfirmation({
      title: t('quota_management.delete_failed_title', {
        defaultValue: '删除失败认证文件',
      }),
      message: t('quota_management.delete_failed_confirm_batch', {
        count: failedDisplayFiles.length,
        defaultValue: '确定要删除当前失败列表中的 {{count}} 个认证文件吗？',
      }),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        setDeletingFailedFiles(true);
        try {
          const results = await Promise.allSettled(
            failedDisplayFiles.map((file) => authFilesApi.deleteFile(file.name))
          );

          const deletedNames: string[] = [];
          let failedCount = 0;

          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              deletedNames.push(failedDisplayFiles[index].name);
            } else {
              failedCount += 1;
            }
          });

          removeDeletedFiles(deletedNames);

          if (failedCount === 0) {
            showNotification(
              t('quota_management.delete_failed_success_batch', {
                count: deletedNames.length,
                defaultValue: '已删除 {{count}} 个失败认证文件',
              }),
              'success'
            );
          } else if (deletedNames.length > 0) {
            showNotification(
              t('quota_management.delete_failed_partial_batch', {
                success: deletedNames.length,
                failed: failedCount,
                defaultValue: '失败认证文件删除完成，成功 {{success}} 个，失败 {{failed}} 个',
              }),
              'warning'
            );
          } else {
            showNotification(
              t('quota_management.delete_failed_request_failed', {
                defaultValue: '删除失败认证文件失败',
              }),
              'error'
            );
          }
        } finally {
          setDeletingFailedFiles(false);
        }
      },
    });
  }, [failedDisplayFiles, removeDeletedFiles, showConfirmation, showNotification, t]);

  // Single card refresh handler
  const handleRefreshSingle = useCallback(
    (name: string) => {
      const file = filteredFiles.find((item) => item.name === name);
      if (!file) return;

      setBatchProgress(null);
      setRefreshingFile(name);
      setQuota((prev) => ({
        ...prev,
        [name]: config.buildLoadingState(),
      }));

      void loadQuota([file], 'page', setLoading, {
        onProgress: (progress) => {
          if (progress.completed >= progress.total || progress.stopped) {
            setRefreshingFile(null);
          }
        },
      });
    },
    [config, filteredFiles, loadQuota, setLoading, setQuota]
  );

  useEffect(() => {
    const wasLoading = prevFilesLoadingRef.current;
    prevFilesLoadingRef.current = loading;

    const pendingRefresh = pendingQuotaRefreshRef.current;
    if (!pendingRefresh) return;
    if (loading) return;
    if (!wasLoading) return;

    pendingQuotaRefreshRef.current = null;

    const scope = pendingRefresh.scope;
    const targets = scope === 'all' ? filteredFiles : pageItems;
    if (targets.length === 0) return;

    void (async () => {
      await loadQuota(targets, scope, setLoading, {
        concurrency: pendingRefresh.concurrency,
        shouldStop: () => stopRefreshRef.current,
        onProgress: (progress) => setRefreshProgress(progress),
      });

      if (stopRefreshRef.current) {
        showNotification(t('quota_management.refresh_stopped'), 'warning');
      }
      stopRefreshRef.current = false;
    })();
  }, [loading, filteredFiles, pageItems, loadQuota, setLoading, showNotification, t]);

  useEffect(() => {
    if (loading) return;
    if (filteredFiles.length === 0) {
      setQuota({});
      return;
    }

    setQuota((prev) => {
      const nextState: Record<string, TState> = {};
      filteredFiles.forEach((file) => {
        const cached = prev[file.name];
        if (cached) {
          nextState[file.name] = cached;
        }
      });
      return nextState;
    });
  }, [filteredFiles, loading, setQuota]);

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t(`${config.i18nPrefix}.title`)}</span>
      {filteredFiles.length > 0 && (
        <span className={styles.countBadge}>
          {statusFilter !== 'all'
            ? `${displayFiles.length}/${filteredFiles.length}`
            : filteredFiles.length}
        </span>
      )}
    </div>
  );

  const isBusy = sectionLoading || loading;

  const summaryRows = useMemo(() => {
    const rowMap = new Map<
      string,
      {
        row: QuotaSummaryRow;
        credentialSet: Set<string>;
      }
    >();

    const ensureRow = (id: string, label: string) => {
      const exists = rowMap.get(id);
      if (exists) return exists;

      const created = {
        row: {
          id,
          label,
          modelNames: [],
          resetLabels: [],
          credentialCount: 0,
          remainingValues: [],
        },
        credentialSet: new Set<string>(),
      };
      rowMap.set(id, created);
      return created;
    };

    const pushUnique = (target: string[], values: string[]) => {
      values.forEach((value) => {
        if (value && !target.includes(value)) target.push(value);
      });
    };

    filteredFiles.forEach((file) => {
      const state = quota[file.name];
      if (!state || state.status !== 'success') return;

      if (config.type === 'antigravity') {
        const successState = state as unknown as AntigravityQuotaState;
        successState.groups.forEach((group) => {
          const id = `antigravity:${group.id}`;
          const holder = ensureRow(id, group.label);
          pushUnique(holder.row.modelNames, group.models);
          if (group.resetTime) pushUnique(holder.row.resetLabels, [group.resetTime]);

          if (!holder.credentialSet.has(file.name)) {
            holder.credentialSet.add(file.name);
            holder.row.credentialCount += 1;
          }

          holder.row.remainingValues.push(
            Math.max(0, Math.min(100, group.remainingFraction * 100))
          );
        });
        return;
      }

      if (config.type === 'codex') {
        const successState = state as unknown as CodexQuotaState;
        successState.windows.forEach((window) => {
          const id = `codex:${window.id}`;
          const holder = ensureRow(id, window.label);
          if (window.resetLabel) pushUnique(holder.row.resetLabels, [window.resetLabel]);

          if (!holder.credentialSet.has(file.name)) {
            holder.credentialSet.add(file.name);
            holder.row.credentialCount += 1;
          }

          if (typeof window.usedPercent === 'number') {
            holder.row.remainingValues.push(Math.max(0, Math.min(100, 100 - window.usedPercent)));
          }
        });
        return;
      }

      if (config.type === 'claude') {
        const successState = state as unknown as ClaudeQuotaState;
        successState.windows.forEach((window) => {
          const id = `claude:${window.id}`;
          const holder = ensureRow(id, window.label);
          if (window.resetLabel) pushUnique(holder.row.resetLabels, [window.resetLabel]);

          if (!holder.credentialSet.has(file.name)) {
            holder.credentialSet.add(file.name);
            holder.row.credentialCount += 1;
          }

          if (typeof window.usedPercent === 'number') {
            holder.row.remainingValues.push(Math.max(0, Math.min(100, 100 - window.usedPercent)));
          }
        });
        return;
      }

      if (config.type === 'gemini-cli') {
        const successState = state as unknown as GeminiCliQuotaState;
        successState.buckets.forEach((bucket) => {
          const id = `gemini-cli:${bucket.id}`;
          const holder = ensureRow(id, bucket.label);
          pushUnique(holder.row.modelNames, bucket.modelIds ?? []);
          if (bucket.resetTime) pushUnique(holder.row.resetLabels, [bucket.resetTime]);

          if (!holder.credentialSet.has(file.name)) {
            holder.credentialSet.add(file.name);
            holder.row.credentialCount += 1;
          }

          if (typeof bucket.remainingFraction === 'number') {
            holder.row.remainingValues.push(
              Math.max(0, Math.min(100, bucket.remainingFraction * 100))
            );
          }
        });
      }
    });

    return [...rowMap.values()]
      .map((entry) => {
        const values = entry.row.remainingValues;
        const averageRemaining =
          values.length > 0
            ? Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(1))
            : null;
        return {
          ...entry.row,
          averageRemaining,
        } as QuotaSummaryItem;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [config.type, filteredFiles, quota]);

  const summaryStats = useMemo(() => {
    const credentialsWithQuota = filteredFiles.filter(
      (file) => quota[file.name]?.status === 'success'
    ).length;

    const averageValues = summaryRows
      .map((row) => row.averageRemaining)
      .filter((value): value is number => typeof value === 'number');

    const averageRemaining =
      averageValues.length > 0
        ? Number(
            (averageValues.reduce((sum, item) => sum + item, 0) / averageValues.length).toFixed(1)
          )
        : null;

    const models = new Set<string>();
    summaryRows.forEach((row) => row.modelNames.forEach((model) => models.add(model)));

    return {
      totalCredentials: filteredFiles.length,
      credentialsWithQuota,
      modelCount: models.size,
      bucketCount: summaryRows.length,
      averageRemaining,
    };
  }, [filteredFiles, quota, summaryRows]);

  const handleCheckAll = useCallback(() => {
    if (disabled || isBusy) return;
    if (filteredFiles.length === 0) return;

    setRefreshProgress(null);
    const targets = filteredFiles;
    setBatchProgress({
      total: targets.length,
      completed: 0,
      success: 0,
      error: 0,
    });
    void loadQuotaSequential(targets, 'all', setLoading, setBatchProgress);
  }, [disabled, filteredFiles, isBusy, loadQuotaSequential, setLoading]);

  const batchPercent = useMemo(() => {
    if (!batchProgress) return 0;
    if (batchProgress.total <= 0) return 0;
    return Math.round((batchProgress.completed / batchProgress.total) * 100);
  }, [batchProgress]);

  const batchLabel = useMemo(() => {
    if (!batchProgress) return null;
    if (batchProgress.total <= 0) return null;

    if (batchProgress.completed < batchProgress.total) {
      return t('quota_management.checking_progress', {
        completed: batchProgress.completed,
        total: batchProgress.total,
        success: batchProgress.success,
        error: batchProgress.error,
      });
    }

    return t('quota_management.check_all_done', {
      total: batchProgress.total,
      success: batchProgress.success,
      error: batchProgress.error,
    });
  }, [batchProgress, t]);

  const refreshRunning = Boolean(
    refreshProgress &&
    refreshProgress.total > 0 &&
    refreshProgress.completed < refreshProgress.total &&
    !refreshProgress.stopped
  );

  const refreshPercent =
    refreshProgress && refreshProgress.total > 0
      ? Math.round((refreshProgress.completed / refreshProgress.total) * 100)
      : 0;

  const pageSizeOptions = PAGE_SIZE_OPTIONS.map((value) => ({
    value: String(value),
    label: String(value),
  }));

  const isRefreshing = isBusy || refreshRunning;
  const cardActionsEnabled = !(disabled || isBusy);

  return (
    <>
      <Card
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            <div
              className={styles.sectionTabs}
              role="tablist"
              aria-label={t('quota_management.view_tabs')}
            >
              <Button
                variant={activeTab === 'summary' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveTab('summary')}
                role="tab"
                aria-selected={activeTab === 'summary'}
              >
                {t('quota_management.tab_summary')}
              </Button>
              <Button
                variant={activeTab === 'credentials' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveTab('credentials')}
                role="tab"
                aria-selected={activeTab === 'credentials'}
              >
                {t('quota_management.tab_credentials')}
              </Button>
            </div>

            {activeTab === 'credentials' && (
              <>
                <select
                  className={styles.statusFilter}
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as 'all' | 'idle' | 'success' | 'error')
                  }
                  aria-label={t('quota_management.status_filter_label')}
                >
                  <option value="all">{t('quota_management.filter_all')}</option>
                  <option value="idle">{t('quota_management.filter_idle')}</option>
                  <option value="success">{t('quota_management.filter_success')}</option>
                  <option value="error">{t('quota_management.filter_error')}</option>
                </select>

                <div className={styles.pageSizeControl}>
                  <span className={styles.pageSizeLabel}>
                    {t('quota_management.page_size_label')}
                  </span>
                  <Select
                    value={String(pageSizeOption)}
                    options={pageSizeOptions}
                    onChange={(value) => {
                      const parsed = Number.parseInt(value, 10);
                      if (!Number.isFinite(parsed)) return;
                      setPageSizeOption(parsed);
                    }}
                    ariaLabel={t('quota_management.page_size_label')}
                    className={styles.pageSizeSelectWrap}
                    fullWidth={false}
                    disabled={effectiveViewMode !== 'paged'}
                  />
                </div>

                <div className={styles.viewModeToggle}>
                  <Button
                    variant={effectiveViewMode === 'paged' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setViewMode('paged')}
                  >
                    {t('auth_files.view_mode_paged')}
                  </Button>
                  <Button
                    variant={effectiveViewMode === 'all' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      if (displayFiles.length > MAX_SHOW_ALL_THRESHOLD) {
                        setShowTooManyWarning(true);
                      } else {
                        setViewMode('all');
                      }
                    }}
                  >
                    {t('auth_files.view_mode_all')}
                  </Button>
                </div>
              </>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={handleCheckAll}
              disabled={disabled || isBusy || filteredFiles.length === 0}
              loading={
                sectionLoading && !!batchProgress && batchProgress.completed < batchProgress.total
              }
              title={t('quota_management.check_all')}
              aria-label={t('quota_management.check_all')}
            >
              {t('quota_management.check_all')}
            </Button>

            {activeTab === 'credentials' && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteFailedFiles}
                disabled={
                  disabled ||
                  isBusy ||
                  deletingFailedFiles ||
                  statusFilter !== 'error' ||
                  failedDisplayFiles.length === 0
                }
                loading={deletingFailedFiles}
                title={t('quota_management.delete_failed_current', {
                  defaultValue: '删除当前失败项',
                })}
                aria-label={t('quota_management.delete_failed_current', {
                  defaultValue: '删除当前失败项',
                })}
              >
                {t('quota_management.delete_failed_current', {
                  defaultValue: '删除当前失败项',
                })}
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenRefreshModal}
              disabled={disabled || isRefreshing}
              loading={isRefreshing}
              title={t('quota_management.refresh_files_and_quota')}
              aria-label={t('quota_management.refresh_files_and_quota')}
            >
              {!isRefreshing && <IconRefreshCw size={16} />}
            </Button>
          </div>
        }
      >
        {batchLabel && (
          <div className={styles.batchProgress}>
            <div className={styles.batchProgressRow}>
              <span>{batchLabel}</span>
              <span className={styles.batchProgressValue}>{batchPercent}%</span>
            </div>
            <div
              className={styles.batchProgressBar}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={batchPercent}
            >
              <div className={styles.batchProgressBarFill} style={{ width: `${batchPercent}%` }} />
            </div>
          </div>
        )}

        {refreshProgress && refreshProgress.total > 0 && (
          <div className={styles.refreshProgressPanel}>
            <div className={styles.refreshProgressHeader}>
              <span className={styles.refreshProgressTitle}>
                {refreshRunning
                  ? t('quota_management.refreshing')
                  : refreshProgress.stopped
                    ? t('quota_management.refresh_stopped')
                    : t('quota_management.refresh_completed')}
              </span>
              <span className={styles.refreshProgressStats}>
                {t('quota_management.refresh_progress', {
                  completed: refreshProgress.completed,
                  total: refreshProgress.total,
                })}
              </span>
            </div>

            <div className={styles.refreshProgressBar}>
              <div
                className={styles.refreshProgressBarFill}
                style={{ width: `${refreshPercent}%` }}
              />
            </div>

            <div className={styles.refreshProgressMeta}>
              {t('quota_management.refresh_progress_detail', {
                success: refreshProgress.success,
                failed: refreshProgress.failed,
              })}
            </div>

            {refreshRunning && (
              <div className={styles.refreshProgressActions}>
                <Button variant="danger" size="sm" onClick={handleStopRefresh}>
                  {t('quota_management.refresh_stop')}
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'summary' ? (
          <div className={styles.summaryPanel} role="tabpanel">
            <div className={styles.summaryStatsGrid}>
              <div className={styles.summaryStatCard}>
                <div className={styles.summaryStatLabel}>
                  {t('quota_management.summary_credentials')}
                </div>
                <div className={styles.summaryStatValue}>
                  {summaryStats.credentialsWithQuota}/{summaryStats.totalCredentials}
                </div>
              </div>

              <div className={styles.summaryStatCard}>
                <div className={styles.summaryStatLabel}>
                  {t('quota_management.summary_models')}
                </div>
                <div className={styles.summaryStatValue}>{summaryStats.modelCount}</div>
              </div>

              <div className={styles.summaryStatCard}>
                <div className={styles.summaryStatLabel}>
                  {t('quota_management.summary_windows')}
                </div>
                <div className={styles.summaryStatValue}>{summaryStats.bucketCount}</div>
              </div>

              <div className={styles.summaryStatCard}>
                <div className={styles.summaryStatLabel}>
                  {t('quota_management.summary_avg_remaining')}
                </div>
                <div className={styles.summaryStatValue}>
                  {summaryStats.averageRemaining === null
                    ? '--'
                    : t('quota_management.summary_percent', {
                        value: summaryStats.averageRemaining,
                      })}
                </div>
              </div>
            </div>

            {summaryRows.length === 0 ? (
              <EmptyState
                title={t('quota_management.summary_empty_title')}
                description={t('quota_management.summary_empty_desc')}
              />
            ) : (
              <div className={styles.summaryRows}>
                {summaryRows.map((row) => (
                  <div key={row.id} className={styles.summaryRow}>
                    <div className={styles.summaryRowHeader}>
                      <div className={styles.summaryRowTitle}>{row.label}</div>
                      <div className={styles.summaryRowMeta}>
                        {t('quota_management.summary_covered_credentials', {
                          count: row.credentialCount,
                        })}
                      </div>
                    </div>

                    {row.averageRemaining !== null ? (
                      <QuotaProgressBar
                        percent={row.averageRemaining}
                        highThreshold={70}
                        mediumThreshold={40}
                      />
                    ) : (
                      <div className={styles.quotaWarning}>
                        {t('quota_management.summary_no_percent')}
                      </div>
                    )}

                    <div className={styles.summaryRowFooter}>
                      <span>
                        {row.averageRemaining === null
                          ? t('quota_management.summary_no_percent')
                          : t('quota_management.summary_percent', { value: row.averageRemaining })}
                      </span>

                      {row.modelNames.length > 0 && (
                        <span>
                          {t('quota_management.summary_models_list', {
                            models: row.modelNames.join(', '),
                          })}
                        </span>
                      )}

                      {row.resetLabels.length > 0 && (
                        <span>
                          {t('quota_management.summary_reset_list', {
                            reset: row.resetLabels.slice(0, 2).join(' / '),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : displayFiles.length === 0 ? (
          <EmptyState
            title={t(`${config.i18nPrefix}.empty_title`)}
            description={t(`${config.i18nPrefix}.empty_desc`)}
          />
        ) : (
          <div role="tabpanel">
            <div ref={gridRef} className={config.gridClassName}>
              {pageItems.map((item) => (
                <QuotaCard
                  key={item.name}
                  item={item}
                  quota={quota[item.name]}
                  resolvedTheme={resolvedTheme}
                  i18nPrefix={config.i18nPrefix}
                  cardIdleMessageKey={config.cardIdleMessageKey}
                  cardClassName={config.cardClassName}
                  defaultType={config.type}
                  renderQuotaItems={config.renderQuotaItems}
                  onDelete={cardActionsEnabled ? handleDelete : undefined}
                  isDeleting={deletingFile === item.name}
                  canDelete={!isRuntimeOnlyAuthFile(item)}
                  onRefresh={cardActionsEnabled ? handleRefreshSingle : undefined}
                  isRefreshing={refreshingFile === item.name}
                />
              ))}
            </div>

            {displayFiles.length > pageSize && effectiveViewMode === 'paged' && (
              <div className={styles.pagination}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={goToPrev}
                  disabled={currentPage <= 1}
                >
                  {t('auth_files.pagination_prev')}
                </Button>

                <div className={styles.pageInfo}>
                  {t('auth_files.pagination_info', {
                    current: currentPage,
                    total: totalPages,
                    count: displayFiles.length,
                  })}
                </div>

                <input
                  type="number"
                  className={styles.pageJumpInput}
                  min={1}
                  max={totalPages}
                  placeholder={String(currentPage)}
                  aria-label={t('auth_files.pagination_jump')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      const value = Number((event.target as HTMLInputElement).value);
                      if (value >= 1 && value <= totalPages) {
                        goToPage(value);
                        (event.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                  onBlur={(event) => {
                    const value = Number(event.target.value);
                    if (value >= 1 && value <= totalPages) {
                      goToPage(value);
                    }
                    event.target.value = '';
                  }}
                  style={{ width: 52 }}
                />

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage >= totalPages}
                >
                  {t('auth_files.pagination_next')}
                </Button>
              </div>
            )}
          </div>
        )}

        {showTooManyWarning && (
          <div className={styles.warningOverlay} onClick={() => setShowTooManyWarning(false)}>
            <div className={styles.warningModal} onClick={(event) => event.stopPropagation()}>
              <p>{t('auth_files.too_many_files_warning')}</p>
              <Button variant="primary" size="sm" onClick={() => setShowTooManyWarning(false)}>
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={refreshModalOpen}
        onClose={() => setRefreshModalOpen(false)}
        title={t('quota_management.refresh_scope_modal_title')}
        footer={
          <div className={styles.refreshScopeModalFooter}>
            <Button variant="secondary" onClick={() => setRefreshModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="secondary" onClick={() => handleStartRefresh('page')}>
              {t('quota_management.refresh_scope_current_page')}
            </Button>
            <Button onClick={() => handleStartRefresh('all')}>
              {t('quota_management.refresh_scope_all')}
            </Button>
          </div>
        }
      >
        <div className={styles.refreshScopeModalBody}>
          <p className={styles.refreshScopeModalDesc}>
            {t('quota_management.refresh_scope_modal_desc')}
          </p>
          <Input
            label={t('quota_management.refresh_concurrency_label')}
            value={refreshConcurrencyInput}
            onChange={(event) => setRefreshConcurrencyInput(event.target.value)}
            error={refreshConcurrencyError || undefined}
            hint={t('quota_management.refresh_concurrency_hint', {
              max: MAX_REFRESH_CONCURRENCY,
            })}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </div>
      </Modal>
    </>
  );
}
