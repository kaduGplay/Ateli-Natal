import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const { outputFiles } = await build({ stdin: { contents: "export { filterByCategory } from './src/client/storefront/home'; export { state } from './src/client/storefront/state';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'Categories', platform: 'browser' });

test('Every category filters the catalog, updates feedback and Todos restores all products', async () => {
  const products = JSON.parse(await readFile('data/catalog.json', 'utf8')).filter(p => p.active);
  const categories = JSON.parse(await readFile('data/categories.json', 'utf8')).filter(c => c.active);
  const elements = new Map();
  for (const id of ['mainProductGrid', 'catalogTitle', 'catalogCount', 'catalogSection', 'bestSellersSection', 'bumpsSection', 'bumpsProductGrid']) {
    elements.set(id, { innerHTML: '', textContent: '', style: {}, scrollIntoView() { this.scrolled = true; } });
  }
  const buttons = ['all', ...categories.map(c => c.slug)].map(slug => ({ dataset: { cat: slug }, classList: { toggle(_, active) { this.active = active; } }, setAttribute(key, value) { this[key] = value; } }));
  const sandbox = vm.createContext({ document: { getElementById: id => elements.get(id), querySelectorAll: () => buttons }, window: {}, console });
  vm.runInContext(outputFiles[0].text, sandbox);
  sandbox.Categories.state.products = products;
  sandbox.Categories.state.categories = categories;
  for (const slug of [...categories.map(c => c.slug), 'all']) {
    sandbox.Categories.filterByCategory(slug);
    const expected = products.filter(p => slug === 'all' || [p.category, ...(p.additionalCategories ?? [])].includes(slug));
    const grid = elements.get('mainProductGrid').innerHTML;
    assert.equal((grid.match(/<article /g) || []).length, expected.length, slug);
    assert.ok(expected.every(p => grid.includes(`id=${encodeURIComponent(p.id)}`)), slug);
    if (slug === 'promocoes') {
      assert.equal(expected.filter(p => p.id === 'PROJ-NATAL-16').length, 1);
      const ids = [...grid.matchAll(/href="#produto\?id=([^"&]+)/g)].map(m => m[1]);
      assert.equal(ids[0], 'PROJ-NATAL-16');
    }
    if (slug === 'piscas') assert.ok(expected.some(p => p.id === 'PROJ-NATAL-16'));
    assert.equal(elements.get('catalogTitle').textContent, slug === 'all' ? 'Todos os produtos' : categories.find(c => c.slug === slug).name);
    assert.match(elements.get('catalogCount').textContent, new RegExp(`^${expected.length} `));
    assert.equal(buttons.find(b => b.dataset.cat === slug)['aria-pressed'], 'true');
    assert.equal(buttons.filter(b => b.classList.active).length, 1);
    assert.equal(elements.get('catalogSection').scrolled, true);
    assert.equal(elements.get('bestSellersSection').style.display, slug === 'all' ? '' : 'none');
    assert.equal(elements.get('bumpsSection').style.display, slug === 'all' ? '' : 'none');
  }
});
