import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(tmpdir(), 'atelie-payment-test-'));
process.env.DATA_DIR = dir;
// Keep automated tests isolated even when production credentials are configured locally.
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
process.env.VERCEL = '';
process.env.VOIDPAY_PUBLIC_KEY = 'test-public';
process.env.VOIDPAY_PRIVATE_KEY = 'test-secret';
process.env.PUBLIC_BASE_URL = 'https://store.example.com';
process.env.GATEWAY_WEBHOOK_TOKEN = 'test-global-token';
const originalFetch = globalThis.fetch;
const { createPixOrder, getOrder, refreshOrderStatus, replaceLegacyPix, resolvePaymentOrder } = await import('../dist/server/server/services/orders.js');
const { receiveVoidPayWebhook } = await import('../dist/server/server/webhooks/voidpay.js');
const { VoidPayPaymentProvider } = await import('../dist/server/server/providers/payment.voidpay.js');
const { validateVoidPayPayload } = await import('../dist/server/server/webhooks/voidpay-payload.js');
const write = (file, data) => writeFile(path.join(dir, file + '.json'), JSON.stringify(data));
const read = async file => JSON.parse(await readFile(path.join(dir, file + '.json'), 'utf8'));
let calls = [];
const expiresAt = new Date(Date.now() + 1800000).toISOString();
function gatewayMock() {
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return Response.json({ transactionId: 'tx-' + calls.length, status: 'OK', transactionStatus: 'PENDING', fee: 5,
      webhookToken: 'test-transaction-token', order: { id: 'gateway-order' }, pix: { code: '000201TEST-PIX', expiresAt } });
  };
}
function payload(id = 'request-00000000000001') {
  return { requestId: id, customer: { name: 'Teste Checkout', email: 'test@example.com', document: '52998224725', phone: '11987654321' },
    address: { cep: '01310100', street: 'Rua Teste', number: '123', complement: '', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
    items: [{ productId: 'test-product', qty: 1, variant: '', isBump: false }], shippingOptionId: 'expresso', coupons: [] };
}
function event(transactionId, kind = 'TRANSACTION_PAID', token = 'test-transaction-token') {
  return { event: kind, token, offerCode: '', checkoutUrl: '',
    client: { id: 'client-id', name: 'Teste', email: 'test@example.com', phone: '11987654321', cpf: '52998224725', cnpj: null, address: null },
    transaction: { id: transactionId, status: kind === 'TRANSACTION_PAID' ? 'COMPLETED' : 'PENDING', paymentMethod: 'PIX',
      originalAmount: 143.91, amount: 143.91, originalCurrency: 'BRL', currency: 'BRL', exchangeRate: 1, installments: 1,
      createdAt: '2026-09-19T16:29:59.843Z', payedAt: kind === 'TRANSACTION_PAID' ? '2026-09-19T16:30:59.843Z' : null,
      pixInformation: { qrCode: '000201TEST-PIX', endToEndId: kind === 'TRANSACTION_PAID' ? 'end-to-end' : null } },
    subscription: null, orderItems: [], trackProps: {} };
}
await write('catalog', [{ id: 'test-product', name: 'Produto Teste', price: 159.9, stock: 10, active: true }]);
await write('settings', { pixDiscountPercent: 10, orderBumpDiscountPercent: 20 });
await write('shipping', { options: [{ id: 'expresso', name: 'LogiPulse Express', price: 19.52, freeAbove: 150, deliveryDays: 3, isPromo: true }] });
await write('coupons', []);
gatewayMock();
after(async () => { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); });

test('VoidPay: charge, durable idempotency, authentication, webhook ordering and errors', async t => {
  let charge;
  await t.test('concurrent clicks create one charge with the correct amount and private headers', async () => {
    const [a, b] = await Promise.all([createPixOrder(payload()), createPixOrder(payload())]);
    charge = a;
    assert.deepEqual(a, b); assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://dash.voidpayments.com/api/v1/gateway/pix/receive');
    assert.equal(calls[0].options.headers['x-secret-key'], 'test-secret');
    assert.equal(calls[0].body.amount, 143.91);
    assert.equal(calls[0].body.callbackUrl, 'https://store.example.com/api/webhooks/voidpay');
    assert.equal(calls[0].body.identifier, charge.orderId);
    assert.equal(calls[0].body.shippingFee, undefined);
    assert.equal(a.pix.expiresAt, expiresAt);
    assert.doesNotMatch(JSON.stringify(a), /test-secret|test-transaction-token/);
    assert.equal((await getOrder(a.orderId)).payment.provider, 'voidpay');
  });
  await t.test('durable retries reuse the existing transaction; changed payload conflicts', async () => {
    assert.deepEqual(await createPixOrder(payload()), charge); assert.equal(calls.length, 1);
    await assert.rejects(createPixOrder({ ...payload(), coupons: ['DIFFERENT'] }), { status: 409 });
  });
  await t.test('wrong token and unsupported event cannot persist or approve', async () => {
    await assert.rejects(receiveVoidPayWebhook(event('tx-1', 'TRANSACTION_PAID', 'invalid')), { status: 401 });
    await assert.rejects(receiveVoidPayWebhook({ ...event('tx-1'), event: 'UNKNOWN' }), { status: 400 });
    await assert.rejects(receiveVoidPayWebhook(event('tx-1'), 'TRANSACTION_CREATED'), { status: 400 });
    await assert.rejects(receiveVoidPayWebhook({ ...event('tx-1'), transaction: { ...event('tx-1').transaction, amount: '143.91' } }), { status: 400 });
    assert.equal((await getOrder(charge.orderId)).status, 'pending');
    await assert.rejects(read('voidpay-events'), { code: 'ENOENT' });
  });
  await t.test('authenticated PAID updates once; delayed CREATED never reverts payment', async () => {
    await Promise.all([receiveVoidPayWebhook(event('tx-1')), receiveVoidPayWebhook(event('tx-1'))]);
    await receiveVoidPayWebhook(event('tx-1', 'TRANSACTION_CREATED'));
    assert.equal((await refreshOrderStatus(charge.orderId)).status, 'paid');
    assert.equal((await read('voidpay-events')).length, 2);
    const stored = await readFile(path.join(dir, 'voidpay-events.json'), 'utf8');
    assert.doesNotMatch(stored, /test-transaction-token|52998224725|test@example.com/);
    assert.equal(calls.length, 1, 'webhooks do not make outgoing API calls');
  });
  await t.test('amount mismatch cannot approve an order', async () => {
    const other = await createPixOrder(payload('request-00000000000002'));
    const bad = event('tx-2'); bad.transaction.amount = 1;
    await receiveVoidPayWebhook(bad);
    assert.equal((await getOrder(other.orderId)).status, 'pending');
  });
  await t.test('event before order persistence is reconciled after save', async () => {
    await receiveVoidPayWebhook(event('tx-3', 'TRANSACTION_PAID', 'test-global-token'));
    const next = await createPixOrder(payload('request-00000000000003'));
    assert.equal((await getOrder(next.orderId)).status, 'paid');
  });
  await t.test('nested CREATED example fields are accepted', () => {
    const p = event('tx-example', 'TRANSACTION_CREATED');
    for (const key of ['subscription', 'orderItems', 'trackProps']) { p.transaction[key] = p[key]; delete p[key]; }
    assert.equal(validateVoidPayPayload(p).subscription, null);
  });
  await t.test('uncertain network failure cannot silently create another charge', async () => {
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; throw new Error('Network failure'); };
    await assert.rejects(createPixOrder(payload('request-00000000000004')), { status: 502 });
    await assert.rejects(createPixOrder(payload('request-00000000000004')), { status: 409 });
    assert.equal(attempts, 1);
  });
  await t.test('HTTP errors are safe and never echo gateway secrets or client data', async () => {
    globalThis.fetch = async () => Response.json({ message: 'test-secret 52998224725' }, { status: 400 });
    await assert.rejects(new VoidPayPaymentProvider().createPixCharge({ orderId: 'test', amount: 10, customer: payload().customer, expiresAt: new Date(expiresAt) }), error => {
      assert.equal(error.status, 502); assert.doesNotMatch(error.message, /test-secret|52998224725/); return true;
    });
  });
  await t.test('legacy test payment is replaced once and its old URL resolves to the real charge', async () => {
    gatewayMock();
    const legacy = structuredClone(await getOrder(charge.orderId));
    legacy.id = 'legacy-order-00001'; legacy.status = 'pending';
    legacy.payment = { method: 'pix', provider: 'dev', providerRef: 'dev_old', charge: { copyPaste: 'DEV-PIX-NAO-PAGAVEL', expiresAt } };
    await write('orders', [...await read('orders'), legacy]);
    await assert.rejects(resolvePaymentOrder(legacy.id), { status: 409 });
    const before = calls.length;
    const first = await replaceLegacyPix(legacy.id);
    const second = await replaceLegacyPix(legacy.id);
    assert.equal(first.orderId, second.orderId);
    assert.equal(calls.length, before + 1);
    assert.equal((await resolvePaymentOrder(legacy.id)).id, first.orderId);
    await assert.rejects(replaceLegacyPix(first.orderId), { status: 409 });
  });
  await t.test('a real charge can be requested without optional callbackUrl', async () => {
    delete process.env.PUBLIC_BASE_URL;
    gatewayMock();
    const result = await new VoidPayPaymentProvider().createPixCharge({ orderId: 'without-callback', amount: 10, customer: payload().customer, expiresAt: new Date(expiresAt) });
    assert.equal(calls.at(-1).body.callbackUrl, undefined);
    assert.equal(calls.at(-1).body.amount, 10);
    assert.equal(result.provider, 'voidpay');
    assert.equal(result.copyPaste, '000201TEST-PIX');
  });
});
