/**
 * Kiro 账号导入相关类型定义
 */

/**
 * Kiro 导出文件中的凭证信息（多账号格式）
 */
export interface KiroCredentials {
  accessToken: string;
  authMethod: 'IdC' | 'BuilderId' | 'IAM' | string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  expiresAt: number; // Unix 时间戳（毫秒）
  region?: string;
}

/**
 * Kiro 导出文件中的单个账户（多账号格式）
 */
export interface KiroExportAccount {
  email: string;
  status: string;
  credentials: KiroCredentials;
}

/**
 * Kiro 导出文件格式（多账号格式）
 */
export interface KiroExportFile {
  accounts: KiroExportAccount[];
}

/**
 * Kiro 单账号导出格式 (kiro-account-*.json)
 * 直接包含凭证字段，不嵌套在 accounts 数组中
 */
export interface KiroSingleAccountFile {
  version?: string;
  exportedAt?: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  expiresAt: string; // 格式: "2026/01/08 10:52:06"
  provider: string; // "BuilderId" | "IdC" | "IAM"
  region: string;
  machineId?: string; // 可选的机器码
}

/**
 * 转换后的 CliProxy 凭证格式
 */
export interface KiroCliProxyCredential {
  type: 'kiro';
  provider: 'AWS';
  email: string;
  access_token: string;
  auth_method: 'builder-id' | 'iam';
  client_id: string;
  client_secret: string;
  refresh_token: string;
  expires_at: string; // ISO 8601 格式
  last_refresh: string; // ISO 8601 格式
  machine_id: string; // UUID v4
  region: string;
}

/**
 * 预览项状态
 */
export type KiroPreviewStatus = 'pending' | 'success' | 'error' | 'skipped';

/**
 * 预览项（包含原始数据和转换结果）
 */
export interface KiroPreviewItem {
  id: string;
  original: KiroExportAccount;
  converted: KiroCliProxyCredential;
  selected: boolean;
  status: KiroPreviewStatus;
  errorMessage?: string;
}

/**
 * 导入结果统计
 */
export interface KiroImportResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

/**
 * 验证结果
 */
export interface KiroValidationResult {
  valid: boolean;
  data?: KiroExportFile;
  errors: string[];
  warnings: string[];
}
