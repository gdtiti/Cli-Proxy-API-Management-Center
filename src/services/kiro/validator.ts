/**
 * Kiro 导出文件验证逻辑
 */

import type {
  KiroExportAccount,
  KiroValidationResult,
  KiroSingleAccountFile,
} from '@/types/kiro';

/**
 * 验证单个 Kiro 账户（多账号格式）
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

  // 验证 email（允许为空，Enterprise 账户可能没有 email）
  if (acc.email && typeof acc.email === 'string' && acc.email.trim() && !acc.email.includes('@')) {
    errors.push(`账户 #${index + 1}: email 格式无效`);
  }
  
  // 如果没有 email，检查是否有其他标识符
  if (!acc.email || (typeof acc.email === 'string' && !acc.email.trim())) {
    if (!acc.nickname && !acc.userId) {
      errors.push(`账户 #${index + 1}: 缺少 email、nickname 或 userId 标识`);
    }
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
 * 检测是否为单账号格式 (kiro-account-*.json)
 */
function isSingleAccountFormat(data: Record<string, unknown>): boolean {
  // 单账号格式直接包含这些字段
  return (
    typeof data.accessToken === 'string' &&
    typeof data.refreshToken === 'string' &&
    typeof data.clientId === 'string' &&
    typeof data.clientSecret === 'string' &&
    typeof data.provider === 'string'
  );
}

/**
 * 验证单账号格式文件
 */
function validateSingleAccountFile(
  data: Record<string, unknown>
): { valid: boolean; errors: string[]; warnings: string[]; singleAccount?: KiroSingleAccountFile } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证必需字段
  if (!data.accessToken || typeof data.accessToken !== 'string') {
    errors.push('缺少 accessToken 字段');
  }

  if (!data.refreshToken || typeof data.refreshToken !== 'string') {
    errors.push('缺少 refreshToken 字段');
  } else if ((data.refreshToken as string).length < 10) {
    warnings.push('refreshToken 长度过短');
  }

  if (!data.clientId || typeof data.clientId !== 'string') {
    errors.push('缺少 clientId 字段');
  }

  if (!data.clientSecret || typeof data.clientSecret !== 'string') {
    errors.push('缺少 clientSecret 字段');
  }

  if (!data.provider || typeof data.provider !== 'string') {
    errors.push('缺少 provider 字段');
  } else {
    const validProviders = ['IdC', 'BuilderId', 'IAM'];
    if (!validProviders.includes(data.provider as string)) {
      warnings.push(`未知的 provider "${data.provider}"，将映射为 builder-id`);
    }
  }

  if (!data.expiresAt || typeof data.expiresAt !== 'string') {
    warnings.push('缺少 expiresAt 字段');
  }

  if (!data.region || typeof data.region !== 'string') {
    warnings.push('缺少 region 字段，将使用默认值 us-east-1');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    errors,
    warnings,
    singleAccount: data as unknown as KiroSingleAccountFile,
  };
}

/**
 * 将单账号格式转换为多账号格式
 */
function convertSingleToMultiFormat(
  singleAccount: KiroSingleAccountFile,
  fileName: string
): KiroExportAccount {
  // 解析 expiresAt 字符串为时间戳
  // 格式: "2026/01/08 10:52:06"
  let expiresAtTimestamp: number;
  try {
    const dateStr = singleAccount.expiresAt.replace(/\//g, '-');
    expiresAtTimestamp = new Date(dateStr).getTime();
    if (isNaN(expiresAtTimestamp)) {
      expiresAtTimestamp = Date.now() + 3600000; // 默认 1 小时后
    }
  } catch {
    expiresAtTimestamp = Date.now() + 3600000;
  }

  // 从文件名提取 email 或生成一个
  // 文件名格式: kiro-account-1767837125291.json
  const timestamp = fileName.match(/kiro-account-(\d+)\.json/i)?.[1] || Date.now().toString();
  const email = `kiro-${timestamp}@imported.local`;

  return {
    email,
    status: 'active',
    credentials: {
      accessToken: singleAccount.accessToken,
      refreshToken: singleAccount.refreshToken,
      clientId: singleAccount.clientId,
      clientSecret: singleAccount.clientSecret,
      authMethod: singleAccount.provider,
      expiresAt: expiresAtTimestamp,
      region: singleAccount.region || 'us-east-1',
      // 保留机器码信息
      machineId: singleAccount.machineId,
    } as KiroSingleAccountFile['machineId'] extends string
      ? KiroExportAccount['credentials'] & { machineId?: string }
      : KiroExportAccount['credentials'],
  };
}

/**
 * 验证 Kiro 导出文件（支持多账号和单账号两种格式）
 */
export function validateKiroFile(content: string, fileName?: string): KiroValidationResult {
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

  // 检测文件格式
  if (isSingleAccountFormat(data)) {
    // 单账号格式 (kiro-account-*.json)
    const result = validateSingleAccountFile(data);
    if (!result.valid) {
      return {
        valid: false,
        errors: result.errors,
        warnings: result.warnings,
      };
    }

    // 转换为多账号格式
    const account = convertSingleToMultiFormat(
      result.singleAccount!,
      fileName || 'kiro-account.json'
    );

    // 保存原始机器码到 account 中以便后续使用
    (account as KiroExportAccount & { _machineId?: string })._machineId = data.machineId as string | undefined;

    return {
      valid: true,
      data: { accounts: [account] },
      errors: [],
      warnings: [...result.warnings, '检测到单账号格式，已自动转换'],
    };
  }

  // 多账号格式 - 验证 accounts 数组
  if (!Array.isArray(data.accounts)) {
    return {
      valid: false,
      errors: ['文件必须包含 accounts 数组，或者是单账号格式（包含 accessToken、refreshToken 等字段）'],
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
  // Kiro 导出文件通常命名为:
  // - kiro-accounts-*.json (多账号格式)
  // - kiro-account-*.json (单账号格式)
  // - kiro-export-*.json
  const patterns = [
    /^kiro[-_]?accounts?/i,
    /^kiro[-_]?export/i,
    /^accounts[-_]?kiro/i,
  ];
  return patterns.some((pattern) => pattern.test(fileName));
}
