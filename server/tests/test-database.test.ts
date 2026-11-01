import { it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTestDatabase } from '../scripts/test-database.js';

it('test database safety accepts named local tests and explicitly confirmed separate Neon endpoints', () => {
  const applicationUrl = 'postgresql://user:password@ep-app.example.neon.tech/neondb';
  const testUrl =
    'postgresql://user:password@ep-test-pooler.example.neon.tech/neondb?sslmode=require';
  assert.equal(
    validateTestDatabase({ testUrl, applicationUrl, confirmedNeonEndpoint: 'ep-test' }),
    testUrl
  );
  assert.equal(
    validateTestDatabase({ testUrl: 'postgresql://user:password@localhost/linkflow_test' }),
    'postgresql://user:password@localhost/linkflow_test'
  );
  assert.throws(() => validateTestDatabase({ testUrl, applicationUrl }));
  assert.throws(() =>
    validateTestDatabase({ testUrl, applicationUrl, confirmedNeonEndpoint: 'ep-wrong' })
  );
  assert.throws(() => validateTestDatabase({ testUrl, confirmedNeonEndpoint: 'ep-test' }));
});

it('test database safety rejects application identity despite different passwords, queries or pooled hostname', () => {
  assert.throws(() =>
    validateTestDatabase({
      applicationUrl: 'postgresql://user:one@ep-app.example.neon.tech/neondb',
      testUrl: 'postgresql://other:two@ep-app-pooler.example.neon.tech:5432/neondb?sslmode=require',
      confirmedNeonEndpoint: 'ep-app',
    })
  );
  assert.throws(() =>
    validateTestDatabase({
      applicationUrl: 'postgresql://user:one@localhost/linkflow_test',
      testUrl: 'postgresql://other:two@localhost:5432/linkflow_test?schema=public',
    })
  );
  assert.throws(() => validateTestDatabase({ testUrl: 'https://example.com/linkflow_test' }));
});
