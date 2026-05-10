/**
 * Quota cache that survives route switches.
 */

import { create } from 'zustand';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  KiroQuotaState,
  KimiQuotaState,
} from '@/types';

type QuotaUpdater<T> = T | ((prev: T) => T);

interface QuotaStoreState {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kiroQuota: Record<string, KiroQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setGeminiCliQuota: (updater: QuotaUpdater<Record<string, GeminiCliQuotaState>>) => void;
  setKiroQuota: (updater: QuotaUpdater<Record<string, KiroQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  clearQuotaCache: () => void;
}

const quotaValueEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const equalQuotaRecord = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => quotaValueEqual(leftRecord[key], rightRecord[key]));
};

const resolveUpdater = <T>(updater: QuotaUpdater<T>, prev: T): T => {
  const next =
    typeof updater === 'function' ? (updater as (value: T) => T)(prev) : updater;
  return equalQuotaRecord(prev, next) ? prev : next;
};

export const useQuotaStore = create<QuotaStoreState>((set) => ({
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  geminiCliQuota: {},
  kiroQuota: {},
  kimiQuota: {},
  setAntigravityQuota: (updater) =>
    set((state) => {
      const next = resolveUpdater(updater, state.antigravityQuota);
      return Object.is(next, state.antigravityQuota) ? state : { antigravityQuota: next };
    }),
  setClaudeQuota: (updater) =>
    set((state) => {
      const next = resolveUpdater(updater, state.claudeQuota);
      return Object.is(next, state.claudeQuota) ? state : { claudeQuota: next };
    }),
  setCodexQuota: (updater) =>
    set((state) => {
      const next = resolveUpdater(updater, state.codexQuota);
      return Object.is(next, state.codexQuota) ? state : { codexQuota: next };
    }),
  setGeminiCliQuota: (updater) =>
    set((state) => {
      const next = resolveUpdater(updater, state.geminiCliQuota);
      return Object.is(next, state.geminiCliQuota) ? state : { geminiCliQuota: next };
    }),
  setKiroQuota: (updater) =>
    set((state) => {
      const next = resolveUpdater(updater, state.kiroQuota);
      return Object.is(next, state.kiroQuota) ? state : { kiroQuota: next };
    }),
  setKimiQuota: (updater) =>
    set((state) => {
      const next = resolveUpdater(updater, state.kimiQuota);
      return Object.is(next, state.kimiQuota) ? state : { kimiQuota: next };
    }),
  clearQuotaCache: () =>
    set({
      antigravityQuota: {},
      claudeQuota: {},
      codexQuota: {},
      geminiCliQuota: {},
      kiroQuota: {},
      kimiQuota: {},
    }),
}));
