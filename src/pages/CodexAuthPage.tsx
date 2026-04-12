import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { codexAuthApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type {
  CodexAuthConfig,
  CodexAuthEvent,
  CodexAuthSnapshot,
  CodexUsageRollup,
} from '@/types';
import styles from './CodexAuthPage.module.scss';

interface CodexConfigFormState {
  userAgent: string;
  betaFeatures: string;
  payloadDefault: string;
  payloadDefaultRaw: string;
  payloadOverride: string;
  payloadOverrideRaw: string;
  payloadFilter: string;
  notes: Record<string, unknown>;
}

const EMPTY_JSON_ARRAY = '[]';

const createEmptyConfigForm = (): CodexConfigFormState => ({
  userAgent: '',
  betaFeatures: '',
  payloadDefault: EMPTY_JSON_ARRAY,
  payloadDefaultRaw: EMPTY_JSON_ARRAY,
  payloadOverride: EMPTY_JSON_ARRAY,
  payloadOverrideRaw: EMPTY_JSON_ARRAY,
  payloadFilter: EMPTY_JSON_ARRAY,
  notes: {},
});

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const formatNumber = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value.toLocaleString();
};

const formatAvg = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
};

const prettyJson = (value: unknown) => JSON.stringify(value ?? [], null, 2);

const parseJsonArray = (text: string, fieldName: string) => {
  const normalized = text.trim() || EMPTY_JSON_ARRAY;
  const parsed = JSON.parse(normalized) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON array`);
  }
  return parsed as Record<string, unknown>[];
};

const buildConfigForm = (config: CodexAuthConfig): CodexConfigFormState => ({
  userAgent: config.codex_header_defaults?.user_agent ?? '',
  betaFeatures: config.codex_header_defaults?.beta_features ?? '',
  payloadDefault: prettyJson(config.payload?.default ?? []),
  payloadDefaultRaw: prettyJson(config.payload?.default_raw ?? []),
  payloadOverride: prettyJson(config.payload?.override ?? []),
  payloadOverrideRaw: prettyJson(config.payload?.override_raw ?? []),
  payloadFilter: prettyJson(config.payload?.filter ?? []),
  notes: config.notes ?? {},
});

const getStatusTone = (item: CodexAuthSnapshot) => {
  if (item.disabled || item.quota_exceeded || item.unavailable) return 'error';
  if (item.status === 'ready' || item.status === 'ok' || item.status === 'active') return 'success';
  return 'warning';
};

const getStatusText = (item: CodexAuthSnapshot) => {
  if (item.quota_exceeded) return 'quota_exceeded';
  if (item.disabled) return 'disabled';
  if (item.unavailable) return 'unavailable';
  return item.status || 'unknown';
};

export function CodexAuthPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [accounts, setAccounts] = useState<CodexAuthSnapshot[]>([]);
  const [usage, setUsage] = useState<CodexUsageRollup[]>([]);
  const [events, setEvents] = useState<CodexAuthEvent[]>([]);
  const [configForm, setConfigForm] = useState<CodexConfigFormState>(createEmptyConfigForm);
  const [selectedAuthIndex, setSelectedAuthIndex] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSnapshot, setDetailSnapshot] = useState<CodexAuthSnapshot | null>(null);
  const [detailEvents, setDetailEvents] = useState<CodexAuthEvent[]>([]);
  const [eventsAuthIndex, setEventsAuthIndex] = useState('');
  const [eventsKeyword, setEventsKeyword] = useState('');
  const [eventsEventType, setEventsEventType] = useState('');
  const [eventsQuotaExceeded, setEventsQuotaExceeded] = useState<'all' | 'yes' | 'no'>('all');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(10);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsSortBy, setEventsSortBy] = useState('created_at');
  const [eventsSortOrder, setEventsSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [pageError, setPageError] = useState('');

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    const data = await codexAuthApi.getConfig();
    setConfigForm(buildConfigForm(data));
  }, []);

  const loadAccounts = useCallback(async () => {
    const data = await codexAuthApi.getQuota();
    setAccounts(data);
  }, []);

  const loadUsage = useCallback(async () => {
    const data = await codexAuthApi.getUsage();
    setUsage(data);
  }, []);

  const loadEvents = useCallback(async () => {
    const data = await codexAuthApi.getEvents({
      authIndex: eventsAuthIndex || undefined,
      keyword: eventsKeyword.trim() || undefined,
      eventType: eventsEventType || undefined,
      quotaExceeded:
        eventsQuotaExceeded === 'all' ? undefined : eventsQuotaExceeded === 'yes',
      page: eventsPage,
      pageSize: eventsPageSize,
      sortBy: eventsSortBy,
      sortOrder: eventsSortOrder,
    });
    setEvents(data.items);
    setEventsTotal(data.total);
    setEventsPage(data.page);
    setEventsPageSize(data.pageSize);
    setEventsSortBy(data.sortBy);
    setEventsSortOrder(data.sortOrder);
  }, [
    eventsAuthIndex,
    eventsEventType,
    eventsKeyword,
    eventsPage,
    eventsPageSize,
    eventsQuotaExceeded,
    eventsSortBy,
    eventsSortOrder,
  ]);

  const loadDetail = useCallback(
    async (authIndex: string) => {
      if (!authIndex) {
        setSelectedAuthIndex('');
        setDetailSnapshot(null);
        setDetailEvents([]);
        return;
      }
      setDetailLoading(true);
      try {
        const data = await codexAuthApi.getQuotaDetail(authIndex);
        setSelectedAuthIndex(authIndex);
        setDetailSnapshot(data.snapshot ?? null);
        setDetailEvents(Array.isArray(data.events) ? data.events : []);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('notification.refresh_failed');
        showNotification(message, 'error');
      } finally {
        setDetailLoading(false);
      }
    },
    [showNotification, t]
  );

  const refreshAll = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setRefreshing(true);
      }
      setPageError('');
      try {
        await Promise.all([
          loadConfig(),
          loadAccounts(),
          loadUsage(),
          loadEvents(),
        ]);
        if (selectedAuthIndex) {
          await loadDetail(selectedAuthIndex);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t('notification.refresh_failed');
        setPageError(message);
        if (!silent) {
          showNotification(message, 'error');
        }
      } finally {
        setLoading(false);
        if (!silent) {
          setRefreshing(false);
        }
      }
    },
    [loadAccounts, loadConfig, loadDetail, loadEvents, loadUsage, selectedAuthIndex, showNotification, t]
  );

  useEffect(() => {
    void refreshAll({ silent: true });
  }, [refreshAll]);

  useEffect(() => {
    if (!loading) {
      void loadEvents();
    }
  }, [eventsAuthIndex, eventsEventType, eventsKeyword, eventsPage, eventsPageSize, eventsQuotaExceeded, eventsSortBy, eventsSortOrder, loadEvents, loading]);

  const stats = useMemo(() => {
    const totalRequests = usage.reduce((sum, item) => sum + (item.request_count ?? 0), 0);
    return {
      totalAccounts: accounts.length,
      disabledAccounts: accounts.filter((item) => item.disabled).length,
      quotaExceededAccounts: accounts.filter((item) => item.quota_exceeded).length,
      totalRequests,
    };
  }, [accounts, usage]);

  const handleConfigChange = <K extends keyof CodexConfigFormState>(key: K, value: CodexConfigFormState[K]) => {
    setConfigForm((current) => ({ ...current, [key]: value }));
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const payload: CodexAuthConfig = {
        codex_header_defaults: {
          user_agent: configForm.userAgent.trim(),
          beta_features: configForm.betaFeatures.trim(),
        },
        payload: {
          default: parseJsonArray(configForm.payloadDefault, 'payload.default'),
          default_raw: parseJsonArray(configForm.payloadDefaultRaw, 'payload.default_raw'),
          override: parseJsonArray(configForm.payloadOverride, 'payload.override'),
          override_raw: parseJsonArray(configForm.payloadOverrideRaw, 'payload.override_raw'),
          filter: parseJsonArray(configForm.payloadFilter, 'payload.filter'),
        },
        notes: configForm.notes,
      };
      await codexAuthApi.updateConfig(payload);
      showNotification(t('codex_management.config_saved'), 'success');
      await loadConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('notification.save_failed');
      showNotification(message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const configNotes = useMemo(
    () =>
      Object.entries(configForm.notes || {}).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    [configForm.notes]
  );

  const eventTypeOptions = useMemo(() => {
    const values = new Set<string>();
    [...events, ...detailEvents].forEach((item) => {
      if (item.event_type) {
        values.add(item.event_type);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [detailEvents, events]);

  const eventsTotalPages = Math.max(1, Math.ceil(eventsTotal / Math.max(eventsPageSize, 1)));
  const detailJson = useMemo(
    () =>
      JSON.stringify(
        {
          snapshot: detailSnapshot,
          events: detailEvents,
        },
        null,
        2
      ),
    [detailEvents, detailSnapshot]
  );
  const detailUsage = detailSnapshot?.usage;
  const detailRecentEvents = useMemo(() => detailEvents.slice(0, 10), [detailEvents]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>{t('codex_management.title')}</h1>
          <p>{t('codex_management.subtitle')}</p>
        </div>
        <Button onClick={() => void refreshAll()} loading={refreshing} disabled={disableControls}>
          {t('codex_management.refresh_all')}
        </Button>
      </div>

      {pageError && <div className="status-badge error">{pageError}</div>}

      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('codex_management.summary.accounts')}</div>
          <div className={styles.summaryValue}>{formatNumber(stats.totalAccounts)}</div>
        </Card>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('codex_management.summary.disabled')}</div>
          <div className={styles.summaryValue}>{formatNumber(stats.disabledAccounts)}</div>
        </Card>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('codex_management.summary.quota_exceeded')}</div>
          <div className={styles.summaryValue}>{formatNumber(stats.quotaExceededAccounts)}</div>
        </Card>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>{t('codex_management.summary.requests')}</div>
          <div className={styles.summaryValue}>{formatNumber(stats.totalRequests)}</div>
        </Card>
      </div>

      <Card
        title={t('codex_management.config_title')}
        extra={
          <Button
            size="sm"
            onClick={() => void handleSaveConfig()}
            loading={savingConfig}
            disabled={disableControls}
          >
            {t('common.save')}
          </Button>
        }
      >
        <div className={styles.configGrid}>
          <Input
            label={t('codex_management.user_agent')}
            value={configForm.userAgent}
            onChange={(event) => handleConfigChange('userAgent', event.target.value)}
            disabled={disableControls}
          />
          <Input
            label={t('codex_management.beta_features')}
            value={configForm.betaFeatures}
            onChange={(event) => handleConfigChange('betaFeatures', event.target.value)}
            disabled={disableControls}
          />
        </div>
        <div className={styles.textareaGrid}>
          <div className="form-group">
            <label>{t('codex_management.payload_default')}</label>
            <textarea
              rows={8}
              value={configForm.payloadDefault}
              onChange={(event) => handleConfigChange('payloadDefault', event.target.value)}
              disabled={disableControls}
            />
          </div>
          <div className="form-group">
            <label>{t('codex_management.payload_default_raw')}</label>
            <textarea
              rows={8}
              value={configForm.payloadDefaultRaw}
              onChange={(event) => handleConfigChange('payloadDefaultRaw', event.target.value)}
              disabled={disableControls}
            />
          </div>
          <div className="form-group">
            <label>{t('codex_management.payload_override')}</label>
            <textarea
              rows={8}
              value={configForm.payloadOverride}
              onChange={(event) => handleConfigChange('payloadOverride', event.target.value)}
              disabled={disableControls}
            />
          </div>
          <div className="form-group">
            <label>{t('codex_management.payload_override_raw')}</label>
            <textarea
              rows={8}
              value={configForm.payloadOverrideRaw}
              onChange={(event) => handleConfigChange('payloadOverrideRaw', event.target.value)}
              disabled={disableControls}
            />
          </div>
          <div className={`form-group ${styles.fullWidth}`}>
            <label>{t('codex_management.payload_filter')}</label>
            <textarea
              rows={8}
              value={configForm.payloadFilter}
              onChange={(event) => handleConfigChange('payloadFilter', event.target.value)}
              disabled={disableControls}
            />
          </div>
        </div>
        {configNotes.length > 0 && (
          <div className={styles.notesGrid}>
            {configNotes.map(([key, value]) => (
              <div key={key} className={styles.noteItem}>
                <div className={styles.noteKey}>{key}</div>
                <div className={styles.noteValue}>{String(value)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('codex_management.accounts_title')}>
        {loading ? (
          <div className={styles.placeholder}>{t('common.loading')}</div>
        ) : accounts.length === 0 ? (
          <EmptyState title={t('codex_management.empty_accounts')} />
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('codex_management.columns.auth_index')}</th>
                  <th>{t('codex_management.columns.account')}</th>
                  <th>{t('codex_management.columns.file')}</th>
                  <th>{t('codex_management.columns.status')}</th>
                  <th>{t('codex_management.columns.quota')}</th>
                  <th>{t('codex_management.columns.recover')}</th>
                  <th>{t('codex_management.columns.requests')}</th>
                  <th>{t('codex_management.columns.avg_total')}</th>
                  <th>{t('codex_management.columns.action')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((item, index) => (
                  <tr key={item.auth_index || item.auth_id || `${item.file_name || 'account'}-${index}`}>
                    <td className={styles.mono}>{item.auth_index || '-'}</td>
                    <td>
                      <div>{item.account || '-'}</div>
                      <div className={styles.subtle}>{item.account_type || item.label || '-'}</div>
                    </td>
                    <td className={styles.mono}>{item.file_name || '-'}</td>
                    <td>
                      <div className={`status-badge ${getStatusTone(item)}`}>
                        {t(`codex_management.status.${getStatusText(item)}`, {
                          defaultValue: item.status_message || item.status || t('codex_management.status.unknown'),
                        })}
                      </div>
                      {item.status_message && <div className={styles.subtle}>{item.status_message}</div>}
                    </td>
                    <td>
                      <div>{item.quota_reason || '-'}</div>
                      <div className={styles.subtle}>{item.quota_model || '-'}</div>
                    </td>
                    <td>{formatDateTime(item.next_recover_at)}</td>
                    <td>{formatNumber(item.usage?.request_count)}</td>
                    <td>{formatAvg(item.usage?.avg_total_tokens)}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void loadDetail(item.auth_index || '')}
                        disabled={!item.auth_index}
                      >
                        {t('codex_management.detail')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className={styles.dualGrid}>
        <Card title={t('codex_management.usage_title')}>
          {usage.length === 0 ? (
            <EmptyState title={t('codex_management.empty_usage')} />
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('codex_management.columns.auth_index')}</th>
                    <th>{t('codex_management.columns.account')}</th>
                    <th>{t('codex_management.columns.requests')}</th>
                    <th>{t('codex_management.columns.input_tokens')}</th>
                    <th>{t('codex_management.columns.output_tokens')}</th>
                    <th>{t('codex_management.columns.cached_tokens')}</th>
                    <th>{t('codex_management.columns.recovered_tokens')}</th>
                    <th>{t('codex_management.columns.avg_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((item) => (
                    <tr key={`${item.auth_index}-${item.account}`}>
                      <td className={styles.mono}>{item.auth_index || '-'}</td>
                      <td>{item.account || '-'}</td>
                      <td>{formatNumber(item.request_count)}</td>
                      <td>{formatNumber(item.input_tokens)}</td>
                      <td>{formatNumber(item.output_tokens)}</td>
                      <td>{formatNumber(item.cached_tokens)}</td>
                      <td>{formatNumber(item.recovered_tokens)}</td>
                      <td>{formatAvg(item.avg_total_tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={t('codex_management.events_title')}
          extra={
            <div className={styles.inlineControls}>
              <Input
                value={eventsKeyword}
                onChange={(event) => {
                  setEventsKeyword(event.target.value);
                  setEventsPage(1);
                }}
                placeholder={t('codex_management.events_keyword_placeholder')}
              />
              <select
                className={styles.select}
                value={eventsAuthIndex}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setEventsAuthIndex(nextValue);
                  setEventsPage(1);
                }}
              >
                <option value="">{t('codex_management.all_accounts')}</option>
                {accounts
                  .filter((item) => item.auth_index)
                  .map((item) => (
                    <option key={item.auth_index} value={item.auth_index}>
                      {item.auth_index} · {item.account || item.file_name || '-'}
                    </option>
                  ))}
              </select>
              <select
                className={styles.select}
                value={eventsEventType}
                onChange={(event) => {
                  setEventsEventType(event.target.value);
                  setEventsPage(1);
                }}
              >
                <option value="">{t('codex_management.events_all_types')}</option>
                {eventTypeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                className={styles.select}
                value={eventsQuotaExceeded}
                onChange={(event) => {
                  setEventsQuotaExceeded(event.target.value as 'all' | 'yes' | 'no');
                  setEventsPage(1);
                }}
              >
                <option value="all">{t('codex_management.events_quota_all')}</option>
                <option value="yes">{t('codex_management.events_quota_yes')}</option>
                <option value="no">{t('codex_management.events_quota_no')}</option>
              </select>
              <select
                className={styles.select}
                value={eventsSortBy}
                onChange={(event) => {
                  setEventsSortBy(event.target.value);
                  setEventsPage(1);
                }}
              >
                <option value="created_at">{t('codex_management.events_sort_created_at')}</option>
                <option value="auth_index">{t('codex_management.columns.auth_index')}</option>
                <option value="event_type">{t('codex_management.columns.event_type')}</option>
                <option value="recover_at">{t('codex_management.columns.recover')}</option>
                <option value="request_count">{t('codex_management.columns.requests')}</option>
                <option value="total_tokens">{t('codex_management.columns.total_tokens')}</option>
              </select>
              <select
                className={styles.select}
                value={eventsSortOrder}
                onChange={(event) => {
                  setEventsSortOrder(event.target.value as 'asc' | 'desc');
                  setEventsPage(1);
                }}
              >
                <option value="desc">{t('codex_management.events_sort_desc')}</option>
                <option value="asc">{t('codex_management.events_sort_asc')}</option>
              </select>
              <select
                className={styles.select}
                value={eventsPageSize}
                onChange={(event) => {
                  setEventsPageSize(Number(event.target.value) || 10);
                  setEventsPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <Button size="sm" variant="secondary" onClick={() => void loadEvents()}>
                {t('common.refresh')}
              </Button>
            </div>
          }
        >
          {events.length === 0 ? (
            <EmptyState title={t('codex_management.empty_events')} />
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('codex_management.columns.created_at')}</th>
                    <th>{t('codex_management.columns.auth_index')}</th>
                    <th>{t('codex_management.columns.event_type')}</th>
                    <th>{t('codex_management.columns.reason')}</th>
                    <th>{t('codex_management.columns.requests')}</th>
                    <th>{t('codex_management.columns.total_tokens')}</th>
                    <th>{t('codex_management.columns.recover')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((item) => (
                    <tr key={item.id || `${item.auth_index}-${item.created_at}-${item.event_type}`}>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td className={styles.mono}>{item.auth_index || '-'}</td>
                      <td>{item.event_type || '-'}</td>
                      <td>
                        <div>{item.reason || item.status_message || '-'}</div>
                        {item.last_error && <div className={styles.subtle}>{item.last_error}</div>}
                      </td>
                      <td>{formatNumber(item.request_count)}</td>
                      <td>{formatNumber(item.total_tokens)}</td>
                      <td>{formatDateTime(item.recover_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={styles.pagination}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEventsPage((current) => Math.max(1, current - 1))}
              disabled={eventsPage <= 1}
            >
              {t('auth_files.pagination_prev')}
            </Button>
            <div className={styles.pageMeta}>
              {t('codex_management.events_pagination', {
                page: eventsPage,
                totalPages: eventsTotalPages,
                total: eventsTotal,
              })}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEventsPage((current) => Math.min(eventsTotalPages, current + 1))}
              disabled={eventsPage >= eventsTotalPages}
            >
              {t('auth_files.pagination_next')}
            </Button>
          </div>
        </Card>
      </div>

      <Card
        title={t('codex_management.detail_title')}
        extra={
          selectedAuthIndex ? (
            <div className={styles.subtle}>
              {t('codex_management.detail_selected')}: <span className={styles.mono}>{selectedAuthIndex}</span>
            </div>
          ) : undefined
        }
      >
        {detailLoading ? (
          <div className={styles.placeholder}>{t('common.loading')}</div>
        ) : detailSnapshot ? (
          <div className={styles.detailGrid}>
            <section className={styles.detailSection}>
              <h3>{t('codex_management.detail_basic')}</h3>
              <div className={styles.kvGrid}>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.auth_index')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.auth_index || '-'}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.account')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.account || '-'}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.file')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.file_name || '-'}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_account_type')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.account_type || detailSnapshot.label || '-'}</div>
                </div>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>{t('codex_management.detail_status_title')}</h3>
              <div className={styles.kvGrid}>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.status')}</div>
                  <div className={styles.kvValue}>
                    {t(`codex_management.status.${getStatusText(detailSnapshot)}`, {
                      defaultValue: detailSnapshot.status_message || detailSnapshot.status || t('codex_management.status.unknown'),
                    })}
                  </div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_status_message')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.status_message || detailSnapshot.last_error_message || '-'}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_disabled')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.disabled ? t('common.yes', { defaultValue: '是' }) : t('common.no', { defaultValue: '否' })}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_unavailable')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.unavailable ? t('common.yes', { defaultValue: '是' }) : t('common.no', { defaultValue: '否' })}</div>
                </div>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>{t('codex_management.detail_quota_title')}</h3>
              <div className={styles.kvGrid}>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_quota_exceeded')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.quota_exceeded ? t('common.yes', { defaultValue: '是' }) : t('common.no', { defaultValue: '否' })}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.quota')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.quota_reason || '-'}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_quota_model')}</div>
                  <div className={styles.kvValue}>{detailSnapshot.quota_model || '-'}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.recover')}</div>
                  <div className={styles.kvValue}>{formatDateTime(detailSnapshot.next_recover_at)}</div>
                </div>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>{t('codex_management.detail_usage_title')}</h3>
              <div className={styles.kvGrid}>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.requests')}</div>
                  <div className={styles.kvValue}>{formatNumber(detailUsage?.request_count)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.input_tokens')}</div>
                  <div className={styles.kvValue}>{formatNumber(detailUsage?.input_tokens)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.output_tokens')}</div>
                  <div className={styles.kvValue}>{formatNumber(detailUsage?.output_tokens)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.total_tokens')}</div>
                  <div className={styles.kvValue}>{formatNumber(detailUsage?.total_tokens)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.columns.avg_total')}</div>
                  <div className={styles.kvValue}>{formatAvg(detailUsage?.avg_total_tokens)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_last_requested_at')}</div>
                  <div className={styles.kvValue}>{formatDateTime(detailUsage?.last_requested_at)}</div>
                </div>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>{t('codex_management.detail_time_title')}</h3>
              <div className={styles.kvGrid}>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_expires_at')}</div>
                  <div className={styles.kvValue}>{formatDateTime(detailSnapshot.expires_at)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_last_refreshed_at')}</div>
                  <div className={styles.kvValue}>{formatDateTime(detailSnapshot.last_refreshed_at)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_next_refresh_after')}</div>
                  <div className={styles.kvValue}>{formatDateTime(detailSnapshot.next_refresh_after)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_next_retry_after')}</div>
                  <div className={styles.kvValue}>{formatDateTime(detailSnapshot.next_retry_after)}</div>
                </div>
                <div className={styles.kvItem}>
                  <div className={styles.kvLabel}>{t('codex_management.detail_updated_at')}</div>
                  <div className={styles.kvValue}>{formatDateTime(detailSnapshot.updated_at)}</div>
                </div>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>{t('codex_management.detail_recent_events')}</h3>
              {detailRecentEvents.length === 0 ? (
                <div className={styles.placeholder}>{t('codex_management.empty_events')}</div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{t('codex_management.columns.created_at')}</th>
                        <th>{t('codex_management.columns.event_type')}</th>
                        <th>{t('codex_management.columns.reason')}</th>
                        <th>{t('codex_management.columns.requests')}</th>
                        <th>{t('codex_management.columns.total_tokens')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRecentEvents.map((item) => (
                        <tr key={item.id || `${item.auth_index}-${item.created_at}-${item.event_type}`}>
                          <td>{formatDateTime(item.created_at)}</td>
                          <td>{item.event_type || '-'}</td>
                          <td>{item.reason || item.status_message || item.last_error || '-'}</td>
                          <td>{formatNumber(item.request_count)}</td>
                          <td>{formatNumber(item.total_tokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={styles.detailSection}>
              <h3>{t('codex_management.detail_raw')}</h3>
              <pre className={styles.jsonBlock}>{detailJson}</pre>
            </section>
          </div>
        ) : (
          <EmptyState title={t('codex_management.empty_detail')} />
        )}
      </Card>
    </div>
  );
}
