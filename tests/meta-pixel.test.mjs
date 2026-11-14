import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

test('browser Pixel: correct ID, navigation, ecommerce events, Pix dedupe and purchase eventID', async () => {
  const { outputFiles } = await build({ entryPoints: ['src/client/lib/pixel.ts'], bundle: true, write: false, format: 'cjs', platform: 'browser' });
  const scripts = []; const storage = new Map();
  const context = vm.createContext({ module: { exports: {} }, window: {}, location: { href: 'https://store.example.com/' },
    document: { createElement: () => ({}), head: { appendChild: script => scripts.push(script) } },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  vm.runInContext(outputFiles[0].text, context); const pixel = context.module.exports.pixel;
  pixel.init('1396585905883770'); pixel.init('1396585905883770');
  assert.equal(scripts.length, 1); assert.equal(scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  const rawQueue = context.window.fbq.queue;
  const queue = new Proxy(rawQueue, { get(target, prop) { if (prop === 'filter' || prop === 'find' || prop === 'some') return (...args) => target.map(x => x[0].startsWith('trackSingle') ? [x[0], ...x.slice(2)] : x)[prop](...args); return Reflect.get(target, prop); } });
  assert.equal(queue[0][0], 'init'); assert.equal(queue[0][1], '1396585905883770');
  pixel.pageView(); assert.equal(queue.filter(x => x[1] === 'PageView').length, 1);
  context.location.href += '#produto?id=test'; pixel.pageView();
  assert.equal(queue.filter(x => x[1] === 'PageView').length, 2);
  const item = { id: 'test', name: 'Produto', price: 100, qty: 2 };
  pixel.viewContent(item, 'decoracao'); pixel.addToCart(item); pixel.addToWishlist(item);
  pixel.initiateCheckout([item]); pixel.addPaymentInfo([item], 162); pixel.contact('WhatsApp');
  pixel.pixGenerated('fake-order', 162); pixel.pixGenerated('fake-order', 162); pixel.pixCodeCopied(162);
  assert.equal(pixel.purchase('fake-order', [item], 162), true);
  for (const name of ['ViewContent', 'AddToCart', 'AddToWishlist', 'InitiateCheckout', 'AddPaymentInfo', 'Contact', 'Purchase', 'PixCodeCopied']) assert.ok(queue.some(x => x[1] === name));
  assert.equal(queue.filter(x => x[1] === 'PixGenerated').length, 1);
  const curtain = {id:'SKU-CORT-400-RGB', name:'Cortina', price:49.8, qty:1};
  pixel.viewContent(curtain); pixel.addToCart(curtain); pixel.initiateCheckout([curtain, item]);
  pixel.purchase('curtain-order', [curtain,item], 249.8);
  const targeted = rawQueue.filter(x => x[1] === '898575983281260' && x[0].startsWith('trackSingle'));
  assert.ok(targeted.some(x => x[2] === 'ViewContent'));
  assert.ok(targeted.some(x => x[2] === 'Purchase' && x[4].eventID === 'curtain-order'));
  const before = targeted.length;
  pixel.viewContent(item); pixel.addToCart(item); pixel.viewCategory('arvores'); pixel.purchase('other-order',[item],200);
  assert.equal(rawQueue.filter(x => x[1] === '898575983281260' && x[0].startsWith('trackSingle')).length,before);
  assert.ok(rawQueue.filter(x => x[0].startsWith('track')).every(x => x[0] === 'trackSingle' || x[0] === 'trackSingleCustom'));
  const purchase = queue.find(x => x[1] === 'Purchase'); assert.equal(purchase[2].value, 162); assert.equal(purchase[2].currency, 'BRL'); assert.equal(purchase[3].eventID, 'fake-order');
});
