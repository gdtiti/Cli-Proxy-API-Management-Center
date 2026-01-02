/**
 * Kiro 账号导入相关类型定义
 */

/**
 * Kiro 导出文件中的凭证信息
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
 * Kiro 导出文件中的单个账户
 */
export interface KiroExportAccount {
  email: string;
  status: string;
  credentials: KiroCredentials;
}

/**
 * Kiro 导出文件格式
 */
export interface KiroExportFile {
  accounts: KiroExportAccount[];
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
