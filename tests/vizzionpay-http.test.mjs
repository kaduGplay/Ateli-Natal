import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import serverless from 'serverless-http';

process.env.META_CONVERSIONS_ACCESS_TOKEN = 'fake-meta-http-token';
process.env.META_CONVERSIONS_START_AT = '2026-01-01T00:00:00Z';
const dir = await mkdtemp(path.join(tmpdir(), 'atelie-vizzion-http-'));
Object.assign(process.env, { DATA_DIR: dir, DATABASE_URL: '', POSTGRES_URL: '', DATABASE_SCHEMA: '', VERCEL: '', NETLIFY: '',
  NODE_ENV: 'production', PAYMENT_PROVIDER: 'vizzionpay', VIZZIONPAY_PUBLIC_KEY: 'fake-public', VIZZIONPAY_PRIVATE_KEY: 'fake-secret',
  VIZZIONPAY_WEBHOOK_TOKEN: '', PUBLIC_BASE_URL: 'https://store.example.com' });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); });
const write = (name, data) => writeFile(path.join(dir, name + '.json'), JSON.stringify(data));
await write('catalog', [{ id: 'http-test-product', name: 'Produto de teste', price: 100, active: true, stock: 10 }]);
await write('settings', { metaPixelId: '1396585905883770', pixDiscountPercent: 10, orderBumpDiscountPercent: 20 });
await write('shipping', { options: [{ id: 'free', name: 'Entrega grátis', price: 0, freeAbove: 0, deliveryDays: 3 }] });
await write('coupons', [{ code: 'BEMVINDO10', type: 'percent', value: 10, active: true }]);
const { default: app } = await import('../dist/server/index.js');
const handler = serverless(app);
const call = async (method, url, body) => {
  const parsed = new URL(url, 'https://store.example.com');
  const response = await handler({ httpMethod: method, path: parsed.pathname, headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body), isBase64Encoded: false, queryStringParameters: Object.fromEntries(parsed.searchParams), requestContext: {} }, {});
  return { status: response.statusCode, body: JSON.parse(response.body) };
};

test('Vizzion Pay HTTP lifecycle: checkout → persisted QR → real route webhook → status/summary paid', async () => {
  let charges = 0;
  const expiresAt = new Date(Date.now() + 1800000).toISOString();
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://app.vizzionpay.com.br/api/v1/gateway/pix/receive');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body); assert.equal(body.amount, 81);
    assert.equal(body.callbackUrl, 'https://store.example.com/api/webhooks/vizzionpay');
    charges++;
    return Response.json({ transactionId: 'fake-http-tx', status: 'OK', webhookToken: 'fake-http-token',
      pix: { code: '000201FAKE-DO-NOT-PAY', expiresAt } });
  };
  const checkout = { requestId: 'http-test-checkout-000001', customer: { name: 'Cliente Teste', email: 'test@example.com', document: '52998224725', phone: '11987654321' },
    address: { cep: '01310100', street: 'Rua Teste', number: '1', complement: '', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
    items: [{ productId: 'http-test-product', qty: 1, variant: '', isBump: false }], shippingOptionId: 'free', coupons: ['BEMVINDO10'] };
  const created = await call('POST', '/api/checkout/pix', checkout);
  assert.equal(created.status, 200); assert.equal(created.body.data.pix.copyPaste, '000201FAKE-DO-NOT-PAY');
  assert.doesNotMatch(JSON.stringify(created.body), /fake-http-token|fake-secret/);
  const id = created.body.data.orderId;
  const payment = await call('GET', `/api/orders/${id}/payment`);
  assert.equal(payment.status, 200); assert.equal(payment.body.data.status, 'pending');
  const event = { event: 'TRANSACTION_PAID', token: 'fake-http-token', offerCode: '', checkoutUrl: '',
    client: { id: 'fake-client', name: 'Cliente Teste', email: 'test@example.com', phone: '11987654321', cpf: '52998224725', cnpj: null, address: null },
    transaction: { id: 'fake-http-tx', identifier: id, status: 'COMPLETED', paymentMethod: 'PIX', originalAmount: 81, amount: 81,
      originalCurrency: 'BRL', currency: 'BRL', exchangeRate: 1, installments: 1, createdAt: new Date().toISOString(), payedAt: new Date().toISOString(),
      pixInformation: { qrCode: '000201FAKE-DO-NOT-PAY', endToEndId: 'fake-e2e' } }, subscription: null, orderItems: [], trackProps: {} };
  const denied = await call('POST', '/api/webhooks/vizzionpay', { ...event, token: 'wrong-token' });
  assert.equal(denied.status, 401);
  assert.equal((await call('GET', `/api/orders/${id}/status`)).body.data.status, 'pending');
  const paid = await call('POST', '/api/webhooks/vizzionpay', event);
  assert.equal(paid.status, 200); assert.equal(paid.body.data.accepted, true);
  assert.equal((await call('GET', `/api/orders/${id}/status`)).body.data.status, 'paid');
  const summary = await call('GET', `/api/orders/${id}/summary`);
  assert.equal(summary.body.data.status, 'paid'); assert.equal(summary.body.data.value, 81);
  assert.equal((await call('GET', `/api/orders/${id}/payment`)).body.data.status, 'paid');
  assert.equal((await call('POST', '/api/webhooks/vizzionpay', event)).status, 200);
  const receipts = JSON.parse(await readFile(path.join(dir, 'vizzionpay-events.json'), 'utf8'));
  assert.equal(receipts.length, 1);
  assert.doesNotMatch(JSON.stringify(receipts), /fake-http-token|52998224725|test@example.com/);
  const conversions = JSON.parse(await readFile(path.join(dir, 'meta-conversions.json'), 'utf8'));
  assert.equal(conversions.length, 1);
  assert.equal(conversions[0].event.event_id, id);
  assert.equal(conversions[0].event.custom_data.value, 81);
  assert.equal(conversions[0].state, 'pending');
  assert.doesNotMatch(JSON.stringify(conversions), /fake-meta-http-token|test@example.com|52998224725/);
  assert.equal(charges, 1, 'Webhook and status routes never create a second charge or query the gateway');
});

test('signed HTTP callback updates checkout, status and purchase summary with a compact Pix notification', async () => {
 process.env.VIZZIONPAY_CALLBACK_SECRET='fake-signed-http-callback-secret';
 let callback;
 globalThis.fetch=async (_url,init)=>{callback=new URL(JSON.parse(init.body).callbackUrl);return Response.json({transactionId:'fake-signed-http-tx',status:'OK',pix:{code:'000201FAKE-SIGNED-DO-NOT-PAY',expiresAt:new Date(Date.now()+1800000).toISOString()}});};
 const created=await call('POST','/api/checkout/pix',{requestId:'signed-http-request-00001',customer:{name:'Teste',email:'test@example.com',document:'52998224725',phone:'11987654321'},address:{cep:'01310100',street:'Rua Teste',number:'1',complement:'',neighborhood:'Centro',city:'São Paulo',state:'SP'},items:[{productId:'http-test-product',qty:1,variant:'',isBump:false}],shippingOptionId:'free',coupons:[]});
 assert.equal(created.status,200);const id=created.body.data.orderId;
 const event={event:'TRANSACTION_PAID',transaction:{id:'fake-signed-http-tx',status:'COMPLETED',paymentMethod:'PIX',amount:90,currency:'BRL'}};
 const endpoint=callback.pathname+callback.search;
 const forged=new URL(callback);forged.searchParams.set('signature','0'.repeat(64));
 assert.equal((await call('POST',forged.pathname+forged.search,event)).status,401);
 assert.equal((await call('GET',`/api/orders/${id}/status`)).body.data.status,'pending');
 assert.equal((await call('POST',endpoint,event)).status,200);
 assert.equal((await call('POST',endpoint,event)).status,200);
 assert.equal((await call('GET',`/api/orders/${id}/status`)).body.data.status,'paid');
 const summary=(await call('GET',`/api/orders/${id}/summary`)).body.data;
 assert.equal(summary.status,'paid');assert.equal(summary.value,90);
 const receipts=JSON.parse(await readFile(path.join(dir,'vizzionpay-events.json'),'utf8'));assert.equal(receipts.filter(x=>x.transactionId==='fake-signed-http-tx').length,1);
 const conversions=JSON.parse(await readFile(path.join(dir,'meta-conversions.json'),'utf8'));assert.equal(conversions.filter(x=>x.event.event_id===id).length,1);
 delete process.env.VIZZIONPAY_CALLBACK_SECRET;
});
