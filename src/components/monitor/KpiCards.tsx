import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UsageData } from '@/pages/MonitorPage';
import { collectUsageDetails, extractTotalTokens, getModelStats } from '@/utils/usage';
import styles from '@/pages/MonitorPage.module.scss';

interface KpiCardsProps {
  data: UsageData | null;
  loading: boolean;
  timeRange: number;
}

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(2) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toLocaleString();
}

export function KpiCards({ data, loading, timeRange }: KpiCardsProps) {
  const { t } = useTranslation();

  // 计算统计数据
  const stats = useMemo(() => {
    if (!data?.apis) {
      return {
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        successRate: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 0,
        avgTpm: 0,
        avgRpm: 0,
        avgRpd: 0,
      };
    }

    const modelStats = getModelStats(data, {});
    const summaryFromModels = modelStats.reduce(
      (acc, model) => {
        acc.totalRequests += model.requests;
        acc.successRequests += model.successCount;
        acc.failedRequests += model.failureCount;
        acc.totalTokens += model.tokens;
        return acc;
      },
      { totalRequests: 0, successRequests: 0, failedRequests: 0, totalTokens: 0 }
    );

    const details = collectUsageDetails(data);
    const detailsTokenTotal = details.reduce((sum, detail) => sum + extractTotalTokens(detail), 0);

    let totalRequests = typeof data.total_requests === 'number' ? data.total_requests : summaryFromModels.totalRequests;
    let successRequests = typeof data.success_count === 'number' ? data.success_count : summaryFromModels.successRequests;
    let failedRequests = typeof data.failure_count === 'number' ? data.failure_count : summaryFromModels.failedRequests;
    let totalTokens =
      typeof data.total_tokens === 'number'
        ? data.total_tokens
        : summaryFromModels.totalTokens > 0
          ? summaryFromModels.totalTokens
          : detailsTokenTotal;
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    let cachedTokens = 0;

    // 收集所有时间戳用于计算 TPM/RPM
    const timestamps: number[] = [];

    details.forEach((detail) => {
      inputTokens += detail.tokens.input_tokens || 0;
      outputTokens += detail.tokens.output_tokens || 0;
      reasoningTokens += detail.tokens.reasoning_tokens || 0;
      cachedTokens += detail.tokens.cached_tokens || 0;

      const timestamp = new Date(detail.timestamp).getTime();
      if (Number.isFinite(timestamp) && timestamp > 0) {
        timestamps.push(timestamp);
      }
    });

    const effectiveTotalRequests = Math.max(totalRequests, successRequests + failedRequests, 0);
    totalRequests = effectiveTotalRequests;
    if (successRequests + failedRequests > totalRequests) {
      successRequests = Math.max(totalRequests - failedRequests, 0);
    }
    if (totalTokens <= 0 && detailsTokenTotal > 0) {
      totalTokens = detailsTokenTotal;
    }

    const successRate = totalRequests > 0 ? (successRequests / totalRequests) * 100 : 0;

    // 计算 TPM 和 RPM（基于实际时间跨度）
    let avgTpm = 0;
    let avgRpm = 0;
    let avgRpd = 0;

    if (timestamps.length > 0) {
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      const timeSpanMinutes = Math.max((maxTime - minTime) / (1000 * 60), 1);
      const timeSpanDays = Math.max(timeSpanMinutes / (60 * 24), 1);

      avgTpm = Math.round(totalTokens / timeSpanMinutes);
      avgRpm = Math.round(totalRequests / timeSpanMinutes * 10) / 10;
      avgRpd = Math.round(totalRequests / timeSpanDays);
    } else if (totalRequests > 0 || totalTokens > 0) {
      const dayWindow = Math.max(timeRange, 1);
      const minuteWindow = dayWindow * 24 * 60;
      avgTpm = Math.round(totalTokens / minuteWindow);
      avgRpm = Math.round((totalRequests / minuteWindow) * 10) / 10;
      avgRpd = Math.round(totalRequests / dayWindow);
    }

    return {
      totalRequests,
      successRequests,
      failedRequests,
      successRate,
      totalTokens,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cachedTokens,
      avgTpm,
      avgRpm,
      avgRpd,
    };
  }, [data, timeRange]);

  const timeRangeLabel = timeRange === 1
    ? t('monitor.today')
    : t('monitor.last_n_days', { n: timeRange });

  return (
    <div className={styles.kpiGrid}>
      {/* 请求数 */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.requests')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.totalRequests)}
        </div>
        <div className={styles.kpiMeta}>
          <span className={styles.kpiSuccess}>
            {t('monitor.kpi.success')}: {loading ? '--' : stats.successRequests.toLocaleString()}
          </span>
          <span className={styles.kpiFailure}>
            {t('monitor.kpi.failed')}: {loading ? '--' : stats.failedRequests.toLocaleString()}
          </span>
          <span>
            {t('monitor.kpi.rate')}: {loading ? '--' : stats.successRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Tokens */}
      <div className={`${styles.kpiCard} ${styles.green}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.tokens')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.totalTokens)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.input')}: {loading ? '--' : formatNumber(stats.inputTokens)}</span>
          <span>{t('monitor.kpi.output')}: {loading ? '--' : formatNumber(stats.outputTokens)}</span>
        </div>
      </div>

      {/* 平均 TPM */}
      <div className={`${styles.kpiCard} ${styles.purple}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.avg_tpm')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.avgTpm)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.tokens_per_minute')}</span>
        </div>
      </div>

      {/* 平均 RPM */}
      <div className={`${styles.kpiCard} ${styles.orange}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.avg_rpm')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : stats.avgRpm.toFixed(1)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.requests_per_minute')}</span>
        </div>
      </div>

      {/* 日均 RPD */}
      <div className={`${styles.kpiCard} ${styles.cyan}`}>
        <div className={styles.kpiTitle}>
          <span className={styles.kpiLabel}>{t('monitor.kpi.avg_rpd')}</span>
          <span className={styles.kpiTag}>{timeRangeLabel}</span>
        </div>
        <div className={styles.kpiValue}>
          {loading ? '--' : formatNumber(stats.avgRpd)}
        </div>
        <div className={styles.kpiMeta}>
          <span>{t('monitor.kpi.requests_per_day')}</span>
        </div>
      </div>
    </div>
  );
}
