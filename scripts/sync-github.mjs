import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.PATH = `${dirname(process.execPath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
process.env.GIT_TERMINAL_PROMPT = '0';
const lock = '.git/atelie-sync.lock';
try { mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') process.exit(0); throw error; }
const run = (command, args, capture = false) => execFileSync(command, args, { cwd: root, stdio: capture ? 'pipe' : 'inherit', maxBuffer: 8 * 1024 * 1024 });
try {
  const dirty = run('git', ['status', '--porcelain'], true).toString().trim();
  if (dirty) {
    run('npm', ['run', 'verify']);
    run('git', ['add', '-A']);
    run(process.execPath, ['scripts/check-staged-secrets.mjs']);
    const staged = run('git', ['diff', '--cached', '--name-only'], true).toString().trim();
    if (staged) run('git', ['commit', '-m', `Atualiza loja — ${new Date().toISOString()}`]);
  }
  // Não força envio nem sobrescreve commits feitos no GitHub.
  run('git', ['push', 'origin', 'main']);
} finally { rmSync(lock, { recursive: true, force: true }); }
