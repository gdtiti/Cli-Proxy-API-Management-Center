/**
 * Antigravity 凭证转换逻辑
 */

import type {
  AntigravityExportAccount,
  AntigravityExportFile,
  CliProxyCredential,
  AntigravityPreviewItem,
} from '@/types/antigravity';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * 将单个 Antigravity 账户转换为 CliProxy 凭证格式
 */
export function convertAntigravityAccount(
  account: AntigravityExportAccount
): CliProxyCredential {
  const email = account.email?.trim() || '';
  const refreshToken = account.refresh_token?.trim() || '';

  return {
    name: `antigravity_${email}`,
    type: 'antigravity',
    provider: 'antigravity',
    auth_index: refreshToken,
    disabled: false,
  };
}

/**
 * 批量转换 Antigravity 导出文件
 */
export function convertAntigravityFile(
  data: AntigravityExportFile
): AntigravityPreviewItem[] {
  return data.map((account) => ({
    id: generateId(),
    original: account,
    converted: convertAntigravityAccount(account),
    selected: true,
    status: 'pending' as const,
  }));
}

/**
 * 生成单个凭证的 JSON 文件内容
 */
export function generateCredentialJson(credential: CliProxyCredential): string {
  return JSON.stringify(credential, null, 2);
}

/**
 * 生成凭证文件名
 */
export function generateCredentialFileName(
  credential: CliProxyCredential
): string {
  // 从 name 中提取，移除特殊字符
  const safeName = credential.name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_');
  return `${safeName}.json`;
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
  items: AntigravityPreviewItem[]
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
export function createUploadFile(item: AntigravityPreviewItem): File {
  const content = generateCredentialJson(item.converted);
  const fileName = generateCredentialFileName(item.converted);
  const blob = new Blob([content], { type: 'application/json' });
  return new File([blob], fileName, { type: 'application/json' });
}
