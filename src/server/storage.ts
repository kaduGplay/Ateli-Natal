import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { databaseUrl, getDatabase } from './database.js';
import { HttpError } from './errors.js';

const mutable = new Set(['orders', 'pix-attempts', 'voidpay-events', 'reviews']);
const privateData = new Set(['orders', 'pix-attempts', 'voidpay-events']);

const locks = new Map<string, Promise<unknown>>();

function filePath(name: string): string {
  return path.join(config.dataDir, `${name}.json`);
}

async function readFileJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath(name), 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (mutable.has(name) && databaseUrl()) {
    const db = await getDatabase();
    const result = await db.query('SELECT data FROM storefront_documents WHERE name = $1', [name]);
    if (result.rows.length) return result.rows[0].data as T;
    return privateData.has(name) ? fallback : readFileJson(name, fallback);
  }
  if (config.isVercel && privateData.has(name)) throw new HttpError(503, 'O armazenamento de pedidos ainda não foi configurado.');
  return readFileJson(name, fallback);
}

async function updateDatabase<T>(name: string, fallback: T, mutate: (current: T) => T | Promise<T>): Promise<T> {
  const client = await (await getDatabase()).connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`atelie:${name}`]);
    const result = await client.query('SELECT data FROM storefront_documents WHERE name = $1', [name]);
    const current = result.rows.length ? result.rows[0].data as T : privateData.has(name) ? fallback : await readFileJson(name, fallback);
    const next = await mutate(current);
    await client.query(`INSERT INTO storefront_documents (name, data) VALUES ($1, $2::jsonb)
      ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [name, JSON.stringify(next)]);
    await client.query('COMMIT');
    return next;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

/**
 * Lê, altera e grava um arquivo JSON de forma serializada (uma escrita por vez por arquivo)
 * e atômica (grava em .tmp e renomeia).
 */
export async function updateJson<T>(name: string, fallback: T, mutate: (current: T) => T | Promise<T>): Promise<T> {
  if (databaseUrl() && mutable.has(name)) return updateDatabase(name, fallback, mutate);
  if (config.isVercel) throw new HttpError(503, 'O armazenamento de pedidos ainda não foi configurado.');
  const previous = locks.get(name) ?? Promise.resolve();
  const run = previous.then(async () => {
    const next = await mutate(await readJson(name, fallback));
    const target = filePath(name);
    const tmp = `${target}.${process.pid}.tmp`;
    const handle = await fs.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify(next, null, 2), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, target);
    const directory = await fs.open(path.dirname(target), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    return next;
  });
  locks.set(name, run.catch(() => undefined));
  return run;
}
