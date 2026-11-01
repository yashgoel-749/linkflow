import { config, parse } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { validateTestDatabase } from './test-database.js';

export function testEnvironment() {
  config({ path: '.env.test', override: false });
  const applicationUrl =
    process.env.DATABASE_URL ??
    (existsSync('.env') ? parse(readFileSync('.env')).DATABASE_URL : undefined);
  const url = validateTestDatabase({
    testUrl: process.env.TEST_DATABASE_URL,
    applicationUrl,
    confirmedNeonEndpoint: process.env.TEST_DATABASE_NEON_ENDPOINT,
  });
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_BASE_URL ??= 'http://localhost:3001';
  process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173,http://localhost:4173';
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.REDIS_NAMESPACE = `linkflow:test:${randomUUID()}`;
  process.env.JWT_SECRET ??= 'test-only-jwt-secret-not-for-production-000000000';
  process.env.VISITOR_SECRET ??= 'test-only-visitor-secret-not-for-production-00000';
  return url;
}
