/**
 * Quota management types.
 */

export interface AntigravityQuotaGroup {
  id: string;
  label: string;
  models: string[];
  remainingFraction: number;
  resetTime?: string;
}

export interface AntigravityQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  groups: AntigravityQuotaGroup[];
  error?: string;
  errorStatus?: number;
}

export interface GeminiCliQuotaBucketState {
  id: string;
  label: string;
  remainingFraction: number | null;
  remainingAmount: number | null;
  resetTime: string | undefined;
  tokenType: string | null;
  modelIds?: string[];
}

export interface GeminiCliQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  buckets: GeminiCliQuotaBucketState[];
  error?: string;
  errorStatus?: number;
}

export interface CodexQuotaWindow {
  id: string;
  label: string;
  usedPercent: number | null;
  resetLabel: string;
}

export interface CodexQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  windows: CodexQuotaWindow[];
  planType?: string | null;
  error?: string;
  errorStatus?: number;
}

export interface KiroBonusUsage {
  code: string;
  name: string;
  current: number;
  limit: number;
  expiresAt?: string;
}

export interface KiroQuotaDetail {
  id: string;
  label: string;
  current: number;
  limit: number;
  percentUsed: number;
  expiresAt?: string;
}

export interface KiroQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  totalCurrent: number;
  totalLimit: number;
  totalPercentUsed: number;
  baseLimit?: number;
  baseCurrent?: number;
  freeTrialLimit?: number;
  freeTrialCurrent?: number;
  freeTrialExpiry?: string;
  bonuses?: KiroBonusUsage[];
  details: KiroQuotaDetail[];
  lastUpdated?: number;
  nextResetDate?: string;
  error?: string;
  errorStatus?: number;
}
