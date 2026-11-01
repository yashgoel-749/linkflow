import { z } from 'zod';

export const idSchema = z.string().uuid();
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(8).max(128);
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letters, numbers, and single hyphens');
export const destinationSchema = z
  .string()
  .trim()
  .max(4096)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Use an HTTP(S) URL without credentials');
const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((values) => [...new Set(values)]);
const expirySchema = z.string().datetime({ offset: true }).nullable();
export const draftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    destination: destinationSchema,
    slug: z.union([z.literal(''), slugSchema]).default(''),
    domain: z.string().trim().toLowerCase().max(253),
    tags: tagsSchema.default([]),
    protected: z.boolean().default(false),
    password: passwordSchema.optional(),
    expiresAt: expirySchema.default(null),
    category: z.string().trim().min(1).max(80).default('Uncategorized'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.protected && !value.password)
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Protected links require a password',
      });
    if (!value.protected && value.password)
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Set protected=true when setting a password',
      });
  });
export const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    destination: destinationSchema.optional(),
    slug: slugSchema.optional(),
    tags: tagsSchema.optional(),
    category: z.string().trim().min(1).max(80).optional(),
    expiresAt: expirySchema.optional(),
    archived: z.boolean().optional(),
    status: z.enum(['active', 'archived']).optional(),
    protected: z.boolean().optional(),
    password: passwordSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field')
  .superRefine((value, ctx) => {
    if (
      value.archived !== undefined &&
      value.status !== undefined &&
      value.archived !== (value.status === 'archived')
    )
      ctx.addIssue({ code: 'custom', message: 'Conflicting archive state' });
    if (value.protected === false && typeof value.password === 'string')
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Conflicting password state' });
    if (value.protected === true && value.password === null)
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Protected links require a password',
      });
  });
export const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(200).default(''),
    status: z.enum(['all', 'active', 'expiring', 'expired', 'archived']).default('all'),
    category: z.string().max(80).optional(),
    tag: z.string().max(40).optional(),
    sort: z.enum(['newest', 'oldest', 'clicks', 'title']).default('newest'),
  })
  .strict();
