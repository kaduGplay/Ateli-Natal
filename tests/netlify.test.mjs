import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

// Bundle the actual Netlify entry point and invoke it as a Lambda, without a gateway.
process.env.NETLIFY = '';
process.env.ATELIE_HOSTING = 'netlify';
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
process.env.VOIDPAY_PUBLIC_KEY = 'test-public';
process.env.VOIDPAY_PRIVATE_KEY = 'test-secret';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('External calls forbidden in Netlify tests'); };
await mkdir('.netlify', { recursive: true });
const outfile = '.netlify/test-api.cjs';
await build({ entryPoints: ['netlify/functions/api.ts'], outfile, bundle: true, packages: 'external', platform: 'node', format: 'cjs', logLevel: 'error' });
const { handler } = await import('../' + outfile);
after(async () => { globalThis.fetch = originalFetch; await rm(outfile, { force: true }); });
const invoke = (path, httpMethod = 'GET') => handler({
  httpMethod, path, headers: { 'content-type': 'application/json' },
  queryStringParameters: {}, body: httpMethod === 'POST' ? '{}' : null,
  isBase64Encoded: false, requestContext: {},
}, {});

test('Netlify function serves catalog through the public API path', async () => {
  const response = await invoke('/api/products');
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).ok, true);
  assert.ok(JSON.parse(response.body).data.length > 0);
});
test('Netlify does not fall back to local order files without PostgreSQL', async () => {
  const response = await invoke('/api/orders/test-order/payment');
  assert.equal(response.statusCode, 503);
  assert.match(JSON.parse(response.body).message, /armazenamento/);
});
test('Imported product reviews and storefront summary agree and preserve their origin', async () => {
  const response = await invoke('/api/products/PROJ-NATAL-16/reviews');
  assert.equal(response.statusCode, 200);
  const { reviews, summary } = JSON.parse(response.body).data;
  assert.equal(reviews.length, 25);
  assert.equal(new Set(reviews.map(r => r.id)).size, 25);
  assert.deepEqual(summary, { count: 25, average: 4.9 });
  assert.ok(reviews.every(r => r.source === 'Aura Store' && r.sourceUrl.startsWith('https://aurastoreglobal.com/') && !r.orderId));
  assert.ok(reviews.every(r => r.createdAt === '' && r.rating >= 1 && r.rating <= 5 && r.author && r.text));
  const summaries = JSON.parse((await invoke('/api/reviews/summary')).body).data;
  assert.deepEqual(summaries['PROJ-NATAL-16'], summary);
});
test('Netlify disables the development payment route', async () => {
  assert.equal((await invoke('/api/dev/orders/test-order/pay', 'POST')).statusCode, 404);
});
