import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_SCHEMA = 'public';
const DEFAULT_TABLE = 'auth_store';
const DEFAULT_ID_COLUMN = 'id';
const DEFAULT_CONTENT_COLUMN = 'content';

const safeUnlink = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
};

const ensureDirExists = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

export const quoteIdentifier = (identifier) => {
  const value = String(identifier ?? '');
  return `"${value.replaceAll('"', '""')}"`;
};

export const quoteQualifiedTable = (schema, table) => {
  const trimmedSchema = String(schema ?? '').trim();
  const trimmedTable = String(table ?? '').trim();
  if (!trimmedTable) throw new Error('Missing table name');
  if (!trimmedSchema) return quoteIdentifier(trimmedTable);
  return `${quoteIdentifier(trimmedSchema)}.${quoteIdentifier(trimmedTable)}`;
};

export const quoteSqlString = (value) => {
  const text = String(value ?? '');
  return `'${text.replaceAll("'", "''")}'`;
};

export const chooseDollarQuoteTag = (content, preferredTag = 'json') => {
  const text = String(content ?? '');
  const base = String(preferredTag ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '');
  const seed = base || 'q';

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${crypto.randomBytes(4).toString('hex')}`;
    const tag = `${seed}${suffix}`;
    const marker = `$${tag}$`;
    if (!text.includes(marker)) return tag;
  }

  throw new Error('Unable to choose a safe dollar-quote tag');
};

export const dollarQuote = (content, preferredTag = 'json') => {
  const text = String(content ?? '');
  const tag = chooseDollarQuoteTag(text, preferredTag);
  const marker = `$${tag}$`;
  return `${marker}${text}${marker}`;
};

export const buildAuthStoreUpsertSql = ({
  schema = DEFAULT_SCHEMA,
  table = DEFAULT_TABLE,
  idColumn = DEFAULT_ID_COLUMN,
  contentColumn = DEFAULT_CONTENT_COLUMN,
  id,
  jsonText,
  upsert = true,
  nowExpression = 'NOW()',
}) => {
  const tableName = quoteQualifiedTable(schema, table);
  const idCol = quoteIdentifier(idColumn);
  const contentCol = quoteIdentifier(contentColumn);
  const createdAtCol = quoteIdentifier('created_at');
  const updatedAtCol = quoteIdentifier('updated_at');

  const idLiteral = quoteSqlString(id);
  const jsonLiteral = `${dollarQuote(jsonText, 'json')}::jsonb`;

  let sql = `INSERT INTO ${tableName} (${idCol}, ${contentCol}, ${createdAtCol}, ${updatedAtCol}) VALUES (${idLiteral}, ${jsonLiteral}, ${nowExpression}, ${nowExpression})`;
  if (upsert) {
    sql += ` ON CONFLICT (${idCol}) DO UPDATE SET ${contentCol} = EXCLUDED.${contentCol}, ${updatedAtCol} = ${nowExpression}`;
  }
  sql += ';';
  return sql;
};

const stripUtf8Bom = (text) => {
  if (typeof text !== 'string') return '';
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
};

const listJsonFiles = async (inDir) => {
  const entries = await fs.promises.readdir(inDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const writeChunk = async (stream, chunk) => {
  if (stream.write(chunk, 'utf8')) return;
  await new Promise((resolve, reject) => {
    stream.once('drain', resolve);
    stream.once('error', reject);
  });
};

const finishStream = async (stream) => {
  await new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
};

const safeRenameOverwriting = async (from, to) => {
  try {
    await fs.promises.rename(from, to);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code || '') : '';
    if (['EEXIST', 'EPERM', 'EACCES'].includes(code)) {
      await safeUnlink(to);
      await fs.promises.rename(from, to);
      return;
    }
    throw error;
  }
};

export const generateAuthFilesPgSql = async ({
  inDir,
  outFile,
  schema = DEFAULT_SCHEMA,
  table = DEFAULT_TABLE,
  idColumn = DEFAULT_ID_COLUMN,
  contentColumn = DEFAULT_CONTENT_COLUMN,
  transaction = true,
  upsert = true,
  validateJson = true,
  stopOnError = true,
}) => {
  const resolvedInDir = path.resolve(String(inDir ?? ''));
  if (!resolvedInDir) throw new Error('Missing --in');

  const stat = await fs.promises.stat(resolvedInDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Input directory not found: ${resolvedInDir}`);
  }

  const resolvedOut = path.resolve(
    String(outFile ?? '') || path.join(resolvedInDir, 'import-auth-store.sql')
  );
  if (!resolvedOut) throw new Error('Missing --out');

  await ensureDirExists(path.dirname(resolvedOut));

  const files = await listJsonFiles(resolvedInDir);
  const failures = [];

  const tempPath = `${resolvedOut}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

  let success = 0;
  let failed = 0;
  let wrote = false;

  const stream = fs.createWriteStream(tempPath, { encoding: 'utf8' });
  try {
    const headerLines = [
      '-- Generated by scripts/generate-auth-files-pg-sql.mjs',
      `-- Generated at: ${new Date().toISOString()}`,
      `-- Input dir: ${resolvedInDir}`,
      `-- Target table: ${quoteQualifiedTable(schema, table)}`,
      '-- WARNING: This file contains sensitive auth data.',
      '',
    ];
    await writeChunk(stream, headerLines.join(os.EOL) + os.EOL);

    if (transaction) {
      await writeChunk(stream, `BEGIN;${os.EOL}`);
    }

    for (const fileName of files) {
      const fullPath = path.join(resolvedInDir, fileName);
      try {
        const raw = await fs.promises.readFile(fullPath, 'utf8');
        const jsonText = stripUtf8Bom(raw).trim();
        if (!jsonText) throw new Error('Empty file');

        if (validateJson) {
          JSON.parse(jsonText);
        }

        const sql = buildAuthStoreUpsertSql({
          schema,
          table,
          idColumn,
          contentColumn,
          id: fileName,
          jsonText,
          upsert,
        });
        await writeChunk(stream, sql + os.EOL);
        success += 1;
      } catch (error) {
        failed += 1;
        failures.push({ name: fileName, error: String(error?.message || error) });
        if (stopOnError) break;
      }
    }

    if (failed === 0 && transaction) {
      await writeChunk(stream, `COMMIT;${os.EOL}`);
    } else if (failed === 0 && !transaction) {
      await writeChunk(stream, os.EOL);
    }

    await finishStream(stream);

    if (failed > 0) {
      await safeUnlink(tempPath);
      wrote = false;
    } else {
      await safeRenameOverwriting(tempPath, resolvedOut);
      wrote = true;
    }
  } catch (error) {
    stream.destroy();
    await safeUnlink(tempPath);
    throw error;
  }

  return {
    inDir: resolvedInDir,
    outFile: resolvedOut,
    totalFiles: files.length,
    success,
    failed,
    failures,
    wrote,
    schema,
    table,
    idColumn,
    contentColumn,
    transaction,
    upsert,
    validateJson,
    stopOnError,
  };
};

export const parseArgs = (argv) => {
  const args = {
    in: '',
    out: '',
    schema: DEFAULT_SCHEMA,
    table: DEFAULT_TABLE,
    idColumn: DEFAULT_ID_COLUMN,
    contentColumn: DEFAULT_CONTENT_COLUMN,
    transaction: true,
    upsert: true,
    validateJson: true,
    stopOnError: true,
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
    if (token === '--in') args.in = String(consumeNext() ?? '');
    else if (token === '--out') args.out = String(consumeNext() ?? '');
    else if (token === '--schema') args.schema = String(consumeNext() ?? DEFAULT_SCHEMA);
    else if (token === '--table') args.table = String(consumeNext() ?? DEFAULT_TABLE);
    else if (token === '--id-column') args.idColumn = String(consumeNext() ?? DEFAULT_ID_COLUMN);
    else if (token === '--content-column') args.contentColumn = String(consumeNext() ?? DEFAULT_CONTENT_COLUMN);
    else if (token === '--no-transaction') args.transaction = false;
    else if (token === '--no-upsert') args.upsert = false;
    else if (token === '--no-validate-json') args.validateJson = false;
    else if (token === '--continue-on-error') args.stopOnError = false;
    else if (token === '--quiet') args.verbose = false;
  }

  return args;
};

const printHelp = () => {
  const lines = [
    'Generate a PostgreSQL SQL file to import CPA auth files into auth_store.',
    '',
    'Usage:',
    '  node scripts/generate-auth-files-pg-sql.mjs --in <dir> [--out <file>]',
    '',
    'Required:',
    '  --in                directory containing exported *.json auth files',
    '',
    'Options:',
    `  --out               default <in>/import-auth-store.sql`,
    `  --schema            default ${DEFAULT_SCHEMA}`,
    `  --table             default ${DEFAULT_TABLE}`,
    `  --id-column         default ${DEFAULT_ID_COLUMN}`,
    `  --content-column    default ${DEFAULT_CONTENT_COLUMN}`,
    '  --no-transaction    do not wrap with BEGIN/COMMIT',
    '  --no-upsert         omit ON CONFLICT ... DO UPDATE',
    '  --no-validate-json  skip JSON.parse validation',
    '  --continue-on-error generate partial output (not recommended)',
    '  --quiet             suppress failure details to avoid leaking file names',
  ];
  process.stdout.write(`${lines.join(os.EOL)}${os.EOL}`);
};

export const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return 0;
  }

  const result = await generateAuthFilesPgSql({
    inDir: parsed.in,
    outFile: parsed.out,
    schema: parsed.schema,
    table: parsed.table,
    idColumn: parsed.idColumn,
    contentColumn: parsed.contentColumn,
    transaction: parsed.transaction,
    upsert: parsed.upsert,
    validateJson: parsed.validateJson,
    stopOnError: parsed.stopOnError,
  });

  process.stdout.write(
    [
      '',
      'Summary:',
      `  inDir: ${result.inDir}`,
      `  outFile: ${result.outFile}`,
      `  table: ${quoteQualifiedTable(result.schema, result.table)}`,
      `  totalFiles: ${result.totalFiles}`,
      `  success: ${result.success}`,
      `  failed: ${result.failed}`,
      `  wrote: ${result.wrote}`,
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

