/**
 * Kiro Quota Card Component
 * Displays quota information for Kiro (AWS CodeWhisperer) accounts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconTrash2 } from '@/components/ui/icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useQuotaStore, useThemeStore, useNotificationStore } from '@/stores';
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from '@/services/api';
import type { AuthFileItem, KiroQuotaState, KiroQuotaDetail, KiroBonusUsage } from '@/types';
import {
  normalizeAuthIndexValue,
  normalizeNumberValue,
  formatQuotaResetTime,
  isKiroFile,
  isRuntimeOnlyAuthFile,
  getTypeColor,
  getStatusFromError,
  createStatusError
} from './quotaUtils';
import styles from '../QuotaPage.module.scss';

// Kiro API configuration
// Note: Kiro quota is fetched via the backend's /api-call proxy endpoint
// The backend handles the actual AWS CodeWhisperer API call
const KIRO_QUOTA_URL = 'https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits';

const KIRO_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/x-amz-json-1.0',
  'X-Amz-Target': 'AmazonCodeWhispererService.GetUsageLimits'
};

interface KiroUsageLimitsResponse {
  usageBreakdownList?: Array<{
    resourceType?: string;
    currentUsage?: number;
    currentUsageWithPrecision?: number;
    usageLimit?: number;
    usageLimitWithPrecision?: number;
    nextDateReset?: number;
    freeTrialInfo?: {
      freeTrialStatus?: string;
      currentUsage?: number;
      currentUsageWithPrecision?: number;
      usageLimit?: number;
      usageLimitWithPrecision?: number;
      freeTrialExpiry?: number;
    };
    bonuses?: Array<{
      bonusCode?: string;
      displayName?: string;
      currentUsage?: number;
      currentUsageWithPrecision?: number;
      usageLimit?: number;
      usageLimitWithPrecision?: number;
      expiresAt?: number;
    }>;
  }>;
  nextDateReset?: number;
}

function parseKiroQuotaPayload(payload: unknown): KiroUsageLimitsResponse | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as KiroUsageLimitsResponse;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as KiroUsageLimitsResponse;
  }
  return null;
}

function buildKiroQuotaState(payload: KiroUsageLimitsResponse): Omit<KiroQuotaState, 'status' | 'error' | 'errorStatus'> {
  // Find the CREDIT resource type in usageBreakdownList
  const creditUsage = payload.usageBreakdownList?.find(item => item.resourceType === 'CREDIT');

  // Base quota
  const baseLimit = normalizeNumberValue(creditUsage?.usageLimitWithPrecision ?? creditUsage?.usageLimit) ?? 0;
  const baseCurrent = normalizeNumberValue(creditUsage?.currentUsageWithPrecision ?? creditUsage?.currentUsage) ?? 0;

  // Free trial quota
  let freeTrialLimit = 0;
  let freeTrialCurrent = 0;
  let freeTrialExpiry: string | undefined;

  if (creditUsage?.freeTrialInfo?.freeTrialStatus === 'ACTIVE') {
    freeTrialLimit = normalizeNumberValue(creditUsage.freeTrialInfo.usageLimitWithPrecision ?? creditUsage.freeTrialInfo.usageLimit) ?? 0;
    freeTrialCurrent = normalizeNumberValue(creditUsage.freeTrialInfo.currentUsageWithPrecision ?? creditUsage.freeTrialInfo.currentUsage) ?? 0;
    // Convert Unix timestamp to ISO string if needed
    const expiryTimestamp = creditUsage.freeTrialInfo.freeTrialExpiry;
    if (expiryTimestamp) {
      freeTrialExpiry = new Date(expiryTimestamp * 1000).toISOString();
    }
  }

  // Bonus quotas
  const bonuses: KiroBonusUsage[] = (creditUsage?.bonuses || []).map(b => {
    const expiryTimestamp = b.expiresAt;
    return {
      code: b.bonusCode || '',
      name: b.displayName || '',
      current: normalizeNumberValue(b.currentUsageWithPrecision ?? b.currentUsage) ?? 0,
      limit: normalizeNumberValue(b.usageLimitWithPrecision ?? b.usageLimit) ?? 0,
      expiresAt: expiryTimestamp ? new Date(expiryTimestamp * 1000).toISOString() : undefined
    };
  });

  // Calculate totals
  const bonusLimit = bonuses.reduce((sum, b) => sum + b.limit, 0);
  const bonusCurrent = bonuses.reduce((sum, b) => sum + b.current, 0);

  const totalLimit = baseLimit + freeTrialLimit + bonusLimit;
  const totalCurrent = baseCurrent + freeTrialCurrent + bonusCurrent;
  const totalPercentUsed = totalLimit > 0 ? Math.round((totalCurrent / totalLimit) * 100) : 0;

  // Build details array for display
  const details: KiroQuotaDetail[] = [];

  if (baseLimit > 0) {
    details.push({
      id: 'base',
      label: 'Base Quota',
      current: baseCurrent,
      limit: baseLimit,
      percentUsed: baseLimit > 0 ? Math.round((baseCurrent / baseLimit) * 100) : 0
    });
  }

  if (freeTrialLimit > 0) {
    details.push({
      id: 'free-trial',
      label: 'Free Trial',
      current: freeTrialCurrent,
      limit: freeTrialLimit,
      percentUsed: freeTrialLimit > 0 ? Math.round((freeTrialCurrent / freeTrialLimit) * 100) : 0,
      expiresAt: freeTrialExpiry
    });
  }

  bonuses.forEach((bonus, index) => {
    if (bonus.limit > 0) {
      details.push({
        id: `bonus-${index}`,
        label: bonus.name || `Bonus ${index + 1}`,
        current: bonus.current,
        limit: bonus.limit,
        percentUsed: bonus.limit > 0 ? Math.round((bonus.current / bonus.limit) * 100) : 0,
        expiresAt: bonus.expiresAt
      });
    }
  });

  // Convert nextDateReset timestamp to ISO string
  let nextResetDate: string | undefined;
  const resetTimestamp = creditUsage?.nextDateReset ?? payload.nextDateReset;
  if (resetTimestamp) {
    nextResetDate = new Date(resetTimestamp * 1000).toISOString();
  }

  return {
    totalCurrent,
    totalLimit,
    totalPercentUsed,
    baseLimit,
    baseCurrent,
    freeTrialLimit,
    freeTrialCurrent,
    freeTrialExpiry,
    bonuses: bonuses.length > 0 ? bonuses : undefined,
    details,
    lastUpdated: Date.now(),
    nextResetDate
  };
}

interface KiroQuotaSectionProps {
  files: AuthFileItem[];
  disableControls: boolean;
  onFileDeleted?: (name: string) => void;
}

export function KiroQuotaSection({ files, disableControls, onFileDeleted }: KiroQuotaSectionProps) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [kiroPage, setKiroPage] = useState(1);
  const [kiroPageSize, setKiroPageSize] = useState(6);
  const [kiroLoading, setKiroLoading] = useState(false);
  const [kiroLoadingScope, setKiroLoadingScope] = useState<'page' | 'all' | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const kiroQuota = useQuotaStore((state) => state.kiroQuota);
  const setKiroQuota = useQuotaStore((state) => state.setKiroQuota);

  const kiroLoadingRef = useRef(false);
  const kiroRequestIdRef = useRef(0);

  const kiroFiles = useMemo(
    () => files.filter((file) => isKiroFile(file) && !isRuntimeOnlyAuthFile(file)),
    [files]
  );

  const kiroTotalPages = Math.max(1, Math.ceil(kiroFiles.length / kiroPageSize));
  const kiroCurrentPage = Math.min(kiroPage, kiroTotalPages);
  const kiroStart = (kiroCurrentPage - 1) * kiroPageSize;
  const kiroPageItems = kiroFiles.slice(kiroStart, kiroStart + kiroPageSize);

  const fetchKiroQuota = useCallback(
    async (file: AuthFileItem): Promise<Omit<KiroQuotaState, 'status' | 'error' | 'errorStatus'>> => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndex = normalizeAuthIndexValue(rawAuthIndex);
      if (!authIndex) {
        throw new Error(t('kiro_quota.missing_auth_index'));
      }

      const result = await apiCallApi.request({
        authIndex,
        method: 'POST',
        url: KIRO_QUOTA_URL,
        header: { ...KIRO_REQUEST_HEADERS },
        data: '{}'
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
      }

      const payload = parseKiroQuotaPayload(result.body ?? result.bodyText);
      if (!payload) {
        throw new Error(t('kiro_quota.empty_response'));
      }

      return buildKiroQuotaState(payload);
    },
    [t]
  );

  const loadKiroQuota = useCallback(
    async (targets: AuthFileItem[], scope: 'page' | 'all') => {
      if (kiroLoadingRef.current) return;
      kiroLoadingRef.current = true;
      const requestId = ++kiroRequestIdRef.current;
      setKiroLoading(true);
      setKiroLoadingScope(scope);

      try {
        if (targets.length === 0) return;

        setKiroQuota((prev) => {
          const nextState = { ...prev };
          targets.forEach((file) => {
            nextState[file.name] = {
              status: 'loading',
              totalCurrent: 0,
              totalLimit: 0,
              totalPercentUsed: 0,
              details: []
            };
          });
          return nextState;
        });

        const results = await Promise.all(
          targets.map(async (file) => {
            try {
              const quotaData = await fetchKiroQuota(file);
              return { name: file.name, status: 'success' as const, ...quotaData };
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : t('common.unknown_error');
              const errorStatus = getStatusFromError(err);
              return {
                name: file.name,
                status: 'error' as const,
                error: message,
                errorStatus,
                totalCurrent: 0,
                totalLimit: 0,
                totalPercentUsed: 0,
                details: []
              };
            }
          })
        );

        if (requestId !== kiroRequestIdRef.current) return;

        setKiroQuota((prev) => {
          const nextState = { ...prev };
          results.forEach((result) => {
            if (result.status === 'success') {
              nextState[result.name] = {
                status: 'success',
                totalCurrent: result.totalCurrent,
                totalLimit: result.totalLimit,
                totalPercentUsed: result.totalPercentUsed,
                baseLimit: result.baseLimit,
                baseCurrent: result.baseCurrent,
                freeTrialLimit: result.freeTrialLimit,
                freeTrialCurrent: result.freeTrialCurrent,
                freeTrialExpiry: result.freeTrialExpiry,
                bonuses: result.bonuses,
                details: result.details,
                lastUpdated: result.lastUpdated,
                nextResetDate: result.nextResetDate
              };
            } else {
              nextState[result.name] = {
                status: 'error',
                totalCurrent: 0,
                totalLimit: 0,
                totalPercentUsed: 0,
                details: [],
                error: result.error,
                errorStatus: result.errorStatus
              };
            }
          });
          return nextState;
        });
      } finally {
        if (requestId === kiroRequestIdRef.current) {
          setKiroLoading(false);
          setKiroLoadingScope(null);
          kiroLoadingRef.current = false;
        }
      }
    },
    [fetchKiroQuota, setKiroQuota, t]
  );

  // Sync cache with current file list, but preserve cache when files temporarily empty
  // This prevents quota data loss during tab switches when parent reloads data
  useEffect(() => {
    if (kiroFiles.length === 0) {
      // Don't clear cache when file list is empty - it may be temporarily loading
      return;
    }
    setKiroQuota((prev) => {
      const nextState: Record<string, KiroQuotaState> = {};
      kiroFiles.forEach((file) => {
        const cached = prev[file.name];
        if (cached) {
          nextState[file.name] = cached;
        }
      });
      return nextState;
    });
  }, [kiroFiles, setKiroQuota]);

  const getTypeLabel = (type: string): string => {
    const key = `auth_files.filter_${type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (type.toLowerCase() === 'kiro') return 'Kiro';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getQuotaErrorMessage = useCallback(
    (status: number | undefined, fallback: string) => {
      if (status === 404) return t('common.quota_update_required');
      if (status === 403) return t('common.quota_check_credential');
      return fallback;
    },
    [t]
  );

  // Delete handler
  const handleDelete = useCallback(async (name: string) => {
    if (!window.confirm(t('quota_management.delete_confirm', { name }))) return;

    setDeletingFile(name);
    try {
      await authFilesApi.deleteFile(name);
      // Clear quota cache for this credential
      setKiroQuota((prev) => {
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
  }, [t, setKiroQuota, onFileDeleted, showNotification]);

  const renderKiroCard = (item: AuthFileItem) => {
    const displayType = item.type || item.provider || 'kiro';
    const typeColor = getTypeColor(displayType, resolvedTheme);
    const quotaState = kiroQuota[item.name];
    const quotaStatus = quotaState?.status ?? 'idle';
    const details = quotaState?.details ?? [];
    const quotaErrorMessage = getQuotaErrorMessage(
      quotaState?.errorStatus,
      quotaState?.error || t('common.unknown_error')
    );

    return (
      <div key={item.name} className={`${styles.fileCard} ${styles.kiroCard}`}>
        <div className={styles.cardHeader}>
          <span
            className={styles.typeBadge}
            style={{
              backgroundColor: typeColor.bg,
              color: typeColor.text,
              ...(typeColor.border ? { border: typeColor.border } : {})
            }}
          >
            {getTypeLabel(displayType)}
          </span>
          <span className={styles.fileName}>{item.name}</span>
          {!isRuntimeOnlyAuthFile(item) && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDelete(item.name)}
              className={styles.deleteButton}
              title={t('quota_management.delete_button')}
              disabled={deletingFile === item.name}
            >
              {deletingFile === item.name ? (
                <LoadingSpinner size={14} />
              ) : (
                <IconTrash2 size={16} />
              )}
            </Button>
          )}
        </div>

        <div className={styles.quotaSection}>
          {quotaStatus === 'loading' ? (
            <div className={styles.quotaMessage}>{t('kiro_quota.loading')}</div>
          ) : quotaStatus === 'idle' ? (
            <div className={styles.quotaMessage}>{t('kiro_quota.idle')}</div>
          ) : quotaStatus === 'error' ? (
            <div className={styles.quotaError}>
              {t('kiro_quota.load_failed', { message: quotaErrorMessage })}
            </div>
          ) : details.length === 0 ? (
            <div className={styles.quotaMessage}>{t('kiro_quota.empty_quota')}</div>
          ) : (
            <>
              {/* Total summary */}
              <div className={styles.kiroTotalSummary}>
                <span className={styles.kiroTotalLabel}>{t('kiro_quota.total_usage')}</span>
                <span className={styles.kiroTotalValue}>
                  {quotaState?.totalCurrent ?? 0} / {quotaState?.totalLimit ?? 0}
                </span>
                <span className={styles.kiroTotalPercent}>
                  ({100 - (quotaState?.totalPercentUsed ?? 0)}% {t('kiro_quota.remaining')})
                </span>
              </div>

              {/* Detail breakdown */}
              {details.map((detail) => {
                const remaining = 100 - detail.percentUsed;
                const quotaBarClass =
                  remaining >= 60
                    ? styles.quotaBarFillHigh
                    : remaining >= 20
                      ? styles.quotaBarFillMedium
                      : styles.quotaBarFillLow;
                const resetLabel = formatQuotaResetTime(detail.expiresAt);

                return (
                  <div key={detail.id} className={styles.quotaRow}>
                    <div className={styles.quotaRowHeader}>
                      <span className={styles.quotaModel}>{detail.label}</span>
                      <div className={styles.quotaMeta}>
                        <span className={styles.quotaPercent}>{remaining}%</span>
                        <span className={styles.quotaUsage}>
                          {detail.current}/{detail.limit}
                        </span>
                        {resetLabel !== '-' && (
                          <span className={styles.quotaReset}>{resetLabel}</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.quotaBar}>
                      <div
                        className={`${styles.quotaBarFill} ${quotaBarClass}`}
                        style={{ width: `${remaining}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Next reset date */}
              {quotaState?.nextResetDate && (
                <div className={styles.kiroResetInfo}>
                  {t('kiro_quota.next_reset')}: {formatQuotaResetTime(quotaState.nextResetDate)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card
      title={t('kiro_quota.title')}
      extra={
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadKiroQuota(kiroPageItems, 'page')}
            disabled={disableControls || kiroLoading || kiroPageItems.length === 0}
            loading={kiroLoading && kiroLoadingScope === 'page'}
          >
            {t('kiro_quota.refresh_button')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadKiroQuota(kiroFiles, 'all')}
            disabled={disableControls || kiroLoading || kiroFiles.length === 0}
            loading={kiroLoading && kiroLoadingScope === 'all'}
          >
            {t('kiro_quota.fetch_all')}
          </Button>
        </div>
      }
    >
      {kiroFiles.length === 0 ? (
        <EmptyState
          title={t('kiro_quota.empty_title')}
          description={t('kiro_quota.empty_desc')}
        />
      ) : (
        <>
          <div className={styles.kiroControls}>
            <div className={styles.kiroControl}>
              <label>{t('auth_files.page_size_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={kiroPageSize}
                onChange={(e) => {
                  setKiroPageSize(Number(e.target.value) || 6);
                  setKiroPage(1);
                }}
              >
                <option value={6}>6</option>
                <option value={9}>9</option>
                <option value={12}>12</option>
                <option value={18}>18</option>
                <option value={24}>24</option>
              </select>
            </div>
            <div className={styles.kiroControl}>
              <label>{t('common.info')}</label>
              <div className={styles.statsInfo}>
                {kiroFiles.length} {t('auth_files.files_count')}
              </div>
            </div>
          </div>
          <div className={styles.kiroGrid}>{kiroPageItems.map(renderKiroCard)}</div>
          {kiroFiles.length > kiroPageSize && (
            <div className={styles.pagination}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setKiroPage(Math.max(1, kiroCurrentPage - 1))}
                disabled={kiroCurrentPage <= 1}
              >
                {t('auth_files.pagination_prev')}
              </Button>
              <div className={styles.pageInfo}>
                {t('auth_files.pagination_info', {
                  current: kiroCurrentPage,
                  total: kiroTotalPages,
                  count: kiroFiles.length
                })}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setKiroPage(Math.min(kiroTotalPages, kiroCurrentPage + 1))}
                disabled={kiroCurrentPage >= kiroTotalPages}
              >
                {t('auth_files.pagination_next')}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
