import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chart } from 'react-chartjs-2';
import type { UsageData } from '@/pages/MonitorPage';
import { buildHourlySeriesByModel, collectUsageDetails, formatHourLabel, getModelStats } from '@/utils/usage';
import styles from '@/pages/MonitorPage.module.scss';

interface HourlyModelChartProps {
  data: UsageData | null;
  loading: boolean;
  isDark: boolean;
}

// 颜色调色板
const COLORS = [
  'rgba(59, 130, 246, 0.7)',   // 蓝色
  'rgba(34, 197, 94, 0.7)',    // 绿色
  'rgba(249, 115, 22, 0.7)',   // 橙色
  'rgba(139, 92, 246, 0.7)',   // 紫色
  'rgba(236, 72, 153, 0.7)',   // 粉色
  'rgba(6, 182, 212, 0.7)',    // 青色
];

type HourRange = 6 | 12 | 24;

export function HourlyModelChart({ data, loading, isDark }: HourlyModelChartProps) {
  const { t } = useTranslation();
  const [hourRange, setHourRange] = useState<HourRange>(12);

  // 按小时聚合数据（优先明细；无明细时回退到聚合 buckets）
  const hourlyData = useMemo(() => {
    if (!data?.apis) {
      return {
        hours: [],
        models: [],
        modelData: {} as Record<string, number[]>,
        successRates: [] as number[],
        hasData: false,
      };
    }

    const hourWindow = hourRange + 1;
    const requestSeries = buildHourlySeriesByModel(data, 'requests', hourWindow);
    const hours = requestSeries.labels;
    if (!hours.length) {
      return {
        hours: [],
        models: [],
        modelData: {} as Record<string, number[]>,
        successRates: [] as number[],
        hasData: false,
      };
    }

    const modelTotals: Record<string, number> = {};
    requestSeries.dataByModel.forEach((values, modelName) => {
      modelTotals[modelName] = values.reduce((sum, value) => sum + value, 0);
    });

    const topModels = Object.entries(modelTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    const modelData: Record<string, number[]> = {};
    topModels.forEach((model) => {
      modelData[model] = requestSeries.dataByModel.get(model) || new Array(hours.length).fill(0);
    });

    const successRates = new Array(hours.length).fill(0);
    const details = collectUsageDetails(data);
    if (details.length) {
      const hourBuckets = hours.map(() => ({ success: 0, total: 0 }));
      const hourIndexMap = new Map(hours.map((hour, index) => [hour, index]));

      details.forEach((detail) => {
        const timestamp =
          typeof detail.__timestampMs === 'number' ? detail.__timestampMs : Date.parse(detail.timestamp);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return;
        const normalized = new Date(timestamp);
        normalized.setMinutes(0, 0, 0);
        const hourLabel = formatHourLabel(normalized);
        const bucketIndex = hourIndexMap.get(hourLabel);
        if (bucketIndex === undefined) return;
        hourBuckets[bucketIndex].total += 1;
        if (!detail.failed) {
          hourBuckets[bucketIndex].success += 1;
        }
      });

      hourBuckets.forEach((bucket, index) => {
        successRates[index] = bucket.total > 0 ? (bucket.success / bucket.total) * 100 : 0;
      });
    } else {
      const modelStats = getModelStats(data, {});
      const totalRequests = modelStats.reduce((sum, item) => sum + item.requests, 0);
      const totalSuccess = modelStats.reduce((sum, item) => sum + item.successCount, 0);
      const fallbackRate = totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0;
      successRates.fill(fallbackRate);
    }

    const hasData = topModels.some((model) => modelData[model]?.some((value) => value > 0));
    return { hours, models: topModels, modelData, successRates, hasData };
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

    // 成功率折线放在最前面
    const datasets: any[] = [{
      type: 'line' as const,
      label: t('monitor.hourly.success_rate'),
      data: hourlyData.successRates,
      borderColor: '#4ef0c3',
      backgroundColor: '#4ef0c3',
      borderWidth: 2.5,
      tension: 0.4,
      yAxisID: 'y1',
      stack: '',
      pointRadius: 3,
      pointBackgroundColor: '#4ef0c3',
      pointBorderColor: '#4ef0c3',
    }];

    // 添加模型柱状图
    hourlyData.models.forEach((model, index) => {
      datasets.push({
        type: 'bar' as const,
        label: model,
        data: hourlyData.modelData[model],
        backgroundColor: COLORS[index % COLORS.length],
        borderColor: COLORS[index % COLORS.length],
        borderWidth: 1,
        borderRadius: 4,
        stack: 'models',
        yAxisID: 'y',
      });
    });

    return { labels, datasets };
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
      },
    },
    scales: {
      x: {
        stacked: true,
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
        stacked: true,
        position: 'left' as const,
        grid: {
          color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
        title: {
          display: true,
          text: t('monitor.hourly.requests'),
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
      y1: {
        position: 'right' as const,
        min: 0,
        max: 100,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
          callback: (value: string | number) => `${value}%`,
        },
        title: {
          display: true,
          text: t('monitor.hourly.success_rate'),
          color: isDark ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
    },
  }), [isDark, t]);

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{t('monitor.hourly_model.title')}</h3>
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
