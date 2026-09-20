import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { config } from './config.js';

let pool: Pool | undefined;
let initialized: Promise<void> | undefined;
export const databaseUrl = (): string | undefined => process.env.DATABASE_URL || process.env.POSTGRES_URL;

export async function getDatabase(): Promise<Pool> {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl(), max: 3, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 });
    pool.on('error', () => console.error('database_connection_error'));
    if (config.isVercel) attachDatabasePool(pool);
  }
  if (!initialized) {
    initialized = pool.query(`CREATE TABLE IF NOT EXISTS storefront_documents (
      name text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`).then(() => undefined).catch(error => { initialized = undefined; throw error; });
  }
  await initialized;
  return pool;
}
