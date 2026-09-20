import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Raiz do projeto, tanto rodando via tsx (src/server) quanto compilado (dist/server/server). */
const root = process.env.VERCEL ? process.cwd() : path.resolve(here, here.includes(`${path.sep}dist${path.sep}`) ? '../../..' : '../..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) loadEnvFile(envFile);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProduction: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
  isVercel: Boolean(process.env.VERCEL),
  rootDir: root,
  dataDir: process.env.DATA_DIR ?? path.join(root, 'data'),
  publicDir: path.join(root, 'public'),
  /** Validade da cobrança Pix, em minutos. */
  pixExpiresMinutes: 30,
} as const;
