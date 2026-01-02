/**
 * Kiro 凭证转换逻辑
 */

import type {
  KiroExportAccount,
  KiroExportFile,
  KiroCliProxyCredential,
  KiroPreviewItem,
} from '@/types/kiro';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * 生成 UUID v4
 */
function generateUUID(): string {
  // 使用 crypto.randomUUID() 如果可用，否则使用 polyfill
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Polyfill for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 认证方法映射
 */
function mapAuthMethod(authMethod: string): 'builder-id' | 'iam' {
  const mapping: Record<string, 'builder-id' | 'iam'> = {
    IdC: 'builder-id',
    BuilderId: 'builder-id',
    IAM: 'iam',
  };
  return mapping[authMethod] || 'builder-id';
}

/**
 * 格式化时间戳为 ISO 8601 格式（带时区）
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}:${minutes}`;
}

/**
 * 邮箱转安全文件名
 */
function emailToFilename(email: string): string {
  return email.replace(/@/g, '_').replace(/\./g, '_');
}

/**
 * 将单个 Kiro 账户转换为 CliProxy 凭证格式
 */
export function convertKiroAccount(
  account: KiroExportAccount
): KiroCliProxyCredential {
  const { email, credentials } = account;
  const expiresAt = credentials.expiresAt || Date.now() + 3600000;
  const lastRefresh = expiresAt - 60 * 60 * 1000; // 减去 1 小时

  return {
    type: 'kiro',
    provider: 'AWS',
    email: email.trim(),
    access_token: credentials.accessToken || '',
    auth_method: mapAuthMethod(credentials.authMethod),
    client_id: credentials.clientId || '',
    client_secret: credentials.clientSecret || '',
    refresh_token: credentials.refreshToken || '',
    expires_at: formatTimestamp(expiresAt),
    last_refresh: formatTimestamp(lastRefresh),
    machine_id: generateUUID(),
    region: credentials.region || 'us-east-1',
  };
}

/**
 * 批量转换 Kiro 导出文件
 * 只转换 status 为 active 的账户
 */
export function convertKiroFile(data: KiroExportFile): KiroPreviewItem[] {
  return data.accounts
    .filter((account) => account.status === 'active')
    .map((account) => ({
      id: generateId(),
      original: account,
      converted: convertKiroAccount(account),
      selected: true,
      status: 'pending' as const,
    }));
}

/**
 * 生成单个凭证的 JSON 文件内容
 */
export function generateCredentialJson(
  credential: KiroCliProxyCredential
): string {
  return JSON.stringify(credential, null, 2);
}

/**
 * 生成凭证文件名
 * 格式: kiro-aws-<email_safe>.json
 */
export function generateCredentialFileName(
  credential: KiroCliProxyCredential
): string {
  const safeEmail = emailToFilename(credential.email);
  return `kiro-aws-${safeEmail}.json`;
}

/**
 * 下载单个文件
 */
function downloadFile(
  content: string,
  fileName: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 批量下载凭证文件
 */
export async function downloadCredentials(
  items: KiroPreviewItem[]
): Promise<void> {
  const selectedItems = items.filter((item) => item.selected);

  for (const item of selectedItems) {
    const content = generateCredentialJson(item.converted);
    const fileName = generateCredentialFileName(item.converted);
    downloadFile(content, fileName, 'application/json');
    // 添加小延迟避免浏览器阻止多个下载
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * 创建可上传的 File 对象
 */
export function createUploadFile(item: KiroPreviewItem): File {
  const content = generateCredentialJson(item.converted);
  const fileName = generateCredentialFileName(item.converted);
  const blob = new Blob([content], { type: 'application/json' });
  return new File([blob], fileName, { type: 'application/json' });
}
