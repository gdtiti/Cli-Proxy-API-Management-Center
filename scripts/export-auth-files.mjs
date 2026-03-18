import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_KEY_ENV = 'CPA_MANAGEMENT_KEY';
const MANAGEMENT_API_PREFIX = '/v0/management';

const WINDOWS_RESERVED_BASENAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return Boolean(value);
};

const toUrl = (input) => {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('Missing --base');
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`;
  try {
    return new URL(withScheme);
  } catch (error) {
    throw new Error(`Invalid --base: ${raw}`);
  }
};

export const normalizeApiBase = (input) => {
  const url = toUrl(input);
  url.search = '';
  url.hash = '';

  let pathname = url.pathname ?? '/';
  pathname = pathname.replace(/\/+$/g, '');

  if (pathname.toLowerCase().endsWith('/management.html')) {
    pathname = pathname.slice(0, -'/management.html'.length);
  }

  pathname = pathname.replace(/\/?v0\/management\/?$/i, '');
  pathname = pathname.replace(/\/+$/g, '');

  const basePath = pathname && pathname !== '/' ? pathname : '';
  return `${url.origin}${basePath}`;
};

export const computeManagementApiBase = (input) => {
  const normalized = normalizeApiBase(input);
  if (!normalized) return '';
  return `${normalized}${MANAGEMENT_API_PREFIX}`;
};

const hashShort = (text) =>
  crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 12);

export const sanitizeAuthFileName = (name) => {
  const original = String(name ?? '').trim();
  let value = original || `auth-file-${hashShort(String(name))}.json`;

  value = value.replace(/[\u0000-\u001F\u007F]/g, '_');
  value = value.replace(/[\\/]/g, '_');
  value = value.replace(/[:*?"<>|]/g, '_');
  value = value.replace(/\.\./g, '_');
  value = value.replace(/\s+/g, ' ').trim();

  // Windows: no trailing dots/spaces
  value = value.replace(/[. ]+$/g, '');

  // Keep it readable but avoid pathological names
  if (value.length > 180) {
    const ext = path.extname(value);
    const base = value.slice(0, 180 - ext.length);
    value = `${base}${ext || ''}`;
  }

  if (!value || value === '.' || value === '..') {
    value = `auth-file-${hashShort(original)}.json`;
  }

  const ext = path.extname(value);
  const baseName = path.basename(value, ext);
  if (WINDOWS_RESERVED_BASENAMES.has(baseName.toUpperCase())) {
    value = `_${baseName}${ext || ''}`;
  }

  return value;
};

export const resolveOutputPath = (outDir, fileName) => {
  const root = path.resolve(String(outDir ?? ''));
  const candidate = path.resolve(root, String(fileName ?? ''));
  const relative = path.relative(root, candidate);

  // 防路径穿越：永远只允许写入 outDir 之下的普通相对路径。
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe output path resolved: ${candidate}`);
  }

  return candidate;
};

const fileExists = async (filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
};

const safeUnlink = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
};

export const mapWithConcurrency = async (items, concurrency, worker) => {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(concurrency) || DEFAULT_CONCURRENCY);
  const size = Math.min(limit, list.length || 0);
  let cursor = 0;
  const results = new Array(list.length);

  const workers = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;

      try {
        results[index] = await worker(list[index], index);
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  });

  await Promise.all(workers);
  return results;
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const parseAuthFilesList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload;
  if (Array.isArray(record.files)) return record.files;
  if (Array.isArray(record.items)) return record.items;
  return [];
};

export const exportAuthFiles = async ({
  base,
  outDir,
  managementKey,
  keyEnv = DEFAULT_KEY_ENV,
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  includeRuntimeOnly = false,
  skipExisting = false,
  verbose = true,
}) => {
  const apiBase = computeManagementApiBase(base);
  if (!apiBase) throw new Error('Failed to compute management API base from --base');

  const resolvedOutDir = path.resolve(String(outDir ?? ''));
  if (!resolvedOutDir) throw new Error('Missing --out');

  await fs.promises.mkdir(resolvedOutDir, { recursive: true });

  const key = String(managementKey ?? '').trim();
  if (!key) {
    throw new Error(
      `Missing management key. Set env ${keyEnv} or pass --key-env to change env name.`
    );
  }

  const headers = {
    authorization: `Bearer ${key}`,
    accept: 'application/json',
  };

  const listUrl = `${apiBase}/auth-files`;
  const listResponse = await fetchWithTimeout(listUrl, { method: 'GET', headers }, timeoutMs);
  if (!listResponse.ok) {
    const hint = listResponse.status === 401 ? ' (hint: check Authorization key)' : '';
    throw new Error(`List auth files failed: HTTP ${listResponse.status}${hint}`);
  }

  const listJson = await listResponse.json().catch(() => null);
  const files = parseAuthFilesList(listJson);
  const items = files
    .map((item) => (item && typeof item === 'object' ? item : null))
    .filter(Boolean);

  const candidates = items.filter((item) => {
    const runtimeOnly = parseBoolean(item.runtimeOnly);
    if (!includeRuntimeOnly && runtimeOnly) return false;
    return typeof item.name === 'string' && item.name.trim().length > 0;
  });

  const skippedRuntimeOnly = includeRuntimeOnly ? 0 : items.length - candidates.length;

  const downloads = await mapWithConcurrency(candidates, concurrency, async (item, index) => {
    const name = String(item.name);
    const safeName = sanitizeAuthFileName(name);
    const outPath = resolveOutputPath(resolvedOutDir, safeName);

    if (skipExisting && (await fileExists(outPath))) {
      return { ok: true, skipped: true, name, outPath };
    }

    const downloadUrl = `${apiBase}/auth-files/download?name=${encodeURIComponent(name)}`;
    const response = await fetchWithTimeout(downloadUrl, { method: 'GET', headers }, timeoutMs);

    if (!response.ok) {
      const hint = response.status === 401 ? ' (hint: check Authorization key)' : '';
      return { ok: false, name, outPath, error: `HTTP ${response.status}${hint}` };
    }

    const tempPath = `${outPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    try {
      if (!response.body) {
        return { ok: false, name, outPath, error: 'Empty response body' };
      }

      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tempPath));

      // Best-effort overwrite behavior (Windows rename doesn't replace existing files).
      try {
        await fs.promises.rename(tempPath, outPath);
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code || '') : '';
        if (['EEXIST', 'EPERM', 'EACCES'].includes(code)) {
          await safeUnlink(outPath);
          await fs.promises.rename(tempPath, outPath);
        } else {
          throw error;
        }
      }

      if (verbose) {
        const total = candidates.length;
        const prefix = `[${index + 1}/${total}]`;
        process.stdout.write(`${prefix} exported ${name} -> ${safeName}${os.EOL}`);
      }

      // Give event loop a tiny breath for very large batches.
      await sleep(0);
      return { ok: true, skipped: false, name, outPath };
    } catch (error) {
      await safeUnlink(tempPath);
      return { ok: false, name, outPath, error: String(error?.message || error) };
    }
  });

  const success = downloads.filter((r) => r && r.ok && !r.skipped).length;
  const skippedExisting = downloads.filter((r) => r && r.ok && r.skipped).length;
  const failed = downloads.filter((r) => r && !r.ok).length;

  return {
    apiBase,
    outDir: resolvedOutDir,
    totalListed: items.length,
    candidates: candidates.length,
    skippedRuntimeOnly,
    success,
    skippedExisting,
    failed,
    failures: downloads
      .filter((r) => r && !r.ok)
      .map((r) => ({ name: r.name, outPath: r.outPath, error: r.error })),
  };
};

export const parseArgs = (argv) => {
  const args = {
    base: '',
    out: '',
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    includeRuntimeOnly: false,
    skipExisting: false,
    keyEnv: DEFAULT_KEY_ENV,
    verbose: true,
  };

  const list = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < list.length; i += 1) {
    const token = list[i];
    if (!token) continue;

    const next = () => (i + 1 < list.length ? list[i + 1] : undefined);
    const consumeNext = () => {
      const v = next();
      i += 1;
      return v;
    };

    if (token === '--help' || token === '-h') return { ...args, help: true };
    if (token === '--base') args.base = String(consumeNext() ?? '');
    else if (token === '--out') args.out = String(consumeNext() ?? '');
    else if (token === '--concurrency') args.concurrency = Number(consumeNext() ?? DEFAULT_CONCURRENCY);
    else if (token === '--timeout-ms') args.timeoutMs = Number(consumeNext() ?? DEFAULT_TIMEOUT_MS);
    else if (token === '--include-runtime-only') args.includeRuntimeOnly = true;
    else if (token === '--skip-existing') args.skipExisting = true;
    else if (token === '--key-env') args.keyEnv = String(consumeNext() ?? DEFAULT_KEY_ENV);
    else if (token === '--quiet') args.verbose = false;
  }

  return args;
};

const printHelp = () => {
  const lines = [
    'Export CPA auth files to a local directory (one file per auth file).',
    '',
    'Usage:',
    '  node scripts/export-auth-files.mjs --base <host|url|management.html> --out <dir>',
    '',
    'Required:',
    '  --base              e.g. http://127.0.0.1:8317 or http://host/management.html',
    '  --out               output directory',
    '',
    'Options:',
    `  --concurrency       default ${DEFAULT_CONCURRENCY}`,
    `  --timeout-ms        default ${DEFAULT_TIMEOUT_MS}`,
    '  --include-runtime-only',
    '  --skip-existing',
    `  --key-env           default ${DEFAULT_KEY_ENV}`,
    '  --quiet',
  ];
  process.stdout.write(`${lines.join(os.EOL)}${os.EOL}`);
};

export const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return 0;
  }

  const keyEnv = parsed.keyEnv || DEFAULT_KEY_ENV;
  const managementKey = process.env[keyEnv] ?? '';

  const result = await exportAuthFiles({
    base: parsed.base,
    outDir: parsed.out,
    managementKey,
    keyEnv,
    concurrency: parsed.concurrency,
    timeoutMs: parsed.timeoutMs,
    includeRuntimeOnly: parsed.includeRuntimeOnly,
    skipExisting: parsed.skipExisting,
    verbose: parsed.verbose,
  });

  process.stdout.write(
    [
      '',
      'Summary:',
      `  apiBase: ${result.apiBase}`,
      `  outDir: ${result.outDir}`,
      `  listed: ${result.totalListed}`,
      `  candidates: ${result.candidates}`,
      `  success: ${result.success}`,
      `  skippedExisting: ${result.skippedExisting}`,
      `  skippedRuntimeOnly: ${result.skippedRuntimeOnly}`,
      `  failed: ${result.failed}`,
      '',
    ].join(os.EOL)
  );

  if (result.failed > 0) {
    if (!parsed.verbose) {
      process.stdout.write(
        `Failures details suppressed due to --quiet. Re-run without --quiet to show names (first 20).${os.EOL}`
      );
    } else {
      process.stdout.write('Failures (first 20):' + os.EOL);
      result.failures.slice(0, 20).forEach((f) => {
        process.stdout.write(`  - ${f.name}: ${f.error}` + os.EOL);
      });
    }
  }

  return result.failed > 0 ? 2 : 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Fatal: ${String(error?.message || error)}${os.EOL}`);
      process.exitCode = 1;
    });
}
