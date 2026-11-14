import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
const { config } = await import('../dist/server/server/config.js');
const { listReviews, listReviewSummaries } = await import('../dist/server/server/services/reviews.js');
test('imported comments without stars stay visible and do not reduce the rating average', async () => {
 const dir = await mkdtemp(path.join(tmpdir(), 'atelie-reviews-'));
 const original = config.dataDir;
 try {
  config.dataDir = dir;
  const reviews = [{ id:'a', productId:'mixed', author:'a', text:'Sem nota', rating:null, createdAt:'2026-10-01', source:'Shopee', photos:['/uploads/test.jpg'] }, { id:'b', productId:'mixed', author:'b', text:'Com nota', rating:4, createdAt:'2026-10-02' }, { id:'c', productId:'unrated', author:'c', text:'Outra sem nota', rating:null, createdAt:'2026-10-03' }];
  await writeFile(path.join(dir,'reviews.json'), JSON.stringify(reviews.slice(0,2)));
  await writeFile(path.join(dir,'imported-reviews.json'), JSON.stringify(reviews.slice(2)));
  const mixed = await listReviews('mixed');
  assert.deepEqual(mixed.summary, {count:2, average:4, ratedCount:1});
  assert.equal(mixed.reviews[1].source, 'Shopee');
  assert.deepEqual(mixed.reviews[1].photos, ['/uploads/test.jpg']);
  const summaries = await listReviewSummaries();
  assert.deepEqual(summaries.mixed, mixed.summary);
  assert.deepEqual(summaries.unrated, {count:1, average:0, ratedCount:0});
 } finally {config.dataDir = original; await rm(dir,{recursive:true,force:true});}
});
