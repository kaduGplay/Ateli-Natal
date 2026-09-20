import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { maxBuffer: 120 * 1024 * 1024 });
const files = git('diff', '--cached', '--name-only', '--diff-filter=ACM', '-z').toString().split('\0').filter(Boolean);
const secrets = existsSync('.env') ? readFileSync('.env', 'utf8').split('\n').filter(line => /^[A-Z0-9_]*(KEY|SECRET|TOKEN|DATABASE_URL|POSTGRES_URL)=/.test(line)).map(line => line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')).filter(value => value.length >= 12) : [];
for (const file of files) {
  if (/(^|\/)\.env($|\.)/.test(file) && file !== '.env.example' || /^data\/(orders|pix-attempts|voidpay-events)\.json$/.test(file)) throw new Error(`Arquivo privado impedido de publicar: ${file}`);
  const data = git('show', `:${file}`);
  if (secrets.some(secret => data.includes(Buffer.from(secret))) || /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(data.toString())) throw new Error(`Possível segredo impedido de publicar: ${file}`);
}
console.log(`Verificação de segredos: ${files.length} arquivo(s) aprovado(s).`);
