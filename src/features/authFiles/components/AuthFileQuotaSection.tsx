import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIRO_CONFIG,
  KIMI_CONFIG,
} from '@/components/quota';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import {
  isRuntimeOnlyAuthFile,
  resolveQuotaErrorMessage,
  type QuotaProviderType,
} from '@/features/authFiles/constants';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import styles from '@/pages/AuthFilesPage.module.scss';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;
type PersistedQuotaItem = {
  key: string;
  label: string;
  value: string;
  warning?: boolean;
};

const getQuotaConfig = (type: QuotaProviderType) => {
  if (type === 'antigravity') return ANTIGRAVITY_CONFIG;
  if (type === 'claude') return CLAUDE_CONFIG;
  if (type === 'codex') return CODEX_CONFIG;
  if (type === 'kiro') return KIRO_CONFIG;
  if (type === 'kimi') return KIMI_CONFIG;
  return GEMINI_CLI_CONFIG;
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

const formatDateTime = (value: unknown) => {
  const normalized = toTrimmedString(value);
  if (!normalized) return '';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  return date.toLocaleString();
};

const normalizePersistedQuotaLevel = (file: AuthFileItem) => {
  const level = toTrimmedString(file.quota_level).toLowerCase();
  if (!level) {
    return parseBoolean(file.quota_exceeded) ? 'low' : '';
  }
  if (['max', 'maximum', 'full', 'available'].includes(level)) return 'full';
  if (['high'].includes(level)) return 'high';
  if (['medium', 'mid'].includes(level)) return 'medium';
  if (['low', 'limited', 'warning', 'critical', 'exceeded', 'empty', 'none'].includes(level)) {
    return 'low';
  }
  return level;
};

const getQuotaLevelText = (file: AuthFileItem, t: TFunction) => {
  const level = normalizePersistedQuotaLevel(file);
  if (!level) return '';
  switch (level) {
    case 'full':
      return t('auth_files.quota_level_full');
    case 'high':
      return t('auth_files.quota_level_high');
    case 'medium':
      return t('auth_files.quota_level_medium');
    case 'low':
      return t('auth_files.quota_level_low');
    default:
      return file.quota_level ?? level;
  }
};

const buildPersistedQuotaItems = (file: AuthFileItem, t: TFunction): PersistedQuotaItem[] => {
  const items: PersistedQuotaItem[] = [];
  const quotaLevel = getQuotaLevelText(file, t);
  const quotaChecked = parseBoolean(file.quota_checked);
  const quotaExceeded = parseBoolean(file.quota_exceeded);
  const quotaReason = toTrimmedString(file.quota_reason);
  const expiresAt = formatDateTime(file.expires_at);
  const updatedAt = formatDateTime(file.updated_at || file.last_refresh || file.lastRefresh);
  const nextRetryAfter = formatDateTime(file.next_retry_after);
  const nextRecoverAt = formatDateTime(file.next_recover_at);

  if (quotaLevel) {
    items.push({
      key: 'level',
      label: t('auth_files.quota_level_label'),
      value: quotaLevel,
      warning: normalizePersistedQuotaLevel(file) === 'low',
    });
  }

  if (quotaChecked !== null) {
    items.push({
      key: 'checked',
      label: t('auth_files.quota_checked_label'),
      value: quotaChecked ? t('auth_files.quota_checked_yes') : t('auth_files.quota_checked_no'),
    });
  }

  if (quotaExceeded !== null) {
    items.push({
      key: 'exceeded',
      label: t('auth_files.quota_exceeded_label'),
      value: quotaExceeded
        ? t('auth_files.quota_checked_yes')
        : t('auth_files.quota_checked_no'),
      warning: quotaExceeded,
    });
  }

  if (quotaReason) {
    items.push({
      key: 'reason',
      label: t('auth_files.quota_reason_label'),
      value: quotaReason,
      warning: quotaExceeded === true,
    });
  }

  if (expiresAt) {
    items.push({
      key: 'expires',
      label: t('auth_files.quota_expires_at_label'),
      value: expiresAt,
    });
  }

  if (nextRetryAfter) {
    items.push({
      key: 'cooldown',
      label: t('auth_files.quota_cooldown_label'),
      value: nextRetryAfter,
    });
  }

  if (nextRecoverAt) {
    items.push({
      key: 'recover',
      label: t('auth_files.quota_recover_at_label'),
      value: nextRecoverAt,
    });
  }

  if (updatedAt) {
    items.push({
      key: 'updated',
      label: t('auth_files.quota_updated_at_label'),
      value: updatedAt,
    });
  }

  return items;
};

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType | null;
  disableControls: boolean;
};

export function AuthFileQuotaSection(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const quota = useQuotaStore((state) => {
    if (!quotaType) return undefined;
    if (quotaType === 'antigravity') return state.antigravityQuota[file.name] as QuotaState;
    if (quotaType === 'claude') return state.claudeQuota[file.name] as QuotaState;
    if (quotaType === 'codex') return state.codexQuota[file.name] as QuotaState;
    if (quotaType === 'kiro') return state.kiroQuota[file.name] as QuotaState;
    if (quotaType === 'kimi') return state.kimiQuota[file.name] as QuotaState;
    return state.geminiCliQuota[file.name] as QuotaState;
  });

  const updateQuotaState = useQuotaStore((state) => {
    if (!quotaType) return null;
    if (quotaType === 'antigravity') return state.setAntigravityQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'claude') return state.setClaudeQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'codex') return state.setCodexQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'kiro') return state.setKiroQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'kimi') return state.setKimiQuota as unknown as (updater: unknown) => void;
    return state.setGeminiCliQuota as unknown as (updater: unknown) => void;
  });

  const refreshQuotaForFile = useCallback(async () => {
    if (disableControls || !quotaType || !updateQuotaState) return;
    if (isRuntimeOnlyAuthFile(file)) return;
    if (quota?.status === 'loading') return;

    const config = getQuotaConfig(quotaType) as unknown as {
      i18nPrefix: string;
      fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
      buildLoadingState: () => unknown;
      buildSuccessState: (data: unknown) => unknown;
      buildErrorState: (message: string, status?: number) => unknown;
      renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
    };

    updateQuotaState((prev: Record<string, unknown>) => ({
      ...prev,
      [file.name]: config.buildLoadingState(),
    }));

    try {
      const data = await config.fetchQuota(file, t);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildSuccessState(data),
      }));
      showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildErrorState(message, status),
      }));
      showNotification(
        t('auth_files.quota_refresh_failed', { name: file.name, message }),
        'error'
      );
    }
  }, [disableControls, file, quota?.status, quotaType, showNotification, t, updateQuotaState]);

  const persistedQuotaItems = buildPersistedQuotaItems(file, t);
  const config = quotaType
    ? (getQuotaConfig(quotaType) as unknown as {
        i18nPrefix: string;
        renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
      })
    : null;
  const quotaStatus = quota?.status ?? 'idle';
  const canRefreshQuota = !disableControls && Boolean(quotaType);
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );

  return (
    <div className={styles.quotaSection}>
      {config ? (
        quotaStatus === 'loading' ? (
          <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.loading`)}</div>
        ) : quotaStatus === 'idle' ? (
          <button
            type="button"
            className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
            onClick={() => void refreshQuotaForFile()}
            disabled={!canRefreshQuota}
          >
            {t(`${config.i18nPrefix}.idle`)}
          </button>
        ) : quotaStatus === 'error' ? (
          <div className={styles.quotaError}>
            {t(`${config.i18nPrefix}.load_failed`, {
              message: quotaErrorMessage,
            })}
          </div>
        ) : quota ? (
          (config.renderQuotaItems(quota, t, { styles, QuotaProgressBar }) as ReactNode)
        ) : (
          <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.idle`)}</div>
        )
      ) : null}

      {persistedQuotaItems.length > 0 ? (
        <div className={styles.quotaPersistedList}>
          {persistedQuotaItems.map((item) => (
            <div key={item.key} className={styles.quotaPersistedRow}>
              <span className={styles.quotaMetaLabel}>{item.label}</span>
              <span
                className={`${styles.quotaMetaValue} ${item.warning ? styles.quotaMetaValueWarning : ''}`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : !config ? (
        <div className={styles.quotaMessage}>{t('auth_files.quota_persisted_empty')}</div>
      ) : null}
    </div>
  );
}
