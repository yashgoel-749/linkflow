import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { createClient } from 'redis';
import type { RequestHandler } from 'express';
import { config } from './config.js';
import { HttpError } from './errors.js';

let hashingJobs = 0;
function scrypt(password: string, salt: string): Promise<Buffer> {
  if (hashingJobs >= 4)
    return Promise.reject(
      new HttpError(503, 'HASH_CAPACITY', 'Authentication is busy; try again shortly')
    );
  hashingJobs++;
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 },
      (error, key) => {
        hashingJobs--;
        if (error) reject(error);
        else resolve(key);
      }
    )
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function checkPassword(password: string, encoded: string) {
  const [kind, salt, expected] = encoded.split('$');
  if (kind !== 'scrypt' || !salt || !expected || !/^[0-9a-f]{128}$/.test(expected)) return false;
  const derived = await scrypt(password, salt);
  return timingSafeEqual(derived, Buffer.from(expected, 'hex'));
}
export function privateHash(value: string) {
  return createHmac('sha256', config.VISITOR_SECRET).update(value).digest('hex');
}

export const redis = createClient({
  url: config.REDIS_URL,
  disableOfflineQueue: true,
  commandsQueueMaxLength: 64,
  socket: {
    connectTimeout: 1000,
    reconnectStrategy: (retries) => Math.min(2000, 200 + retries * 100),
  },
});
redis.on('error', () => {
  /* Cache and limits deliberately fall back to bounded local state. */
});
export async function connectRedis() {
  if (!redis.isOpen) await boundedRedis(redis.connect(), 2500).catch(() => undefined);
}
async function boundedRedis<T>(operation: Promise<T>, deadline = 200): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Redis deadline exceeded')), deadline);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function cacheGet(key: string) {
  if (!redis.isReady) return null;
  try {
    return await boundedRedis(redis.get(key));
  } catch {
    return null;
  }
}
export async function cacheSet(key: string, value: string) {
  if (redis.isReady) {
    try {
      await boundedRedis(redis.set(key, value, { EX: 60 }));
    } catch {
      /* Non-authoritative hint. */
    }
  }
}
export async function cacheDelete(key: string) {
  if (redis.isReady) {
    try {
      await boundedRedis(redis.del(key));
    } catch {
      /* DB lifecycle still authoritative. */
    }
  }
}

const counters = new Map<string, { count: number; reset: number }>();
const capacity = 10000;
const script =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";
export function rateLimit(name: string, limit: number, windowMs: number): RequestHandler {
  return async (req, res, next) => {
    const key = `${config.REDIS_NAMESPACE}:limit:${name}:${privateHash(req.ip ?? 'unknown')}`;
    const now = Date.now();
    // Always apply the local limit: a Redis failure/recovery cannot reset security limits.
    let local = counters.get(key);
    if (!local || local.reset <= now) {
      if (counters.size >= capacity) {
        for (const [entry, value] of counters) if (value.reset <= now) counters.delete(entry);
        if (counters.size >= capacity)
          return next(new HttpError(503, 'LIMIT_CAPACITY', 'Too many clients; try again later'));
      }
      local = { count: 0, reset: now + windowMs };
      counters.set(key, local);
    }
    local.count++;
    let count = local.count;
    if (redis.isReady) {
      try {
        const remote = await boundedRedis(
          redis.eval(script, { keys: [key], arguments: [String(windowMs)] })
        );
        if (typeof remote === 'number') count = Math.max(count, remote);
      } catch {
        /* Local limit is enforced even when Redis fails. */
      }
    }
    if (count > limit) {
      res.setHeader('Retry-After', Math.ceil((local.reset - now) / 1000));
      return next(new HttpError(429, 'RATE_LIMITED', 'Too many requests; try again later'));
    }
    next();
  };
}

export const originGuard: RequestHandler = (req, _res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    !config.origins.includes(req.get('origin') ?? '')
  ) {
    return next(new HttpError(403, 'ORIGIN_FORBIDDEN', 'An exact allowed Origin is required'));
  }
  next();
};
