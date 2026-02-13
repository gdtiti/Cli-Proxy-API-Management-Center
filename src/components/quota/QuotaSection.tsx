/**
 * Generic quota section component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useQuotaStore, useThemeStore, useNotificationStore } from '@/stores';
import type { AuthFileItem, ResolvedTheme } from '@/types';
import { QuotaCard } from './QuotaCard';
import type { QuotaStatusState } from './QuotaCard';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import { useGridColumns } from './useGridColumns';
import { isRuntimeOnlyAuthFile } from '@/utils/quota/validators';
import { authFilesApi } from '@/services/api';
import { IconRefreshCw } from '@/components/ui/icons';
import styles from '@/pages/QuotaPage.module.scss';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
} from '@/types';
import { QuotaProgressBar } from './QuotaCard';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

type ViewMode = 'paged' | 'all';
type QuotaPanelTab = 'summary' | 'credentials';

const MAX_ITEMS_PER_PAGE = 14;
const MAX_SHOW_ALL_THRESHOLD = 30;

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
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;
  const showNotification = useNotificationStore((state) => state.showNotification);

  // Delete state management
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  // Single card refresh state
  const [refreshingFile, setRefreshingFile] = useState<string | null>(null);

  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    completed: number;
    success: number;
    error: number;
  } | null>(null);

  /* Removed useRef */
  const [columns, gridRef] = useGridColumns(380); // Min card width 380px matches SCSS
  const storageKey = `quota_view_mode_${config.type}`;
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === 'all' ? 'all' : 'paged';
  });
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      localStorage.setItem(storageKey, mode);
    },
    [storageKey]
  );
  const [showTooManyWarning, setShowTooManyWarning] = useState(false);
  const [activeTab, setActiveTab] = useState<QuotaPanelTab>('summary');

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
      const s = quota[file.name]?.status ?? 'idle';
      return s === statusFilter;
    });
  }, [filteredFiles, statusFilter, quota]);
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
  } = useQuotaPagination(displayFiles);

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

  // Update page size based on view mode and columns
  useEffect(() => {
    if (effectiveViewMode === 'all') {
      setPageSize(Math.max(1, displayFiles.length), false);
    } else {
      setPageSize(Math.min(columns * 3, MAX_ITEMS_PER_PAGE), false);
    }
  }, [effectiveViewMode, columns, displayFiles.length, setPageSize]);

  const pendingQuotaRefreshRef = useRef(false);
  const prevFilesLoadingRef = useRef(loading);

  const handleRefresh = useCallback(() => {
    setBatchProgress(null);
    pendingQuotaRefreshRef.current = true;
    void triggerHeaderRefresh();
  }, []);

  // Delete handler
  const handleDelete = useCallback(
    async (name: string) => {
      if (!window.confirm(t('quota_management.delete_confirm', { name }))) return;

      setDeletingFile(name);
      try {
        await authFilesApi.deleteFile(name);
        // Clear quota cache for this credential
        setQuota((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
        // Notify parent to update file list
        onFileDeleted?.(name);
        showNotification(t('quota_management.delete_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t('common.unknown_error');
        showNotification(t('quota_management.delete_failed', { message: errorMessage }), 'error');
      } finally {
        setDeletingFile(null);
      }
    },
    [t, setQuota, onFileDeleted, showNotification]
  );

  // Single card refresh handler
  const handleRefreshSingle = useCallback(
    (name: string) => {
      const file = filteredFiles.find((f) => f.name === name);
      if (!file) return;
      setBatchProgress(null);
      setRefreshingFile(name);
      setQuota((prev) => ({
        ...prev,
        [name]: config.buildLoadingState(),
      }));
      void loadQuota([file], 'page', (_isLoading) => {
        if (!_isLoading) setRefreshingFile(null);
      });
    },
    [filteredFiles, setQuota, config, loadQuota]
  );

  useEffect(() => {
    const wasLoading = prevFilesLoadingRef.current;
    prevFilesLoadingRef.current = loading;

    if (!pendingQuotaRefreshRef.current) return;
    if (loading) return;
    if (!wasLoading) return;

    pendingQuotaRefreshRef.current = false;
    setBatchProgress(null);
    const scope = effectiveViewMode === 'all' ? 'all' : 'page';
    const targets = effectiveViewMode === 'all' ? displayFiles : pageItems;
    if (targets.length === 0) return;
    void loadQuota(targets, scope, setLoading);
  }, [loading, effectiveViewMode, displayFiles, pageItems, loadQuota, setLoading]);

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
  const cardActionsEnabled = !(disabled || isBusy);

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
  }, [filteredFiles, quota, config.type]);

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
    if (!cardActionsEnabled) return;
    if (filteredFiles.length === 0) return;

    const targets = filteredFiles;
    setBatchProgress({
      total: targets.length,
      completed: 0,
      success: 0,
      error: 0,
    });
    void loadQuotaSequential(targets, 'all', setLoading, setBatchProgress);
  }, [cardActionsEnabled, filteredFiles, loadQuotaSequential, setLoading]);

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

  return (
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
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'idle' | 'success' | 'error')
                }
                aria-label={t('quota_management.status_filter_label')}
              >
                <option value="all">{t('quota_management.filter_all')}</option>
                <option value="idle">{t('quota_management.filter_idle')}</option>
                <option value="success">{t('quota_management.filter_success')}</option>
                <option value="error">{t('quota_management.filter_error')}</option>
              </select>
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={disabled || isBusy}
            loading={isBusy}
            title={t('quota_management.refresh_files_and_quota')}
            aria-label={t('quota_management.refresh_files_and_quota')}
          >
            {!isBusy && <IconRefreshCw size={16} />}
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
              <div className={styles.summaryStatLabel}>{t('quota_management.summary_models')}</div>
              <div className={styles.summaryStatValue}>{summaryStats.modelCount}</div>
            </div>
            <div className={styles.summaryStatCard}>
              <div className={styles.summaryStatLabel}>{t('quota_management.summary_windows')}</div>
              <div className={styles.summaryStatValue}>{summaryStats.bucketCount}</div>
            </div>
            <div className={styles.summaryStatCard}>
              <div className={styles.summaryStatLabel}>
                {t('quota_management.summary_avg_remaining')}
              </div>
              <div className={styles.summaryStatValue}>
                {summaryStats.averageRemaining === null
                  ? '--'
                  : t('quota_management.summary_percent', { value: summaryStats.averageRemaining })}
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
        <>
          <div ref={gridRef} className={config.gridClassName}>
            {pageItems.map((item) => (
              <QuotaCard
                key={item.name}
                item={item}
                quota={quota[item.name]}
                resolvedTheme={resolvedTheme}
                i18nPrefix={config.i18nPrefix}
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
              <Button variant="secondary" size="sm" onClick={goToPrev} disabled={currentPage <= 1}>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = Number((e.target as HTMLInputElement).value);
                    if (val >= 1 && val <= totalPages) {
                      goToPage(val);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= totalPages) {
                    goToPage(val);
                  }
                  e.target.value = '';
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
        </>
      )}
      {showTooManyWarning && (
        <div className={styles.warningOverlay} onClick={() => setShowTooManyWarning(false)}>
          <div className={styles.warningModal} onClick={(e) => e.stopPropagation()}>
            <p>{t('auth_files.too_many_files_warning')}</p>
            <Button variant="primary" size="sm" onClick={() => setShowTooManyWarning(false)}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
