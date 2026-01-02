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
 * 注意：后端期望 refresh_token 在根级别，而不是 auth_index
 */
export interface CliProxyCredential {
  type: 'antigravity';
  email: string;
  refresh_token: string;
  access_token: string;
  expires_in: number;
  timestamp: number;
  expired: string | null;
  project_id: string;
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
