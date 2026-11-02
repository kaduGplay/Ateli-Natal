import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentTable } from '../dist/server/server/database.js';

test('schema selection quotes identifiers and rejects SQL injection', () => {
  const original = process.env.DATABASE_SCHEMA;
  try {
    delete process.env.DATABASE_SCHEMA;
    assert.equal(documentTable(), '"public"."storefront_documents"');
    process.env.DATABASE_SCHEMA = 'atelie_natal';
    assert.equal(documentTable(), '"atelie_natal"."storefront_documents"');
    for (const invalid of ['public;DROP TABLE orders', 'public.other', '"public"', 'schema-name']) {
      process.env.DATABASE_SCHEMA = invalid;
      assert.throws(documentTable, /DATABASE_SCHEMA inválido/);
    }
  } finally {
    if (original === undefined) delete process.env.DATABASE_SCHEMA;
    else process.env.DATABASE_SCHEMA = original;
  }
});
