/**
 * Antigravity 导出文件验证逻辑
 */

import type {
  AntigravityExportFile,
  AntigravityExportAccount,
  ValidationResult,
} from '@/types/antigravity';

/**
 * 验证单个账户数据
 */
function validateAccount(
  account: unknown,
  index: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!account || typeof account !== 'object') {
    errors.push(`Item ${index + 1}: Invalid format, expected object`);
    return { valid: false, errors, warnings };
  }

  const acc = account as Record<string, unknown>;

  if (!acc.email || typeof acc.email !== 'string') {
    errors.push(`Item ${index + 1}: Missing or invalid "email" field`);
  } else if (!acc.email.includes('@')) {
    warnings.push(`Item ${index + 1}: Email "${acc.email}" may be invalid`);
  }

  if (!acc.refresh_token || typeof acc.refresh_token !== 'string') {
    errors.push(`Item ${index + 1}: Missing or invalid "refresh_token" field`);
  } else if (acc.refresh_token.length < 10) {
    warnings.push(`Item ${index + 1}: refresh_token seems too short`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 验证 Antigravity 导出文件
 */
export function validateAntigravityFile(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 尝试解析 JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return {
      valid: false,
      errors: [
        'Invalid JSON format: ' +
          (e instanceof Error ? e.message : 'Parse error'),
      ],
      warnings: [],
    };
  }

  // 检查是否为数组
  if (!Array.isArray(parsed)) {
    return {
      valid: false,
      errors: ['Expected JSON array, got ' + typeof parsed],
      warnings: [],
    };
  }

  // 检查是否为空
  if (parsed.length === 0) {
    return {
      valid: false,
      errors: ['File contains no accounts'],
      warnings: [],
    };
  }

  // 验证每个账户
  const validAccounts: AntigravityExportAccount[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const result = validateAccount(parsed[i], i);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (result.valid) {
      validAccounts.push(parsed[i] as AntigravityExportAccount);
    }
  }

  // 检查重复 email
  const emails = validAccounts.map((a) => a.email.toLowerCase());
  const duplicates = emails.filter((e, i) => emails.indexOf(e) !== i);
  if (duplicates.length > 0) {
    warnings.push(
      `Duplicate emails found: ${[...new Set(duplicates)].join(', ')}`
    );
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? validAccounts : undefined,
    errors,
    warnings,
  };
}

/**
 * 检测文件名是否符合 Antigravity 导出格式
 */
export function isAntigravityFileName(fileName: string): boolean {
  // 匹配 antigravity_accounts_YYYY-MM-DD.json 格式
  const pattern = /^antigravity_accounts_\d{4}-\d{2}-\d{2}\.json$/i;
  return pattern.test(fileName);
}
