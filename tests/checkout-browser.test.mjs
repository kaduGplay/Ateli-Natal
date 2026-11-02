import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomFillSync } from 'node:crypto';
import vm from 'node:vm';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/client/checkout/pix.ts'], bundle: true, write: false, format: 'iife', globalName: 'CheckoutPix', platform: 'browser' });

test('Pix works without subtle/randomUUID and reuses the same charge for repeated clicks', async () => {
  const storage = new Map();
  const requests = [];
  const redirects = [];
  const sandbox = vm.createContext({
    TextEncoder,
    crypto: { getRandomValues: bytes => randomFillSync(bytes) },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { location: { assign: url => redirects.push(url) } },
    fetch: async (url, options) => {
      assert.equal(url, '/api/checkout/pix');
      requests.push(JSON.parse(options.body));
      return { json: async () => ({ ok: true, data: { orderId: 'test-order', pix: { copyPaste: 'TEST-ONLY', expiresAt: new Date(Date.now() + 60000).toISOString() } } }) };
    },
  });
  vm.runInContext(outputFiles[0].text, sandbox);
  const payload = { customer: { name: 'Cliente Teste' }, items: [{ productId: 'test-product', qty: 1 }] };
  await sandbox.CheckoutPix.startPix(payload);
  await sandbox.CheckoutPix.startPix(payload);
  assert.equal(requests.length, 1);
  assert.match(requests[0].requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(JSON.parse(storage.get('atelieActivePix')).fingerprint, createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
  assert.deepEqual(redirects, ['/pagamento.html?orderId=test-order', '/pagamento.html?orderId=test-order']);
});
