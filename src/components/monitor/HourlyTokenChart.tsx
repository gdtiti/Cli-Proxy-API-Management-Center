import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart } from 'react-chartjs-2';
import type { UsageData } from '@/pages/MonitorPage';
import { buildHourlySeriesByModel, buildHourlyTokenBreakdown } from '@/utils/usage';
import styles from '@/pages/MonitorPage.module.scss';

interface HourlyTokenChartProps {
  data: UsageData | null;
  loading: boolean;
  isDark: boolean;
}

type HourRange = 6 | 12 | 24;

export function HourlyTokenChart({ data, loading, isDark }: HourlyTokenChartProps) {
  const { t } = useTranslation();
  const [hourRange, setHourRange] = useState<HourRange>(12);

  // 按小时聚合 Token 数据（优先明细；无明细时回退到聚合 buckets）
  const hourlyData = useMemo(() => {
    if (!data?.apis) {
      return {
        hours: [],
        totalTokens: [] as number[],
        inputTokens: [] as number[],
        outputTokens: [] as number[],
        hasBreakdown: false,
        hasData: false,
      };
    }

    const hourWindow = hourRange + 1;
    const totalSeries = buildHourlySeriesByModel(data, 'tokens', hourWindow);
    const breakdownSeries = buildHourlyTokenBreakdown(data, hourWindow);
    const hours = totalSeries.labels;
    if (!hours.length) {
      return {
        hours: [],
        totalTokens: [] as number[],
        inputTokens: [] as number[],
        outputTokens: [] as number[],
        hasBreakdown: false,
        hasData: false,
      };
    }

    const totalTokens = hours.map((_, index) => {
      let total = 0;
      totalSeries.dataByModel.forEach((values) => {
        total += values[index] || 0;
      });
      return total / 1000;
    });

    const breakdownLabelIndex = new Map(
      breakdownSeries.labels.map((label, index) => [label, index])
    );

    const inputTokens = hours.map((hourLabel) => {
      const index = breakdownLabelIndex.get(hourLabel);
      if (index === undefined) return 0;
      return (breakdownSeries.dataByCategory.input[index] || 0) / 1000;
    });

    const outputTokens = hours.map((hourLabel) => {
      const index = breakdownLabelIndex.get(hourLabel);
      if (index === undefined) return 0;
      return (breakdownSeries.dataByCategory.output[index] || 0) / 1000;
    });

    const hasData = totalTokens.some((value) => value > 0);
    return {
      hours,
      totalTokens,
      inputTokens,
      outputTokens,
      hasBreakdown: breakdownSeries.hasData,
      hasData,
    };
  }, [data, hourRange]);

  // 获取时间范围标签
  const hourRangeLabel = useMemo(() => {
    if (hourRange === 6) return t('monitor.hourly.last_6h');
    if (hourRange === 12) return t('monitor.hourly.last_12h');
    return t('monitor.hourly.last_24h');
  }, [hourRange, t]);

  // 图表数据
  const chartData = useMemo(() => {
    const labels = hourlyData.hours.map((hour) => {
      return hour.slice(-5);
    });

    const datasets: any[] = [];

    if (hourlyData.hasBreakdown) {
      datasets.push(
        {
          type: 'line' as const,
          label: t('monitor.hourly_token.input'),
          data: hourlyData.inputTokens,
          borderColor: '#22c55e',
          backgroundColor: '#22c55e',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'y',
          order: 0,
          pointRadius: 3,
          pointBackgroundColor: '#22c55e',
        },
        {
          type: 'line' as const,
          label: t('monitor.hourly_token.output'),
          data: hourlyData.outputTokens,
          borderColor: '#f97316',
          backgroundColor: '#f97316',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'y',
          order: 0,
          pointRadius: 3,
          pointBackgroundColor: '#f97316',
        }
      );
    }

    datasets.push({
      type: 'bar' as const,
      label: t('monitor.hourly_token.total'),
      data: hourlyData.totalTokens,
      backgroundColor: 'rgba(59, 130, 246, 0.6)',
      borderColor: 'rgba(59, 130, 246, 0.6)',
      borderWidth: 1,
      borderRadius: 4,
      yAxisID: 'y',
      order: 1,
    });

    return {
      labels,
      datasets,
    };
  }, [hourlyData, t]);

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
          padding: 12,
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
        position: 'left' as const,
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
    },
  }), [isDark]);

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{t('monitor.hourly_token.title')}</h3>
          <p className={styles.chartSubtitle}>
            {hourRangeLabel}
          </p>
        </div>
        <div className={styles.chartControls}>
          <button
            className={`${styles.chartControlBtn} ${hourRange === 6 ? styles.active : ''}`}
            onClick={() => setHourRange(6)}
          >
            {t('monitor.hourly.last_6h')}
          </button>
          <button
            className={`${styles.chartControlBtn} ${hourRange === 12 ? styles.active : ''}`}
            onClick={() => setHourRange(12)}
          >
            {t('monitor.hourly.last_12h')}
          </button>
          <button
            className={`${styles.chartControlBtn} ${hourRange === 24 ? styles.active : ''}`}
            onClick={() => setHourRange(24)}
          >
            {t('monitor.hourly.last_24h')}
          </button>
        </div>
      </div>

      <div className={styles.chartContent}>
        {loading || !hourlyData.hasData ? (
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
