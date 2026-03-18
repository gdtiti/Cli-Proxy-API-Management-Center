import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import {
  computeManagementApiBase,
  exportAuthFiles,
  mapWithConcurrency,
  normalizeApiBase,
  resolveOutputPath,
  sanitizeAuthFileName,
} from '../export-auth-files.mjs';

test('normalizeApiBase / computeManagementApiBase handles common inputs', () => {
  assert.equal(normalizeApiBase('129.146.34.174:8317'), 'http://129.146.34.174:8317');
  assert.equal(
    computeManagementApiBase('129.146.34.174:8317'),
    'http://129.146.34.174:8317/v0/management'
  );

  assert.equal(
    computeManagementApiBase('http://example.com:8317/management.html'),
    'http://example.com:8317/v0/management'
  );

  assert.equal(
    computeManagementApiBase('http://example.com:8317/v0/management'),
    'http://example.com:8317/v0/management'
  );

  assert.equal(
    computeManagementApiBase('http://example.com:8317/v0/management/'),
    'http://example.com:8317/v0/management'
  );

  assert.equal(
    computeManagementApiBase('http://example.com/prefix/management.html'),
    'http://example.com/prefix/v0/management'
  );
});

test('sanitizeAuthFileName removes path traversal and windows-unfriendly chars', () => {
  const out = sanitizeAuthFileName('../CON<>:"|?.json');
  assert.ok(out.length > 0);
  assert.ok(!out.includes('..'));
  assert.ok(!out.includes('/'));
  assert.ok(!out.includes('\\'));
  assert.ok(!/[<>:"|?*]/.test(out));
  assert.ok(!/[. ]$/.test(out));
  assert.ok(out.toUpperCase() !== 'CON');
  assert.ok(out.toUpperCase() !== 'CON.JSON');
});

test('resolveOutputPath rejects escaping output dir', () => {
  const root = path.join(os.tmpdir(), 'cpa-auth-files-export-root');
  assert.ok(resolveOutputPath(root, 'a.json').endsWith(path.join('cpa-auth-files-export-root', 'a.json')));
  assert.throws(() => resolveOutputPath(root, '../evil.json'));
  assert.throws(() => resolveOutputPath(root, '..\\evil.json'));
  assert.throws(() => resolveOutputPath(root, ''));
});

test('PT-001 lightweight property check: sanitized names always stay within outDir', () => {
  const root = path.join(os.tmpdir(), 'cpa-auth-files-export-root');
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\\\.:*?"<>| \t';

  for (let i = 0; i < 300; i += 1) {
    let raw = '';
    const len = 1 + Math.floor(Math.random() * 50);
    for (let j = 0; j < len; j += 1) raw += chars[Math.floor(Math.random() * chars.length)];

    const safe = sanitizeAuthFileName(raw);
    assert.ok(safe.length > 0);
    assert.ok(!safe.includes('/'));
    assert.ok(!safe.includes('\\'));
    assert.ok(!safe.includes('..'));

    const full = resolveOutputPath(root, safe);
    const relative = path.relative(root, full);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  }
});

test('mapWithConcurrency never exceeds configured limit', async () => {
  let active = 0;
  let maxActive = 0;
  const items = Array.from({ length: 50 }, (_, i) => i);

  await mapWithConcurrency(items, 3, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
    return { ok: true };
  });

  assert.ok(maxActive <= 3);
});

test('exportAuthFiles downloads with Authorization header and defaults to exclude runtimeOnly', async () => {
  const key = 'unit-test-key';
  const files = [
    { name: 'a.json' },
    { name: 'b.json', runtimeOnly: true },
  ];

  const server = http.createServer((req, res) => {
    const auth = String(req.headers.authorization ?? '');
    if (auth !== `Bearer ${key}`) {
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end('unauthorized');
      return;
    }

    if (req.url === '/v0/management/auth-files') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ files }));
      return;
    }

    if (req.url?.startsWith('/v0/management/auth-files/download?name=')) {
      const url = new URL(req.url, 'http://127.0.0.1');
      const name = url.searchParams.get('name');
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(`content:${name}`);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cpa-auth-files-export-'));
  try {
    const result = await exportAuthFiles({
      base,
      outDir: tempDir,
      managementKey: key,
      verbose: false,
    });

    assert.equal(result.totalListed, 2);
    assert.equal(result.candidates, 1);
    assert.equal(result.success, 1);
    assert.equal(result.skippedRuntimeOnly, 1);
    assert.equal(result.failed, 0);

    const aContent = await fs.readFile(path.join(tempDir, 'a.json'), 'utf8');
    assert.equal(aContent, 'content:a.json');
    await assert.rejects(() => fs.readFile(path.join(tempDir, 'b.json'), 'utf8'));
  } finally {
    server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('CLI --quiet suppresses failure details to avoid leaking auth file names', async () => {
  const key = 'unit-test-key';
  const failingName = 'user@example.com.json';
  const files = [{ name: failingName }];

  const server = http.createServer((req, res) => {
    const auth = String(req.headers.authorization ?? '');
    if (auth !== `Bearer ${key}`) {
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end('unauthorized');
      return;
    }

    if (req.url === '/v0/management/auth-files') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ files }));
      return;
    }

    if (req.url?.startsWith('/v0/management/auth-files/download?name=')) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('boom');
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cpa-auth-files-export-cli-'));
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'export-auth-files.mjs');

    const child = spawn(
      process.execPath,
      [
        scriptPath,
        '--base',
        base,
        '--out',
        tempDir,
        '--concurrency',
        '1',
        '--timeout-ms',
        '15000',
        '--quiet',
      ],
      {
        env: { ...process.env, CPA_MANAGEMENT_KEY: key },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const stdout = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        out += chunk;
      });
      child.stderr.on('data', () => {
        // Intentionally ignore stderr content; test focuses on stdout leakage.
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ out, code }));
    });

    assert.equal(stdout.code, 2);
    assert.ok(stdout.out.includes('Summary:'), 'Expected summary output');
    assert.ok(stdout.out.includes('failed: 1'), 'Expected failed count');
    assert.ok(
      !stdout.out.includes(failingName),
      'Expected --quiet to suppress failure name details in stdout'
    );
    assert.ok(
      stdout.out.includes('Failures details suppressed due to --quiet.'),
      'Expected suppression hint in stdout'
    );
  } finally {
    server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
