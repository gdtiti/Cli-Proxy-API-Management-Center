/**
 * Antigravity 凭证转换相关类型定义
 */

/**
 * Antigravity 导出文件中的单个账户格式
 */
export interface AntigravityExportAccount {
  email: string;
  refresh_token: string;
}

/**
 * Antigravity 导出文件格式（JSON 数组）
 */
export type AntigravityExportFile = AntigravityExportAccount[];

/**
 * 转换后的 CliProxy 凭证格式
 */
export interface CliProxyCredential {
  name: string;
  type: 'antigravity';
  provider: 'antigravity';
  auth_index: string;
  disabled: boolean;
}

/**
 * 预览项（包含原始数据和转换结果）
 */
export interface AntigravityPreviewItem {
  id: string;
  original: AntigravityExportAccount;
  converted: CliProxyCredential;
  selected: boolean;
  status: 'pending' | 'success' | 'error' | 'skipped';
  errorMessage?: string;
}

/**
 * 导入结果统计
 */
export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  data?: AntigravityExportFile;
  errors: string[];
  warnings: string[];
}
