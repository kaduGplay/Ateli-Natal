import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const dir = await mkdtemp(path.join(tmpdir(), 'atelie-meta-test-'));
Object.assign(process.env, { DATA_DIR: dir, DATABASE_URL: '', POSTGRES_URL: '', VERCEL: '', NETLIFY: '',
  META_CONVERSIONS_ACCESS_TOKEN: 'fake-meta-token', META_CONVERSIONS_START_AT: '2026-01-01T00:00:00Z', PUBLIC_BASE_URL: 'https://store.example.com' });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); });
const { queueMetaPurchase, flushMetaConversions, processMetaConversions, buildMetaPurchase } = await import('../dist/server/server/services/meta-conversions.js');
const write = (name, value) => writeFile(path.join(dir, name + '.json'), JSON.stringify(value));
const read = async name => JSON.parse(await readFile(path.join(dir, name + '.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const order = { id: 'fake-meta-order-1', status: 'paid', createdAt: '2026-06-01T10:00:00Z', paidAt: '2026-06-01T10:05:00Z',
  customer: { name: 'Cliente Teste', email: 'TEST@example.com ', phone: '11987654321', document: '52998224725' },
  meta: { fbp: 'fb.1.123456789.1234', fbc: 'fb.1.123456789.fakeclick', userAgent: 'FakeTestBrowser', clientIp: '192.0.2.1' },
  totals: { payable: 81 }, items: [{ productId: 'paid-item', qty: 1, unitPrice: 100 }, { productId: 'gift-item', qty: 1, unitPrice: 0 }] };
await write('settings', { metaPixelId: '1396585905883770' });

test('Meta CAPI: only confirmed sales, hashed matching, stable IDs, atomic leases and durable retry', async t => {
  await t.test('pending orders never queue a Purchase and personal fields are normalized and hashed', async () => {
    await write('orders', [{ ...order, status: 'pending' }]);
    await queueMetaPurchase(order.id);
    await assert.rejects(read('meta-conversions'), { code: 'ENOENT' });
    const event = buildMetaPurchase(order);
    assert.equal(event.event_id, order.id); assert.equal(event.custom_data.value, 81); assert.equal(event.custom_data.currency, 'BRL');
    assert.equal(event.event_time, Date.parse(order.paidAt) / 1000);
    assert.equal(event.user_data.em[0], hash('test@example.com')); assert.equal(event.user_data.ph[0], hash('5511987654321'));
    assert.equal(event.user_data.fbp, order.meta.fbp); assert.equal(event.user_data.fbc, order.meta.fbc);
    assert.equal(event.custom_data.contents[1].item_price, 0);
    assert.doesNotMatch(JSON.stringify(event), /TEST@example|52998224725|fake-meta-token/);
  });
  await t.test('duplicate webhook queueing and concurrent delivery create one remote event', async () => {
    await write('orders', [order]);
    await Promise.all([queueMetaPurchase(order.id), queueMetaPurchase(order.id)]);
    assert.equal((await read('meta-conversions')).length, 1);
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++; assert.equal(url, 'https://graph.facebook.com/v25.0/1396585905883770/events');
      assert.equal(init.headers.Authorization, 'Bearer fake-meta-token');
      const body = JSON.parse(init.body); assert.equal(body.data.length, 1); assert.equal(body.data[0].event_id, order.id);
      return Response.json({ events_received: 1 });
    };
    await Promise.all([flushMetaConversions(), flushMetaConversions()]);
    assert.equal(calls, 1); assert.equal((await read('meta-conversions'))[0].state, 'sent');
    await processMetaConversions(); assert.equal(calls, 1);
  });
  await t.test('failed deliveries persist, retry with identical event_id and never expose tokens', async () => {
    const next = { ...order, id: 'fake-meta-order-2' };
    await write('orders', [order, next]); await queueMetaPurchase(next.id);
    globalThis.fetch = async () => { throw new Error('fake-meta-token'); };
    await flushMetaConversions();
    let jobs = await read('meta-conversions'); const job = jobs.find(j => j.event.event_id === next.id);
    assert.equal(job.state, 'pending'); assert.ok(job.nextAttempt > Date.now());
    assert.doesNotMatch(JSON.stringify(jobs), /fake-meta-token/);
    job.nextAttempt = 0; await write('meta-conversions', jobs);
    globalThis.fetch = async (url, init) => { assert.equal(JSON.parse(init.body).data[0].event_id, next.id); return Response.json({ events_received: 1 }); };
    await flushMetaConversions(); assert.equal((await read('meta-conversions')).find(j => j.event.event_id === next.id).state, 'sent');
  });
  await t.test('activation cutoff avoids backfilling historical sales into the new pixel', async () => {
    process.env.META_CONVERSIONS_START_AT = '2026-07-01T00:00:00Z';
    const old = { ...order, id: 'historical-order' }; await write('orders', [old]);
    await queueMetaPurchase(old.id); assert.ok(!(await read('meta-conversions')).some(j => j.event.event_id === old.id));
  });
  await t.test('curtain pixel isolates products, credentials and activation cutoff', async () => {
    process.env.META_CONVERSIONS_START_AT = '2026-01-01T00:00:00Z';
    process.env.META_CORTINA_ACCESS_TOKEN = 'fake-curtain-token';
    process.env.META_CORTINA_START_AT = '2026-11-14T17:24:21Z';
    await write('meta-conversions', []);
    const curtain = {...order, id:'curtain-new', paidAt:'2026-11-14T18:00:00Z', items:[...order.items,{productId:'SKU-CORT-400-RGB',qty:1,unitPrice:49.8}]};
    const other = {...curtain,id:'other-new',items:order.items};
    const historical = {...curtain,id:'curtain-old',paidAt:'2026-11-13T18:00:00Z'};
    await write('orders',[curtain,other,historical,{...curtain,id:'curtain-pending',status:'pending'}]);
    globalThis.fetch = async () => { throw new Error('offline test'); };
    await processMetaConversions();
    // Failed mocked deliveries from the prior test stay pending for this test's explicit flush.
    const jobs = await read('meta-conversions');
    assert.equal(jobs.filter(j=>j.pixelId==='898575983281260').length,1);
    assert.equal(jobs.find(j=>j.pixelId==='898575983281260').event.event_id,'curtain-new');
    assert.ok(!jobs.some(j=>j.event.event_id==='curtain-pending'));
    for (const j of jobs) {j.state='pending';j.nextAttempt=0;}
    await write('meta-conversions',jobs);
    const requests=[];
    globalThis.fetch = async (url,init) => {requests.push({url,token:init.headers.Authorization,body:JSON.parse(init.body)});return Response.json({events_received:JSON.parse(init.body).data.length});};
    await flushMetaConversions();
    assert.equal(requests.find(x=>x.url.includes('/898575983281260/')).token,'Bearer fake-curtain-token');
    assert.equal(requests.find(x=>x.url.includes('/1396585905883770/')).token,'Bearer fake-meta-token');
    assert.doesNotMatch(JSON.stringify(await read('meta-conversions')), /fake-curtain-token|fake-meta-token/);
    delete process.env.META_CORTINA_ACCESS_TOKEN;
    delete process.env.META_CORTINA_START_AT;
  });

});
