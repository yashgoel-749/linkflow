import type { z } from 'zod';
import type { domainSchema, linkSchema } from '../lib/api';

export type ShortLink = z.infer<typeof linkSchema>;
export type LinkStatus = ShortLink['status'];
export type Domain = z.infer<typeof domainSchema>;
export type LinkDraft = Pick<
  ShortLink,
  'title' | 'destination' | 'slug' | 'domain' | 'tags' | 'protected' | 'expiresAt'
> & { password?: string; category?: string };
export type CreateResult = { ok: true; link: ShortLink } | { ok: false; error: string };
export type TrafficMetric = 'clicks' | 'visitors' | 'conversions';
export type TrafficPoint = { date: string; clicks: number; visitors: number; conversions: number };
