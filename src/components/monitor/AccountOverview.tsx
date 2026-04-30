import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { UsageData } from '@/pages/MonitorPage';
import {
  collectUsageDetailsWithEndpoint,
  extractTotalTokens,
  formatCompactNumber,
  normalizeAuthIndex,
  type UsageDetailWithEndpoint,
} from '@/utils/usage';
import { formatTimestamp, getProviderDisplayParts, getRateClassName } from '@/utils/monitor';
import styles from '@/pages/MonitorPage.module.scss';

interface AccountOverviewProps {
  data: UsageData | null;
  loading: boolean;
  providerMap: Record<string, string>;
  providerTypeMap?: Record<string, string>;
}

interface AccountModelStat {
  model: string;
  requests: number;
  success: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latestMs: number;
}

interface AccountRow {
  id: string;
  accountLabel: string;
  sourceLabel: string;
  providerLabel: string;
  providerType: string;
  sourceCount: number;
  requests: number;
  success: number;
  failed: number;
  successRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latestMs: number;
  latestTimestamp: string;
  models: AccountModelStat[];
  recentRequests: UsageDetailWithEndpoint[];
}

interface MutableAccountRow {
  id: string;
  authIndex: string | null;
  sources: Set<string>;
  providerLabels: Set<string>;
  providerTypes: Set<string>;
  requests: number;
  success: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latestMs: number;
  latestTimestamp: string;
  models: Map<string, AccountModelStat>;
  recentRequests: UsageDetailWithEndpoint[];
}

type AccountStatusFilter = 'all' | 'failed' | 'healthy';

const RECENT_REQUEST_LIMIT = 10;
const MODEL_LIMIT = 8;

function resolveProviderType(source: string, providerTypeMap: Record<string, string>): string {
  if (!source) return '';
  const direct = providerTypeMap[source];
  if (direct) return direct;
  const matched = Object.entries(providerTypeMap).find(([key]) => (
    source.startsWith(key) || key.startsWith(source)
  ));
  return matched?.[1] ?? '';
}

function getTokenValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '0';
}

function buildAccountRows(
  data: UsageData | null,
  providerMap: Record<string, string>,
  providerTypeMap: Record<string, string>
): AccountRow[] {
  const details = collectUsageDetailsWithEndpoint(data);
  const rows = new Map<string, MutableAccountRow>();

  details.forEach((detail) => {
    const authIndex = normalizeAuthIndex(detail.auth_index);
    const source = detail.source || '';
    const id = authIndex ? `auth:${authIndex}` : `source:${source || 'unknown'}`;
    const timestampMs = Number.isFinite(detail.__timestampMs)
      ? detail.__timestampMs
      : Date.parse(detail.timestamp);
    const safeTimestampMs = Number.isFinite(timestampMs) ? timestampMs : 0;
    const inputTokens = getTokenValue(detail.tokens?.input_tokens);
    const outputTokens = getTokenValue(detail.tokens?.output_tokens);
    const totalTokens = extractTotalTokens(detail);
    const displayParts = getProviderDisplayParts(source, providerMap);
    const providerLabel = displayParts.provider || displayParts.masked || '-';
    const providerType = resolveProviderType(source, providerTypeMap);

    let row = rows.get(id);
    if (!row) {
      row = {
        id,
        authIndex,
        sources: new Set<string>(),
        providerLabels: new Set<string>(),
        providerTypes: new Set<string>(),
        requests: 0,
        success: 0,
        failed: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latestMs: 0,
        latestTimestamp: '',
        models: new Map<string, AccountModelStat>(),
        recentRequests: [],
      };
      rows.set(id, row);
    }

    if (source) row.sources.add(source);
    if (providerLabel) row.providerLabels.add(providerLabel);
    if (providerType) row.providerTypes.add(providerType);
    row.requests += 1;
    if (detail.failed) {
      row.failed += 1;
    } else {
      row.success += 1;
    }
    row.inputTokens += inputTokens;
    row.outputTokens += outputTokens;
    row.totalTokens += totalTokens;
    if (safeTimestampMs >= row.latestMs) {
      row.latestMs = safeTimestampMs;
      row.latestTimestamp = detail.timestamp;
    }
    row.recentRequests.push(detail);

    const modelName = detail.__modelName || '-';
    const modelStat = row.models.get(modelName) || {
      model: modelName,
      requests: 0,
      success: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latestMs: 0,
    };
    modelStat.requests += 1;
    if (detail.failed) {
      modelStat.failed += 1;
    } else {
      modelStat.success += 1;
    }
    modelStat.inputTokens += inputTokens;
    modelStat.outputTokens += outputTokens;
    modelStat.totalTokens += totalTokens;
    modelStat.latestMs = Math.max(modelStat.latestMs, safeTimestampMs);
    row.models.set(modelName, modelStat);
  });

  return Array.from(rows.values())
    .map((row) => {
      const sourceLabels = Array.from(row.sources).map((source) => {
        const displayParts = getProviderDisplayParts(source, providerMap);
        return displayParts.masked || source;
      });
      const providerLabels = Array.from(row.providerLabels);
      const providerTypes = Array.from(row.providerTypes);
      const modelStats = Array.from(row.models.values())
        .sort((a, b) => b.requests - a.requests || b.latestMs - a.latestMs);
      const recentRequests = row.recentRequests
        .sort((a, b) => {
          const aMs = Number.isFinite(a.__timestampMs) ? a.__timestampMs : Date.parse(a.timestamp);
          const bMs = Number.isFinite(b.__timestampMs) ? b.__timestampMs : Date.parse(b.timestamp);
          return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
        })
        .slice(0, RECENT_REQUEST_LIMIT);

      return {
        id: row.id,
        accountLabel: row.authIndex ? `#${row.authIndex}` : (sourceLabels[0] || '-'),
        sourceLabel: sourceLabels[0] || '-',
        providerLabel: providerLabels.length > 1 ? providerLabels.join(', ') : (providerLabels[0] || '-'),
        providerType: providerTypes.length > 1 ? providerTypes.join(', ') : (providerTypes[0] || '-'),
        sourceCount: row.sources.size,
        requests: row.requests,
        success: row.success,
        failed: row.failed,
        successRate: row.requests > 0 ? (row.success / row.requests) * 100 : 0,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        latestMs: row.latestMs,
        latestTimestamp: row.latestTimestamp,
        models: modelStats,
        recentRequests,
      };
    })
    .sort((a, b) => b.failed - a.failed || b.requests - a.requests || b.latestMs - a.latestMs);
}

export function AccountOverview({
  data,
  loading,
  providerMap,
  providerTypeMap = {},
}: AccountOverviewProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const accountRows = useMemo(
    () => buildAccountRows(data, providerMap, providerTypeMap),
    [data, providerMap, providerTypeMap]
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return accountRows.filter((row) => {
      if (statusFilter === 'failed' && row.failed === 0) return false;
      if (statusFilter === 'healthy' && row.failed > 0) return false;
      if (!keyword) return true;
      return [
        row.accountLabel,
        row.sourceLabel,
        row.providerLabel,
        row.providerType,
        ...row.models.map((model) => model.model),
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [accountRows, search, statusFilter]);

  const selectedAccount = useMemo(
    () => filteredRows.find((row) => row.id === selectedAccountId) ?? null,
    [filteredRows, selectedAccountId]
  );

  const failingAccountCount = useMemo(
    () => accountRows.filter((row) => row.failed > 0).length,
    [accountRows]
  );

  return (
    <Card
      title={t('monitor.account.title')}
      subtitle={t('monitor.account.subtitle')}
      extra={<span className={styles.chartSubtitle}>{t('monitor.account.click_hint')}</span>}
    >
      <div className={styles.accountSummaryGrid}>
        <div className={styles.accountSummaryItem}>
          <span>{t('monitor.account.total_accounts')}</span>
          <strong>{formatNumber(accountRows.length)}</strong>
        </div>
        <div className={styles.accountSummaryItem}>
          <span>{t('monitor.account.failing_accounts')}</span>
          <strong className={failingAccountCount > 0 ? styles.kpiFailure : styles.kpiSuccess}>
            {formatNumber(failingAccountCount)}
          </strong>
        </div>
        <div className={styles.accountSummaryItem}>
          <span>{t('monitor.account.total_requests')}</span>
          <strong>{formatNumber(accountRows.reduce((sum, row) => sum + row.requests, 0))}</strong>
        </div>
      </div>

      <div className={styles.logFilters}>
        <input
          className={styles.filterInput}
          type="text"
          value={search}
          placeholder={t('monitor.account.search_placeholder')}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className={styles.logSelect}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as AccountStatusFilter)}
        >
          <option value="all">{t('monitor.account.all_status')}</option>
          <option value="failed">{t('monitor.account.only_failed')}</option>
          <option value="healthy">{t('monitor.account.only_healthy')}</option>
        </select>
        {selectedAccount && (
          <button
            type="button"
            className={styles.accountActionBtn}
            onClick={() => setSelectedAccountId(null)}
          >
            {t('monitor.account.clear_focus')}
          </button>
        )}
      </div>

      <div className={styles.tableWrapper}>
        {loading ? (
          <div className={styles.emptyState}>{t('common.loading')}</div>
        ) : filteredRows.length === 0 ? (
          <div className={styles.emptyState}>{t('monitor.account.no_data')}</div>
        ) : (
          <table className={`${styles.table} ${styles.accountTable}`}>
            <thead>
              <tr>
                <th>{t('monitor.account.account')}</th>
                <th>{t('monitor.account.provider')}</th>
                <th>{t('monitor.account.requests')}</th>
                <th>{t('monitor.account.success_rate')}</th>
                <th>{t('monitor.account.tokens')}</th>
                <th>{t('monitor.account.models')}</th>
                <th>{t('monitor.account.latest_request')}</th>
                <th>{t('monitor.account.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`${styles.expandable} ${selectedAccountId === row.id ? styles.accountSelectedRow : ''}`}
                  onClick={() => setSelectedAccountId(row.id)}
                >
                  <td>
                    <div className={styles.accountIdentity}>
                      <span className={styles.accountPrimary}>{row.accountLabel}</span>
                      <span className={styles.accountSecondary}>
                        {row.sourceCount > 1
                          ? t('monitor.account.source_count', { count: row.sourceCount })
                          : row.sourceLabel}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.accountIdentity}>
                      <span className={styles.accountPrimary}>{row.providerLabel}</span>
                      <span className={styles.accountSecondary}>{row.providerType}</span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.kpiSuccess}>{formatNumber(row.success)}</span>
                    {' / '}
                    <span className={styles.kpiFailure}>{formatNumber(row.failed)}</span>
                  </td>
                  <td className={getRateClassName(row.successRate, styles)}>
                    {row.successRate.toFixed(1)}%
                  </td>
                  <td>{formatCompactNumber(row.totalTokens)}</td>
                  <td>{formatNumber(row.models.length)}</td>
                  <td>{row.latestTimestamp ? formatTimestamp(row.latestTimestamp) : '-'}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.accountActionBtn}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedAccountId(row.id);
                      }}
                    >
                      {t('monitor.account.focus')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedAccount && (
        <div className={styles.accountDetailPanel}>
          <div className={styles.accountDetailHeader}>
            <div>
              <h3>{t('monitor.account.detail_title', { account: selectedAccount.accountLabel })}</h3>
              <p>
                {selectedAccount.providerLabel} · {selectedAccount.providerType} ·{' '}
                {t('monitor.account.success_failed', {
                  success: selectedAccount.success,
                  failed: selectedAccount.failed,
                })}
              </p>
            </div>
            <button
              type="button"
              className={styles.accountActionBtn}
              onClick={() => setSelectedAccountId(null)}
            >
              {t('monitor.account.clear_focus')}
            </button>
          </div>

          <div className={styles.accountDetailGrid}>
            <div className={styles.expandTableWrapper}>
              <div className={styles.expandHeader}>{t('monitor.account.model_breakdown')}</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('monitor.account.model')}</th>
                    <th>{t('monitor.account.requests')}</th>
                    <th>{t('monitor.account.success_rate')}</th>
                    <th>{t('monitor.account.tokens')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAccount.models.slice(0, MODEL_LIMIT).map((model) => {
                    const successRate = model.requests > 0 ? (model.success / model.requests) * 100 : 0;
                    return (
                      <tr key={model.model}>
                        <td>{model.model}</td>
                        <td>
                          <span className={styles.kpiSuccess}>{formatNumber(model.success)}</span>
                          {' / '}
                          <span className={styles.kpiFailure}>{formatNumber(model.failed)}</span>
                        </td>
                        <td className={getRateClassName(successRate, styles)}>
                          {successRate.toFixed(1)}%
                        </td>
                        <td>{formatCompactNumber(model.totalTokens)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.expandTableWrapper}>
              <div className={styles.expandHeader}>{t('monitor.account.recent_requests')}</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('monitor.logs.header_time')}</th>
                    <th>{t('monitor.logs.header_api')}</th>
                    <th>{t('monitor.logs.header_model')}</th>
                    <th>{t('monitor.logs.header_status')}</th>
                    <th>{t('monitor.logs.header_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAccount.recentRequests.map((request, index) => (
                    <tr key={`${request.timestamp}-${request.__endpoint}-${index}`}>
                      <td>{formatTimestamp(request.timestamp)}</td>
                      <td>{request.__endpointPath || request.__endpoint}</td>
                      <td>{request.__modelName || '-'}</td>
                      <td>
                        <span className={`${styles.statusPill} ${request.failed ? styles.failed : styles.success}`}>
                          {request.failed ? t('monitor.logs.failed') : t('monitor.logs.success')}
                        </span>
                      </td>
                      <td>{formatCompactNumber(extractTotalTokens(request))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
