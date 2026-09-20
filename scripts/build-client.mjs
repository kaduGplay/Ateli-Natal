import { existsSync } from 'node:fs';
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const entries = {
    store: 'src/client/storefront/main.ts',
    checkout: 'src/client/checkout/main.ts',
    thanks: 'src/client/thanks.ts',
    payment: 'src/client/payment.ts',
};

// Entradas ainda não implementadas são ignoradas (com aviso) em vez de quebrar o build.
const entryPoints = Object.fromEntries(
  Object.entries(entries).filter(([name, file]) => {
    if (existsSync(file)) return true;
    console.warn(`[aviso] entrada "${name}" ignorada: ${file} não existe`);
    return false;
  }),
);

const options = {
  entryPoints,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outdir: 'public/js',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
