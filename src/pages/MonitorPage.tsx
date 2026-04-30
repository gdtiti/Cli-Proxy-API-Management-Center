import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useThemeStore } from '@/stores';
import { useNotificationStore } from '@/stores';
import { providersApi } from '@/services/api';
import { isPgModeNotEnabledError, usageApi } from '@/services/api/usage';
import { buildCandidateUsageSourceIds } from '@/utils/usage';
import { KpiCards } from '@/components/monitor/KpiCards';
import { ModelDistributionChart } from '@/components/monitor/ModelDistributionChart';
import { DailyTrendChart } from '@/components/monitor/DailyTrendChart';
import { HourlyModelChart } from '@/components/monitor/HourlyModelChart';
import { HourlyTokenChart } from '@/components/monitor/HourlyTokenChart';
import { AccountOverview } from '@/components/monitor/AccountOverview';
import { ChannelStats } from '@/components/monitor/ChannelStats';
import { FailureAnalysis } from '@/components/monitor/FailureAnalysis';
import { RequestLogs } from '@/components/monitor/RequestLogs';
import styles from './MonitorPage.module.scss';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Time range options
type TimeRange = 1 | 7 | 14 | 30;

export interface UsageDetail {
  timestamp: string;
  failed: boolean;
  source: string;
  auth_index: string;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  };
}

export interface UsageModelData {
  details: UsageDetail[];
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
}

export interface UsageApiData {
  models: Record<string, UsageModelData>;
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
}

export interface UsageData {
  apis: Record<string, UsageApiData>;
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  requests_by_day?: Record<string, number>;
  tokens_by_day?: Record<string, number>;
  requests_by_hour?: Record<string, number>;
  tokens_by_hour?: Record<string, number>;
}

export function MonitorPage() {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const showNotification = useNotificationStore((state) => state.showNotification);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiFilter, setApiFilter] = useState('');
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [providerMap, setProviderMap] = useState<Record<string, string>>({});
  const [providerModels, setProviderModels] = useState<Record<string, Set<string>>>({});
  const [providerTypeMap, setProviderTypeMap] = useState<Record<string, string>>({});

  // Load channel name mapping for all provider types.
  const loadProviderMap = useCallback(async () => {
    try {
      const map: Record<string, string> = {};
      const modelsMap: Record<string, Set<string>> = {};
      const typeMap: Record<string, string> = {};
      const registerSourceAliases = (
        input: {
          apiKey?: string;
          prefix?: string;
          providerName: string;
          providerType: string;
          modelSet?: Set<string>;
        }
      ) => {
        const aliases = new Set<string>();
        if (input.apiKey) aliases.add(input.apiKey);
        if (input.prefix) aliases.add(input.prefix);
        buildCandidateUsageSourceIds({ apiKey: input.apiKey, prefix: input.prefix })
          .forEach((alias) => aliases.add(alias));

        aliases.forEach((alias) => {
          map[alias] = input.providerName;
          typeMap[alias] = input.providerType;
          if (input.modelSet) {
            modelsMap[alias] = input.modelSet;
          }
        });
      };

      // Load all provider configurations in parallel.
      const [openaiProviders, geminiKeys, claudeConfigs, codexConfigs, vertexConfigs] =
        await Promise.all([
          providersApi.getOpenAIProviders().catch(() => []),
          providersApi.getGeminiKeys().catch(() => []),
          providersApi.getClaudeConfigs().catch(() => []),
          providersApi.getCodexConfigs().catch(() => []),
          providersApi.getVertexConfigs().catch(() => []),
        ]);

      // Handle OpenAI-compatible providers.
      openaiProviders.forEach((provider) => {
        const providerName = provider.headers?.['X-Provider'] || provider.name || 'unknown';
        const modelSet = new Set<string>();
        (provider.models || []).forEach((m) => {
          if (m.alias) modelSet.add(m.alias);
          if (m.name) modelSet.add(m.name);
        });
        const apiKeyEntries = provider.apiKeyEntries || [];
        apiKeyEntries.forEach((entry) => {
          const apiKey = entry.apiKey;
          if (apiKey) {
            registerSourceAliases({
              apiKey,
              prefix: providerName,
              providerName,
              providerType: 'OpenAI',
              modelSet,
            });
          }
        });
        if (provider.name) {
          registerSourceAliases({
            prefix: provider.name,
            providerName,
            providerType: 'OpenAI',
            modelSet,
          });
        }
      });

      // Handle Gemini providers.
      geminiKeys.forEach((config) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Gemini';
          registerSourceAliases({
            apiKey,
            prefix: providerName,
            providerName,
            providerType: 'Gemini',
          });
        }
      });

      // Handle Claude providers.
      claudeConfigs.forEach((config) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Claude';
          // Store the model set.
          if (config.models && config.models.length > 0) {
            const modelSet = new Set<string>();
            config.models.forEach((m) => {
              if (m.alias) modelSet.add(m.alias);
              if (m.name) modelSet.add(m.name);
            });
            registerSourceAliases({
              apiKey,
              prefix: providerName,
              providerName,
              providerType: 'Claude',
              modelSet,
            });
          } else {
            registerSourceAliases({
              apiKey,
              prefix: providerName,
              providerName,
              providerType: 'Claude',
            });
          }
        }
      });

      // Handle Codex providers.
      codexConfigs.forEach((config) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Codex';
          if (config.models && config.models.length > 0) {
            const modelSet = new Set<string>();
            config.models.forEach((m) => {
              if (m.alias) modelSet.add(m.alias);
              if (m.name) modelSet.add(m.name);
            });
            registerSourceAliases({
              apiKey,
              prefix: providerName,
              providerName,
              providerType: 'Codex',
              modelSet,
            });
          } else {
            registerSourceAliases({
              apiKey,
              prefix: providerName,
              providerName,
              providerType: 'Codex',
            });
          }
        }
      });

      // Handle Vertex providers.
      vertexConfigs.forEach((config) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Vertex';
          if (config.models && config.models.length > 0) {
            const modelSet = new Set<string>();
            config.models.forEach((m) => {
              if (m.alias) modelSet.add(m.alias);
              if (m.name) modelSet.add(m.name);
            });
            registerSourceAliases({
              apiKey,
              prefix: providerName,
              providerName,
              providerType: 'Vertex',
              modelSet,
            });
          } else {
            registerSourceAliases({
              apiKey,
              prefix: providerName,
              providerName,
              providerType: 'Vertex',
            });
          }
        }
      });

      setProviderMap(map);
      setProviderModels(modelsMap);
      setProviderTypeMap(typeMap);
    } catch (err) {
      console.warn('Monitor: Failed to load provider map:', err);
    }
  }, []);

  // Load data.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Convert days to the range parameter format.
      const rangeStr = `${timeRange}d`;
      // Load usage data and channel mappings in parallel.
      const [response] = await Promise.all([
        usageApi.getUsage({ range: rangeStr }),
        loadProviderMap(),
      ]);
      // The API may return data in response.usage or directly in response.
      const data = response?.usage ?? response;
      setUsageData(data as UsageData);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      console.error('Monitor: Error loading data:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t, loadProviderMap, timeRange]);

  // Initial load.
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Header refresh handler.
  useHeaderRefresh(loadData);

  // Filter data by API keyword.
  const filteredData = useMemo(() => {
    if (!usageData?.apis) {
      return null;
    }

    if (!apiFilter) {
      return usageData;
    }

    const keyword = apiFilter.toLowerCase();
    const filteredApis = Object.fromEntries(
      Object.entries(usageData.apis).filter(([apiKey]) => apiKey.toLowerCase().includes(keyword))
    );
    return { ...usageData, apis: filteredApis };
  }, [usageData, timeRange, apiFilter]);

  // Handle time range changes.
  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
  };

  // Handle API filter apply and refresh data.
  const handleApiFilterApply = () => {
    loadData();
  };

  // Clear usage statistics.
  const handleClearUsage = useCallback(async () => {
    setClearing(true);
    try {
      await usageApi.deleteUsage();
      showNotification(t('usage_stats.clear_success'), 'success');
      await loadData();
    } catch (err: unknown) {
      if (isPgModeNotEnabledError(err)) {
        showNotification(t('usage_stats.clear_not_supported_pg'), 'warning');
        return;
      }
      const msg = err instanceof Error ? err.message : '';
      showNotification(`${t('usage_stats.clear_failed')}${msg ? `: ${msg}` : ''}`, 'error');
    } finally {
      setClearing(false);
    }
  }, [t, showNotification, loadData]);

  return (
    <div className={styles.container}>
      {loading && !usageData && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      {/* Page title */}
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('monitor.title')}</h1>
        <div className={styles.headerActions}>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            loading={clearing}
            disabled={loading}
          >
            {t('usage_stats.clear')}
          </Button>
          <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            {loading ? t('common.loading') : t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p>{t('usage_stats.clear_confirm')}</p>
            <div className={styles.confirmActions}>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  setShowClearConfirm(false);
                  await handleClearUsage();
                }}
                loading={clearing}
              >
                {t('common.confirm')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowClearConfirm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Time range and API filter */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('monitor.time_range')}</span>
          <div className={styles.timeButtons}>
            {([1, 7, 14, 30] as TimeRange[]).map((range) => (
              <button
                key={range}
                className={`${styles.timeButton} ${timeRange === range ? styles.active : ''}`}
                onClick={() => handleTimeRangeChange(range)}
              >
                {range === 1 ? t('monitor.today') : t('monitor.last_n_days', { n: range })}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('monitor.api_filter')}</span>
          <input
            type="text"
            className={styles.filterInput}
            placeholder={t('monitor.api_filter_placeholder')}
            value={apiFilter}
            onChange={(e) => setApiFilter(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={handleApiFilterApply}>
            {t('monitor.apply')}
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <KpiCards data={filteredData} loading={loading} timeRange={timeRange} />

      {/* Charts */}
      <div className={styles.chartsGrid}>
        <ModelDistributionChart
          data={filteredData}
          loading={loading}
          isDark={isDark}
          timeRange={timeRange}
        />
        <DailyTrendChart
          data={filteredData}
          loading={loading}
          isDark={isDark}
          timeRange={timeRange}
        />
      </div>

      {/* Hourly charts */}
      <HourlyModelChart data={filteredData} loading={loading} isDark={isDark} />
      <HourlyTokenChart data={filteredData} loading={loading} isDark={isDark} />

      {/* Account overview */}
      <AccountOverview
        data={filteredData}
        loading={loading}
        providerMap={providerMap}
        providerTypeMap={providerTypeMap}
      />

      {/* Statistics tables */}
      <div className={styles.statsGrid}>
        <ChannelStats
          data={filteredData}
          loading={loading}
          providerMap={providerMap}
          providerModels={providerModels}
        />
        <FailureAnalysis
          data={filteredData}
          loading={loading}
          providerMap={providerMap}
          providerModels={providerModels}
        />
      </div>

      {/* Request logs */}
      <RequestLogs
        data={filteredData}
        loading={loading}
        providerMap={providerMap}
        providerTypeMap={providerTypeMap}
        apiFilter={apiFilter}
      />
    </div>
  );
}
