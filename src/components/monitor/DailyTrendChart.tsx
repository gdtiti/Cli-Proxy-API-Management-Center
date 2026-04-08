import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart } from 'react-chartjs-2';
import type { UsageData } from '@/pages/MonitorPage';
import { buildDailySeriesByModel, buildDailyTokenBreakdown } from '@/utils/usage';
import styles from '@/pages/MonitorPage.module.scss';

interface DailyTrendChartProps {
  data: UsageData | null;
  loading: boolean;
  isDark: boolean;
  timeRange: number;
}

interface DailyChartSeries {
  labels: string[];
  requests: number[];
  totalTokens: number[];
  inputTokens: number[];
  outputTokens: number[];
  hasTokenBreakdown: boolean;
  hasData: boolean;
}

export function DailyTrendChart({ data, loading, isDark, timeRange }: DailyTrendChartProps) {
  const { t } = useTranslation();

  // 按日期聚合数据（优先明细；无明细时回退到聚合 buckets）
  const dailyData = useMemo((): DailyChartSeries => {
    const empty: DailyChartSeries = {
      labels: [],
      requests: [],
      totalTokens: [],
      inputTokens: [],
      outputTokens: [],
      hasTokenBreakdown: false,
      hasData: false,
    };

    if (!data?.apis) return empty;

    const requestSeries = buildDailySeriesByModel(data, 'requests');
    const totalTokenSeries = buildDailySeriesByModel(data, 'tokens');
    const tokenBreakdownSeries = buildDailyTokenBreakdown(data);

    const labels = Array.from(
      new Set([
        ...requestSeries.labels,
        ...totalTokenSeries.labels,
        ...tokenBreakdownSeries.labels,
      ])
    ).sort((a, b) => a.localeCompare(b));
    if (!labels.length) {
      return empty;
    }

    const buildTotalMap = (series: { labels: string[]; dataByModel: Map<string, number[]> }) => {
      const result = new Map<string, number>();
      series.labels.forEach((label, index) => {
        let total = 0;
        series.dataByModel.forEach((values) => {
          total += values[index] || 0;
        });
        result.set(label, total);
      });
      return result;
    };

    const buildCategoryMap = (series: { labels: string[]; dataByCategory: Record<string, number[]> }, key: string) => {
      const result = new Map<string, number>();
      const values = series.dataByCategory[key] || [];
      series.labels.forEach((label, index) => {
        result.set(label, values[index] || 0);
      });
      return result;
    };

    const requestMap = buildTotalMap(requestSeries);
    const totalTokenMap = buildTotalMap(totalTokenSeries);
    const inputTokenMap = buildCategoryMap(tokenBreakdownSeries, 'input');
    const outputTokenMap = buildCategoryMap(tokenBreakdownSeries, 'output');

    const requests = labels.map((label) => requestMap.get(label) || 0);
    const totalTokens = labels.map((label) => totalTokenMap.get(label) || 0);
    const inputTokens = labels.map((label) => inputTokenMap.get(label) || 0);
    const outputTokens = labels.map((label) => outputTokenMap.get(label) || 0);
    const hasTokenBreakdown = tokenBreakdownSeries.hasData;
    const hasData = requests.some((value) => value > 0) || totalTokens.some((value) => value > 0);

    return {
      labels,
      requests,
      totalTokens,
      inputTokens,
      outputTokens,
      hasTokenBreakdown,
      hasData,
    };
  }, [data]);

  // 图表数据
  const chartData = useMemo(() => {
    const labels = dailyData.labels.map((item) => {
      const date = new Date(`${item}T00:00:00`);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    const tokenDatasets = dailyData.hasTokenBreakdown
      ? [
          {
            type: 'bar' as const,
            label: t('monitor.trend.input_tokens'),
            data: dailyData.inputTokens.map((value) => value / 1000),
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgba(34, 197, 94, 0.7)',
            borderWidth: 1,
            borderRadius: 0,
            yAxisID: 'y',
            order: 1,
            stack: 'tokens',
          },
          {
            type: 'bar' as const,
            label: t('monitor.trend.output_tokens'),
            data: dailyData.outputTokens.map((value) => value / 1000),
            backgroundColor: 'rgba(249, 115, 22, 0.7)',
            borderColor: 'rgba(249, 115, 22, 0.7)',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y',
            order: 1,
            stack: 'tokens',
          },
        ]
      : [
          {
            type: 'bar' as const,
            label: t('monitor.hourly_token.total'),
            data: dailyData.totalTokens.map((value) => value / 1000),
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: 'rgba(59, 130, 246, 0.6)',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y',
            order: 1,
            stack: 'tokens',
          },
        ];

    return {
      labels,
      datasets: [
        {
          type: 'line' as const,
          label: t('monitor.trend.requests'),
          data: dailyData.requests,
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f6',
          borderWidth: 3,
          fill: false,
          tension: 0.35,
          yAxisID: 'y1',
          order: 0,
          pointRadius: 3,
          pointBackgroundColor: '#3b82f6',
        },
        ...tokenDatasets,
      ],
    };
  }, [dailyData, t]);

  // 图表配置
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: isDark ? '#9ca3af' : '#6b7280',
          usePointStyle: true,
          padding: 16,
          font: {
            size: 11,
          },
          generateLabels: (chart: any) => {
            return chart.data.datasets.map((dataset: any, i: number) => {
              const isLine = dataset.type === 'line';
              return {
                text: dataset.label,
                fillStyle: dataset.backgroundColor,
                strokeStyle: dataset.borderColor,
                lineWidth: 0,
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i,
                pointStyle: isLine ? 'circle' : 'rect',
              };
            });
          },
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#374151' : '#ffffff',
        titleColor: isDark ? '#f3f4f6' : '#111827',
        bodyColor: isDark ? '#d1d5db' : '#4b5563',
        borderColor: isDark ? '#4b5563' : '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.raw;
            if (context.dataset.yAxisID === 'y1') {
              return `${label}: ${value.toLocaleString()}`;
            }
            return `${label}: ${value.toFixed(1)}K`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        stacked: true,
        grid: {
          color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
          callback: (value: string | number) => `${value}K`,
        },
        title: {
          display: true,
          text: 'Tokens (K)',
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
        title: {
          display: true,
          text: t('monitor.trend.requests'),
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
    },
  }), [isDark, t]);

  const timeRangeLabel = timeRange === 1
    ? t('monitor.today')
    : t('monitor.last_n_days', { n: timeRange });

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{t('monitor.trend.title')}</h3>
          <p className={styles.chartSubtitle}>
            {timeRangeLabel} · {t('monitor.trend.subtitle')}
          </p>
        </div>
      </div>

      <div className={styles.chartContent}>
        {loading || !dailyData.hasData ? (
          <div className={styles.chartEmpty}>
            {loading ? t('common.loading') : t('monitor.no_data')}
          </div>
        ) : (
          <Chart type="bar" data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
}
