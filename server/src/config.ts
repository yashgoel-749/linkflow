import 'dotenv/config';
import { isIP } from 'node:net';
import { z } from 'zod';

const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(ql)?:/.test(value), 'PostgreSQL required'),
    REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
    REDIS_NAMESPACE: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9:_-]+$/)
      .default('linkflow'),
    JWT_SECRET: z.string().min(32),
    VISITOR_SECRET: z.string().min(32),
    FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
    FRONTEND_DIST: z.string().min(1).optional(),
    TRUST_PROXY_HOPS: z.literal('1').optional(),
    TRUST_PROXY_IP: z
      .string()
      .refine((value) => isIP(value) !== 0, 'An exact proxy IP is required')
      .optional(),
  })
  .parse(process.env);

if (env.TRUST_PROXY_IP && env.TRUST_PROXY_HOPS)
  throw new Error('Configure TRUST_PROXY_IP or TRUST_PROXY_HOPS, not both');

const publicUrl = new URL(env.PUBLIC_BASE_URL);
if (
  !['http:', 'https:'].includes(publicUrl.protocol) ||
  publicUrl.pathname !== '/' ||
  publicUrl.search ||
  publicUrl.hash ||
  publicUrl.username
) {
  throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin');
}
const origins = env.FRONTEND_ORIGIN.split(',').map((value) => value.trim());
for (const origin of origins) {
  if (new URL(origin).origin !== origin)
    throw new Error('FRONTEND_ORIGIN entries must be exact origins without trailing slash');
}
if (
  env.NODE_ENV === 'production' &&
  [publicUrl.origin, ...origins].some((origin) => new URL(origin).protocol !== 'https:')
)
  throw new Error('Production requires HTTPS');
export const config = {
  ...env,
  origins: [...new Set([...origins, publicUrl.origin])],
  publicOrigin: publicUrl.origin,
  defaultDomain: publicUrl.host.toLowerCase(),
  secureCookies: env.NODE_ENV === 'production',
};
