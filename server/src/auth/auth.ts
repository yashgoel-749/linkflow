import { Router, type RequestHandler, type CookieOptions } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { checkPassword, hashPassword, rateLimit } from '../security.js';
import { emailSchema, passwordSchema } from '../schemas.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { user: User; sessionId: string };
  }
}
const key = new TextEncoder().encode(config.JWT_SECRET);
const issuer = 'linkflow';
const audience = 'linkflow-api';
export const cookieName = 'linkflow_session';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.secureCookies,
  path: '/',
} satisfies CookieOptions;
export function publicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email };
}
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[cookieName];
  if (typeof token !== 'string') throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  let claims;
  try {
    claims = (
      await jwtVerify(token, key, {
        algorithms: ['HS256'],
        issuer,
        audience,
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
      })
    ).payload;
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Session expired or invalid');
  }
  const parsed = z.object({ sub: z.string().uuid(), sid: z.string().uuid() }).safeParse(claims);
  if (!parsed.success) throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid session');
  const session = await db.session.findFirst({
    where: {
      id: parsed.data.sid,
      userId: parsed.data.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Session expired or revoked');
  req.auth = { user: session.user, sessionId: session.id };
  next();
};
export function authOf(req: import('express').Request) {
  if (!req.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  return req.auth;
}
async function startSession(user: User, remember: boolean, res: import('express').Response) {
  const duration = (remember ? 30 : 1) * 86400;
  const expiresAt = new Date(Date.now() + duration * 1000);
  const session = await db.session.create({ data: { userId: user.id, expiresAt } });
  const token = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key);
  res.cookie(cookieName, token, {
    ...cookieOptions,
    ...(remember ? { maxAge: duration * 1000 } : {}),
  });
}

const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: emailSchema,
    password: passwordSchema,
    remember: z.boolean().default(false),
  })
  .strict();
const loginSchema = registerSchema.omit({ name: true });
const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
  })
  .strict();
export const authRouter = Router();
authRouter.post('/register', rateLimit('auth', 20, 15 * 60000), async (req, res) => {
  const input = registerSchema.parse(req.body);
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: { name: input.name, email: input.email, passwordHash },
  });
  await startSession(user, input.remember, res);
  res.status(201).json({ data: publicUser(user) });
});
// Equal-cost nonexistent-user authentication avoids the fast-path account oracle.
const dummyHash = hashPassword('a-non-user-random-password');
authRouter.post('/login', rateLimit('auth', 20, 15 * 60000), async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await checkPassword(input.password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  await startSession(user, input.remember, res);
  res.json({ data: publicUser(user) });
});
authRouter.get('/me', authenticate, (req, res) => {
  res.json({ data: publicUser(authOf(req).user) });
});
authRouter.patch('/me', authenticate, async (req, res) => {
  const input = profileSchema.parse(req.body);
  const { user } = authOf(req);
  if (input.email && input.email !== user.email) {
    if (!input.password || !(await checkPassword(input.password, user.passwordHash)))
      throw new HttpError(403, 'PASSWORD_REQUIRED', 'Current password required to change email');
  }
  const updated = await db.user.update({
    where: { id: user.id },
    data: { name: input.name, email: input.email },
  });
  res.json({ data: publicUser(updated) });
});
authRouter.post('/logout', authenticate, async (req, res) => {
  await db.session.update({
    where: { id: authOf(req).sessionId },
    data: { revokedAt: new Date() },
  });
  res.clearCookie(cookieName, cookieOptions);
  res.status(204).end();
});
