/**
 * Kiro 导出文件验证逻辑
 */

import type {
  KiroExportAccount,
  KiroValidationResult,
} from '@/types/kiro';

/**
 * 验证单个 Kiro 账户
 */
function validateAccount(
  account: unknown,
  index: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!account || typeof account !== 'object') {
    errors.push(`账户 #${index + 1}: 无效的账户数据`);
    return { valid: false, errors, warnings };
  }

  const acc = account as Record<string, unknown>;

  // 验证 email
  if (!acc.email || typeof acc.email !== 'string') {
    errors.push(`账户 #${index + 1}: 缺少 email 字段`);
  } else if (!acc.email.includes('@')) {
    errors.push(`账户 #${index + 1}: email 格式无效`);
  }

  // 验证 status
  if (acc.status !== 'active') {
    warnings.push(`账户 #${index + 1} (${acc.email || 'unknown'}): 状态不是 active，将被跳过`);
  }

  // 验证 credentials
  if (!acc.credentials || typeof acc.credentials !== 'object') {
    errors.push(`账户 #${index + 1}: 缺少 credentials 对象`);
    return { valid: errors.length === 0, errors, warnings };
  }

  const creds = acc.credentials as Record<string, unknown>;

  // 验证必需的凭证字段
  if (!creds.accessToken || typeof creds.accessToken !== 'string') {
    errors.push(`账户 #${index + 1}: 缺少 accessToken`);
  }

  if (!creds.refreshToken || typeof creds.refreshToken !== 'string') {
    errors.push(`账户 #${index + 1}: 缺少 refreshToken`);
  } else if (creds.refreshToken.length < 10) {
    warnings.push(`账户 #${index + 1}: refreshToken 长度过短`);
  }

  if (!creds.clientId || typeof creds.clientId !== 'string') {
    errors.push(`账户 #${index + 1}: 缺少 clientId`);
  }

  if (!creds.clientSecret || typeof creds.clientSecret !== 'string') {
    errors.push(`账户 #${index + 1}: 缺少 clientSecret`);
  }

  // 验证 authMethod
  const validAuthMethods = ['IdC', 'BuilderId', 'IAM'];
  if (!creds.authMethod || typeof creds.authMethod !== 'string') {
    warnings.push(`账户 #${index + 1}: 缺少 authMethod，将使用默认值`);
  } else if (!validAuthMethods.includes(creds.authMethod)) {
    warnings.push(`账户 #${index + 1}: 未知的 authMethod "${creds.authMethod}"，将映射为 builder-id`);
  }

  // 验证 expiresAt
  if (typeof creds.expiresAt !== 'number') {
    warnings.push(`账户 #${index + 1}: 缺少 expiresAt 时间戳`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 验证 Kiro 导出文件
 */
export function validateKiroFile(content: string): KiroValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 解析 JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      valid: false,
      errors: ['无效的 JSON 格式'],
      warnings: [],
    };
  }

  // 验证根对象
  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      errors: ['文件内容必须是一个对象'],
      warnings: [],
    };
  }

  const data = parsed as Record<string, unknown>;

  // 验证 accounts 数组
  if (!Array.isArray(data.accounts)) {
    return {
      valid: false,
      errors: ['文件必须包含 accounts 数组'],
      warnings: [],
    };
  }

  if (data.accounts.length === 0) {
    return {
      valid: false,
      errors: ['accounts 数组为空'],
      warnings: [],
    };
  }

  // 验证每个账户
  const validAccounts: KiroExportAccount[] = [];
  const seenEmails = new Set<string>();

  for (let i = 0; i < data.accounts.length; i++) {
    const account = data.accounts[i];
    const result = validateAccount(account, i);

    errors.push(...result.errors);
    warnings.push(...result.warnings);

    if (result.valid) {
      const acc = account as KiroExportAccount;

      // 检查重复 email
      if (seenEmails.has(acc.email)) {
        warnings.push(`账户 #${i + 1}: email "${acc.email}" 重复`);
      } else {
        seenEmails.add(acc.email);
      }

      validAccounts.push(acc);
    }
  }

  if (validAccounts.length === 0) {
    return {
      valid: false,
      errors: [...errors, '没有有效的账户可以导入'],
      warnings,
    };
  }

  return {
    valid: true,
    data: { accounts: validAccounts },
    errors,
    warnings,
  };
}

/**
 * 检测文件名是否符合 Kiro 导出格式
 */
export function isKiroFileName(fileName: string): boolean {
  // Kiro 导出文件通常命名为 kiro-accounts-*.json 或类似格式
  const patterns = [
    /^kiro[-_]?accounts/i,
    /^kiro[-_]?export/i,
    /^accounts[-_]?kiro/i,
  ];
  return patterns.some((pattern) => pattern.test(fileName));
}
