import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

import {
  buildAuthStoreUpsertSql,
  dollarQuote,
  generateAuthFilesPgSql,
  quoteIdentifier,
  quoteSqlString,
  quoteQualifiedTable,
} from '../generate-auth-files-pg-sql.mjs';

test('quoteIdentifier escapes double quotes', () => {
  assert.equal(quoteIdentifier('public'), '"public"');
  assert.equal(quoteIdentifier('a"b'), '"a""b"');
});

test('quoteQualifiedTable supports schema and schema-less names', () => {
  assert.equal(quoteQualifiedTable('public', 'auth_store'), '"public"."auth_store"');
  assert.equal(quoteQualifiedTable('', 'auth_store'), '"auth_store"');
  assert.throws(() => quoteQualifiedTable('public', ''));
});

test('quoteSqlString escapes single quotes', () => {
  assert.equal(quoteSqlString("o'b.json"), "'o''b.json'");
});

test('dollarQuote avoids preferred marker collisions', () => {
  const content = '{"x":"$json$"}';
  const wrapped = dollarQuote(content, 'json');
  const m = wrapped.match(/^\$([A-Za-z0-9_]+)\$/);
  assert.ok(m, 'Expected a dollar-quote marker at start');
  const tag = m[1];
  assert.notEqual(tag, 'json', 'Expected tag to differ because content contains $json$');
  assert.ok(wrapped.startsWith(`$${tag}$`));
  assert.ok(wrapped.endsWith(`$${tag}$`));
});

test('buildAuthStoreUpsertSql generates safe upsert SQL', () => {
  const sql = buildAuthStoreUpsertSql({
    schema: 'public',
    table: 'auth_store',
    idColumn: 'id',
    contentColumn: 'content',
    id: "o'b.json",
    jsonText: '{"a":1}',
    upsert: true,
  });

  assert.ok(sql.includes('INSERT INTO "public"."auth_store"'));
  assert.ok(sql.includes("VALUES ('o''b.json',"));
  assert.ok(sql.includes('::jsonb'));
  assert.ok(sql.includes('ON CONFLICT ("id") DO UPDATE'));
  assert.ok(sql.includes('"content" = EXCLUDED."content"'));
  assert.ok(sql.endsWith(';'));
});

test('generateAuthFilesPgSql writes output file for valid inputs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cpa-auth-store-sql-'));
  const inDir = path.join(tempDir, 'in');
  const outFile = path.join(tempDir, 'out.sql');
  await fs.mkdir(inDir, { recursive: true });

  await fs.writeFile(path.join(inDir, 'a.json'), '{"hello":"world"}\n', 'utf8');
  await fs.writeFile(path.join(inDir, 'b.json'), '{"x":"$json$"}\n', 'utf8');

  try {
    const result = await generateAuthFilesPgSql({
      inDir,
      outFile,
      schema: 'public',
      table: 'auth_store',
      transaction: true,
      upsert: true,
      validateJson: true,
      stopOnError: true,
    });

    assert.equal(result.totalFiles, 2);
    assert.equal(result.success, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.wrote, true);

    const sql = await fs.readFile(outFile, 'utf8');
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.ok(sql.includes('INSERT INTO "public"."auth_store"'));
    assert.ok(sql.includes("'a.json'"));
    assert.ok(sql.includes("'b.json'"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('CLI --quiet suppresses failure details to avoid leaking auth file names', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cpa-auth-store-sql-cli-'));
  const inDir = path.join(tempDir, 'in');
  await fs.mkdir(inDir, { recursive: true });

  const failingName = 'user@example.com.json';
  await fs.writeFile(path.join(inDir, failingName), '{not json', 'utf8');

  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate-auth-files-pg-sql.mjs');
    const child = spawn(
      process.execPath,
      [scriptPath, '--in', inDir, '--out', path.join(tempDir, 'out.sql'), '--quiet'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const stdout = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        out += chunk;
      });
      child.stderr.on('data', () => {
        // Intentionally ignore stderr; test focuses on stdout leakage.
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
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

