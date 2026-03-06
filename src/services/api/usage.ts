/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, KeyStats } from '@/utils/usage';

const USAGE_TIMEOUT_MS = 60 * 1000;
const PG_MODE_NOT_ENABLED_PATTERN = /\bpg mode not enabled\b/i;

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

export interface UsageQueryParams {
  range?: string;       // e.g. '24h', '7d', '30d'
  from?: string;        // ISO date string
  to?: string;          // ISO date string
  instance?: string;    // instance id or 'all'
}

export const isPgModeNotEnabledError = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return PG_MODE_NOT_ENABLED_PATTERN.test(message);
};

export const usageApi = {
  /**
   * 获取使用统计原始数据，支持 range/from/to/instance 查询参数
   */
  getUsage: (params?: UsageQueryParams) => {
    const searchParams = new URLSearchParams();
    if (params?.range) searchParams.set('range', params.range);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.instance) searchParams.set('instance', params.instance);
    const qs = searchParams.toString();
    const url = qs ? `/usage?${qs}` : '/usage';
    return apiClient.get<Record<string, unknown>>(url, { timeout: USAGE_TIMEOUT_MS });
  },

  /**
   * 导出使用统计快照
   */
  exportUsage: () => apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导入使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 清除使用统计数据
   */
  deleteUsage: (params?: { before?: string; instance?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.before) searchParams.set('before', params.before);
    if (params?.instance) searchParams.set('instance', params.instance);
    const qs = searchParams.toString();
    const url = qs ? `/usage?${qs}` : '/usage';
    return apiClient.delete<{ deleted?: number }>(url, { timeout: USAGE_TIMEOUT_MS });
  },

  /**
   * 计算密钥成功/失败统计，必要时会先获取 usage 数据
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS });
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  }
};
