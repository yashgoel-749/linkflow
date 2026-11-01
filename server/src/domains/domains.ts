import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { domainToASCII } from 'node:url';
import { Router } from 'express';
import { z } from 'zod';
import type { Domain } from '@prisma/client';
import { db } from '../db.js';
import { config } from '../config.js';
import { authOf, authenticate } from '../auth/auth.js';
import { HttpError } from '../errors.js';
import { rateLimit } from '../security.js';

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => domainToASCII(value))
  .refine(
    (value) =>
      value.length <= 253 &&
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        value
      ),
    'Use a DNS hostname, without scheme, path, or port'
  );
const domainBody = z.object({ hostname: hostnameSchema }).strict();
const dns = new Resolver({ timeout: 2000, tries: 2 });
export function domainView(domain: Domain) {
  return {
    hostname: domain.hostname,
    status: domain.verifiedAt ? 'verified' : 'pending',
    added: domain.createdAt.toISOString(),
    ...(domain.verifiedAt
      ? {}
      : {
          proof: {
            type: 'TXT',
            name: `_linkflow.${domain.hostname}`,
            value: `linkflow-verification=${domain.proof}`,
          },
        }),
  };
}
export async function assertDomain(userId: string, hostname: string) {
  if (hostname === config.defaultDomain) return;
  if (!(await db.domain.findFirst({ where: { hostname, userId, verifiedAt: { not: null } } })))
    throw new HttpError(
      400,
      'DOMAIN_UNVERIFIED',
      'Use the default host or an owned verified domain'
    );
}
export const domainsRouter = Router();
domainsRouter.use(authenticate);
domainsRouter.get('/', async (req, res) => {
  const domains = await db.domain.findMany({
    where: { userId: authOf(req).user.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    data: [
      { hostname: config.defaultDomain, status: 'verified', added: new Date(0).toISOString() },
      ...domains.map(domainView),
    ],
  });
});
domainsRouter.post('/', rateLimit('domains', 30, 3600000), async (req, res) => {
  const { hostname } = domainBody.parse(req.body);
  if (hostname === config.defaultDomain.split(':')[0])
    throw new HttpError(
      409,
      'DEFAULT_DOMAIN',
      'The configured default domain is already available'
    );
  const domain = await db.domain.create({
    data: { userId: authOf(req).user.id, hostname, proof: randomBytes(32).toString('hex') },
  });
  res.status(201).json({ data: domainView(domain) });
});
domainsRouter.post('/verify', rateLimit('dns', 20, 3600000), async (req, res) => {
  const { hostname } = domainBody.parse(req.body);
  const domain = await db.domain.findFirst({ where: { userId: authOf(req).user.id, hostname } });
  if (!domain) throw new HttpError(404, 'NOT_FOUND', 'Domain not found');
  if (domain.verifiedAt) return res.json({ data: domainView(domain) });
  let records: string[][];
  try {
    records = await dns.resolveTxt(`_linkflow.${hostname}`);
  } catch {
    throw new HttpError(
      422,
      'DNS_NOT_VERIFIED',
      'DNS TXT record is missing or DNS lookup failed; try again after propagation'
    );
  }
  if (!records.some((parts) => parts.join('') === `linkflow-verification=${domain.proof}`))
    throw new HttpError(
      422,
      'DNS_NOT_VERIFIED',
      'DNS TXT record does not match the ownership proof'
    );
  const verified = await db.domain.update({
    where: { id: domain.id },
    data: { verifiedAt: new Date() },
  });
  res.json({ data: domainView(verified) });
});
