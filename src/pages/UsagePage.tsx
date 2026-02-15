import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useThemeStore, useConfigStore } from '@/stores';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  ApiDetailsCard,
  ModelStatsCard,
  PriceSettingsCard,
  CredentialStatsCard,
  TokenBreakdownChart,
  CostTrendChart,
  ServiceHealthCard,
  useUsageData,
  useSparklines,
  useChartData,
} from '@/components/usage';
import {
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  filterUsageByTimeRange,
  type UsageTimeRange,
} from '@/utils/usage';
import styles from './UsagePage.module.scss';

const CHART_LINES_STORAGE_KEY = 'usage-chart-lines';
const TIME_RANGE_STORAGE_KEY = 'usage-time-range';
const DEFAULT_CHART_LINES = ['all'];
const MAX_CHART_LINES = 9;
const DEFAULT_TIME_RANGE: UsageTimeRange = '24h';

const HOUR_WINDOW_BY_TIME_RANGE: Record<UsageTimeRange, number | undefined> = {
  '7h': 7,
  '24h': 24,
  '7d': 24 * 7,
  all: undefined,
};

function isUsageTimeRange(value: string): value is UsageTimeRange {
  return value === '7h' || value === '24h' || value === '7d' || value === 'all';
}

function loadChartLines(): string[] {
  if (typeof window === 'undefined') return DEFAULT_CHART_LINES;

  try {
    const raw = window.localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) return DEFAULT_CHART_LINES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CHART_LINES;
    return parsed
      .filter((line): line is string => typeof line === 'string')
      .slice(0, MAX_CHART_LINES);
  } catch {
    return DEFAULT_CHART_LINES;
  }
}

function loadTimeRange(): UsageTimeRange {
  if (typeof window === 'undefined') return DEFAULT_TIME_RANGE;

  const raw = window.localStorage.getItem(TIME_RANGE_STORAGE_KEY);
  if (!raw || !isUsageTimeRange(raw)) return DEFAULT_TIME_RANGE;
  return raw;
}

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function UsagePage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const geminiApiKeys = useConfigStore((state) => state.config?.geminiApiKeys ?? []);
  const claudeApiKeys = useConfigStore((state) => state.config?.claudeApiKeys ?? []);
  const codexApiKeys = useConfigStore((state) => state.config?.codexApiKeys ?? []);
  const vertexApiKeys = useConfigStore((state) => state.config?.vertexApiKeys ?? []);
  const openaiProviders = useConfigStore((state) => state.config?.openaiCompatibility ?? []);
  const isDark = resolvedTheme === 'dark';

  // Data hook
  const {
    usage,
    loading,
    error,
    modelPrices,
    setModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing,
    clearing,
    handleClearUsage,
    lastRefreshedAt,
    timeRange,
    setTimeRange,
  } = useUsageData();

  // 清除统计确认
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useHeaderRefresh(loadUsage);

  const [chartLines, setChartLines] = useState<string[]>(loadChartLines);
  const [usageTimeRange, setUsageTimeRange] = useState<UsageTimeRange>(loadTimeRange);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
  }, [chartLines]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TIME_RANGE_STORAGE_KEY, usageTimeRange);
  }, [usageTimeRange]);

  useEffect(() => {
    const apiRange = usageTimeRange === 'all' ? '' : usageTimeRange;
    if (timeRange !== apiRange) {
      setTimeRange(apiRange);
    }
  }, [usageTimeRange, timeRange, setTimeRange]);

  const filteredUsage = useMemo(
    () => filterUsageByTimeRange(usage, usageTimeRange),
    [usage, usageTimeRange]
  );

  const hourWindowHours = HOUR_WINDOW_BY_TIME_RANGE[usageTimeRange];

  // Sparklines hook
  const { requestsSparkline, tokensSparkline, rpmSparkline, tpmSparkline, costSparkline } =
    useSparklines({ usage: filteredUsage, loading });

  // Chart data hook
  const {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
  } = useChartData({
    usage: filteredUsage,
    chartLines,
    isDark,
    isMobile,
    hourWindowHours,
  });

  // Derived data
  const modelNames = useMemo(() => getModelNamesFromUsage(filteredUsage), [filteredUsage]);
  const apiStats = useMemo(
    () => getApiStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const modelStats = useMemo(
    () => getModelStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const hasPrices = Object.keys(modelPrices).length > 0;
  const timeRangeOptions = useMemo(
    () => [
      { value: '7h', label: t('usage_stats.range_7h') },
      { value: '24h', label: t('usage_stats.range_24h') },
      { value: '7d', label: t('usage_stats.range_7d') },
      { value: 'all', label: t('usage_stats.range_all') },
    ],
    [t]
  );

  return (
    <div className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('usage_stats.title')}</h1>
        <div className={styles.headerActions}>
          <div className={styles.timeRangeGroup}>
            <span className={styles.timeRangeLabel}>{t('usage_stats.range_filter')}</span>
            <Select
              className={styles.timeRangeSelectControl}
              value={usageTimeRange}
              options={timeRangeOptions}
              onChange={(value) => {
                if (isUsageTimeRange(value)) {
                  setUsageTimeRange(value);
                }
              }}
              ariaLabel={t('usage_stats.range_filter')}
            />
          </div>
          {lastRefreshedAt && (
            <span className={styles.lastRefreshed}>
              {t('usage_stats.last_updated')} {lastRefreshedAt.toLocaleString()}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            disabled={loading || importing}
          >
            {t('usage_stats.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={importing}
            disabled={loading || exporting}
          >
            {t('usage_stats.import')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            loading={clearing}
            disabled={loading || exporting || importing}
          >
            {t('usage_stats.clear')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadUsage}
            disabled={loading || exporting || importing}
          >
            {loading ? t('common.loading') : t('usage_stats.refresh')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportChange}
          />
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* 清除统计确认对话框 */}
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

      {/* Stats Overview Cards */}
      <StatCards
        usage={usage}
        loading={loading}
        modelPrices={modelPrices}
        sparklines={{
          requests: requestsSparkline,
          tokens: tokensSparkline,
          rpm: rpmSparkline,
          tpm: tpmSparkline,
          cost: costSparkline,
        }}
      />

      {/* Chart Line Selection */}
      <ChartLineSelector
        chartLines={chartLines}
        modelNames={modelNames}
        maxLines={MAX_CHART_LINES}
        onChange={setChartLines}
      />

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <UsageChart
          title={t('usage_stats.requests_trend')}
          period={requestsPeriod}
          onPeriodChange={setRequestsPeriod}
          chartData={requestsChartData}
          chartOptions={requestsChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
        <UsageChart
          title={t('usage_stats.tokens_trend')}
          period={tokensPeriod}
          onPeriodChange={setTokensPeriod}
          chartData={tokensChartData}
          chartOptions={tokensChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
      </div>

      <div className={styles.chartsGrid}>
        <TokenBreakdownChart
          usage={filteredUsage}
          loading={loading}
          isDark={isDark}
          isMobile={isMobile}
          hourWindowHours={hourWindowHours}
        />
        <CostTrendChart
          usage={filteredUsage}
          loading={loading}
          isDark={isDark}
          isMobile={isMobile}
          modelPrices={modelPrices}
          hourWindowHours={hourWindowHours}
        />
      </div>

      {/* Details Grid */}
      <div className={styles.detailsGrid}>
        <ApiDetailsCard apiStats={apiStats} loading={loading} hasPrices={hasPrices} />
        <ModelStatsCard modelStats={modelStats} loading={loading} hasPrices={hasPrices} />
      </div>

      <div className={styles.detailsGrid}>
        <ServiceHealthCard usage={filteredUsage} loading={loading} />
        <CredentialStatsCard
          usage={filteredUsage}
          loading={loading}
          geminiKeys={geminiApiKeys}
          claudeConfigs={claudeApiKeys}
          codexConfigs={codexApiKeys}
          vertexConfigs={vertexApiKeys}
          openaiProviders={openaiProviders}
        />
      </div>

      {/* Price Settings */}
      <PriceSettingsCard
        modelNames={modelNames}
        modelPrices={modelPrices}
        onPricesChange={setModelPrices}
      />
    </div>
  );
}
