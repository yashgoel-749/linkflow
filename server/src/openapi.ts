import { config } from './config.js';

type Schema = { [key: string]: unknown };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: 'string' };
const integer = { type: 'integer', minimum: 0 };
const datetime = { type: 'string', format: 'date-time' };
const nullableDate = { ...datetime, nullable: true };
const array = (items: Schema) => ({ type: 'array', items });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const json = (schema: Schema) => ({ 'application/json': { schema } });
const envelope = (schema: Schema) => object({ data: schema });
const body = (schema: Schema) => ({ required: true, content: json(schema) });
const errors = {
  '400': { description: 'Invalid input (Zod fields included)', content: json(ref('Error')) },
  '401': {
    description: 'Invalid credentials, expired JWT, or missing/revoked database session',
    content: json(ref('Error')),
  },
  '403': {
    description: 'Origin forbidden, incorrect password, or email change password required',
    content: json(ref('Error')),
  },
  '404': {
    description: 'Resource absent or not owned (ownership is not disclosed)',
    content: json(ref('Error')),
  },
  '409': {
    description:
      'Unique email/domain/alias conflict, permanently reserved alias, or concurrent redirect edit',
    content: json(ref('Error')),
  },
  '413': { description: 'Body too large (JSON 32 KiB; form 2 KiB)', content: json(ref('Error')) },
  '429': {
    description: 'Rate limit exceeded; Retry-After header in seconds',
    content: json(ref('Error')),
    headers: { 'Retry-After': { schema: integer } },
  },
  '503': {
    description: 'Database/click persistence unavailable or bounded limiter capacity exceeded',
    content: json(ref('Error')),
  },
};
function operation(
  summary: string,
  tag: string,
  result: Schema,
  options: {
    public?: boolean;
    request?: Schema;
    status?: string;
    description?: string;
    parameters?: unknown[];
  } = {}
) {
  return {
    summary,
    tags: [tag],
    description: options.description,
    security: options.public ? [] : [{ sessionCookie: [] }],
    parameters: options.parameters ?? [],
    ...(options.request ? { requestBody: body(options.request) } : {}),
    responses: {
      [options.status ?? '200']: { description: 'Success', content: json(envelope(result)) },
      ...errors,
    },
  };
}
const parameter = (
  name: string,
  schema: Schema,
  description: string,
  where = 'query',
  required = false
) => ({ name, in: where, required, description, schema });
const idParameter = parameter(
  'id',
  { type: 'string', format: 'uuid' },
  'Owned link identifier',
  'path',
  true
);
const listParameters = [
  parameter(
    'page',
    { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
    'One-based page'
  ),
  parameter(
    'pageSize',
    { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    'Rows per page; greater than 100 rejected'
  ),
  parameter(
    'q',
    { ...string, maxLength: 200 },
    'Case-insensitive title/slug/destination substring'
  ),
  parameter(
    'status',
    { type: 'string', enum: ['all', 'active', 'expiring', 'expired', 'archived'], default: 'all' },
    'Expiring: future expiration within 7 days; active excludes expiring'
  ),
  parameter('category', string, 'Exact category (all means no filter)'),
  parameter('tag', string, 'Exact tag (all means no filter)'),
  parameter(
    'sort',
    { type: 'string', enum: ['newest', 'oldest', 'clicks', 'title'], default: 'newest' },
    'Stable sorting; clicks is lifetime persisted events'
  ),
];
const rangeParameters = [
  parameter(
    'days',
    { type: 'integer', minimum: 1, maximum: 366, default: 31 },
    'UTC calendar days including today; default ends next UTC midnight'
  ),
  parameter(
    'source',
    { ...string, default: 'all' },
    'all=current nonarchived/nondeleted/unexpired links; everything=all owned historical events including deleted; owned UUID=that link history'
  ),
  parameter('from', datetime, 'Inclusive explicit range start; requires to'),
  parameter('to', datetime, 'Exclusive explicit range end; positive range <=366 days'),
];
const authProperties = {
  email: { ...string, format: 'email', maxLength: 254 },
  password: { ...string, minLength: 8, maxLength: 128 },
  remember: { type: 'boolean', default: false },
};
const shortLink = object({
  id: { ...string, format: 'uuid' },
  title: string,
  destination: { ...string, format: 'uri' },
  slug: string,
  domain: string,
  shortUrl: { ...string, format: 'uri' },
  tags: array(string),
  category: string,
  status: { type: 'string', enum: ['active', 'expiring', 'expired', 'archived'] },
  clicks: integer,
  growth: { type: 'number', description: 'Always 0: unavailable, not measured growth' },
  createdAt: { type: 'integer', description: 'Unix timestamp in milliseconds' },
  author: string,
  protected: { type: 'boolean' },
  expiresAt: nullableDate,
});
const breakdown = {
  name: string,
  share: { type: 'number', minimum: 0, maximum: 100 },
  count: integer,
};
const draftProperties = {
  title: { ...string, minLength: 1, maxLength: 200 },
  destination: {
    ...string,
    format: 'uri',
    maxLength: 4096,
    description: 'HTTP(S) URL, no embedded credentials',
  },
  slug: {
    ...string,
    maxLength: 80,
    description:
      'Empty generates random alias; trimmed/lowercased otherwise, /^[a-z0-9]+(?:-[a-z0-9]+)*$/',
  },
  domain: {
    ...string,
    description: 'Configured default hostname (port allowed), or owned verified DNS hostname',
  },
  tags: { ...array({ ...string, minLength: 1, maxLength: 40 }), maxItems: 20 },
  protected: { type: 'boolean', default: false },
  password: {
    ...string,
    minLength: 8,
    maxLength: 128,
    writeOnly: true,
    description: 'Required if protected=true; scrypt-hashed, never returned',
  },
  expiresAt: nullableDate,
  category: { ...string, minLength: 1, maxLength: 80, default: 'Uncategorized' },
};
const cookieHeaders = {
  'Set-Cookie': {
    description:
      'linkflow_session JWT; HttpOnly; SameSite=Lax; Path=/; Secure in production. remember=true adds 30-day Max-Age; otherwise session cookie with 1-day JWT/session expiry.',
    schema: string,
  },
};
const login = operation('Sign in and create revocable cookie session', 'Auth', ref('User'), {
  public: true,
  request: object(authProperties, ['email', 'password']),
  description:
    'Exact configured frontend or PUBLIC_BASE_URL Origin required even without an existing cookie. Swagger UI uses the public API origin and browser-managed HttpOnly cookies.',
});
const register = operation('Register an empty account', 'Auth', ref('User'), {
  public: true,
  request: object({ name: { ...string, minLength: 1, maxLength: 100 }, ...authProperties }, [
    'name',
    'email',
    'password',
  ]),
  status: '201',
  description:
    'Email normalized lowercase and database unique. No seeded accounts, links, or metrics. Exact configured frontend or public API Origin required.',
});
const logout = {
  summary: 'Revoke current PostgreSQL session and clear cookie',
  tags: ['Auth'],
  security: [{ sessionCookie: [] }],
  responses: { '204': { description: 'Logged out', headers: cookieHeaders }, ...errors },
};
const exportOperation = (summary: string, parameters: unknown[]) => ({
  summary,
  tags: ['Exports'],
  security: [{ sessionCookie: [] }],
  parameters,
  responses: {
    '200': {
      description:
        'Quoted, CRLF CSV; dangerous spreadsheet formula prefixes escaped; not paginated. Unsupported metrics labelled unavailable.',
      content: { 'text/csv': { schema: string } },
      headers: { 'Content-Disposition': { schema: string } },
    },
    ...errors,
  },
});
const redirect = (custom: boolean, post: boolean) => ({
  summary: post
    ? 'Verify protected-link password and redirect'
    : 'Resolve current link and record actual click',
  tags: ['Redirects'],
  security: [],
  description: `${custom ? 'Only verified custom Host accepted; public URLs use HTTPS. DNS verification does not provision routing/TLS.' : `Only configured default Host (${config.defaultDomain}) accepted.`} PostgreSQL lifecycle rechecked under row lock; Redis is only a hint. Deleted/old aliases 404; archived/expired 410. HEAD does not count. No-store prevents client/CDN bypass of tracking/lifecycle. ${post ? 'Exact frontend Origin or this redirect origin required. Password checked with scrypt; no click on invalid password.' : 'Protected GET returns HTML password form, not destination; POST accepts JSON or form password.'}`,
  parameters: [
    parameter(
      'slug',
      { ...string, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 80 },
      'Canonical lowercase alias',
      'path',
      true
    ),
  ],
  ...(post
    ? {
        requestBody: {
          required: true,
          content: {
            ...json(object({ password: authProperties.password })),
            'application/x-www-form-urlencoded': {
              schema: object({ password: authProperties.password }),
            },
          },
        },
      }
    : {}),
  responses: {
    '302': {
      description: 'Click committed (except HEAD), then redirect to current destination',
      headers: {
        Location: { schema: { ...string, format: 'uri' } },
        'Cache-Control': { schema: { type: 'string', example: 'no-store' } },
      },
    },
    ...errors,
    '401': {
      description: 'Protected-link password challenge',
      content: { 'text/html': { schema: string } },
    },
    '410': { description: 'Expired or archived link', content: json(ref('Error')) },
  },
});

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'LinkFlow API',
    version: '1.0.0',
    description:
      'All JSON API successes use {data:T}; errors use {error:{code,message,fields?},requestId}. Authentication is an HttpOnly cookie JWT checked against a revocable PostgreSQL session. Every unsafe API request, including login/register/logout, requires an exact configured frontend or public API Origin. CORS credentials enabled. Requests are bounded and rate-limited; Redis failure falls back to bounded local security limits. No IP, raw user-agent, or referrer query is stored. Visitors are distinct HMAC estimates. Conversions, growth, and geolocation are unavailable. Analytics all means current nondeleted/nonarchived/unexpired links; everything and an owned UUID retain historical events after soft deletion. Deleted links are absent from link lists/exports/facets and historical leaders show archived status.',
  },
  servers: [{ url: config.publicOrigin }],
  tags: [
    { name: 'Auth' },
    { name: 'Domains' },
    { name: 'Links' },
    { name: 'Analytics' },
    { name: 'Redirects' },
    { name: 'Exports' },
    { name: 'Operations' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'linkflow_session',
        description:
          'Set by register/login. Send credentials:include; never store tokens in frontend storage. In Swagger UI execute login/register first: the browser manages the HttpOnly cookie automatically; do not paste tokens in Authorize.',
      },
    },
    schemas: {
      Error: object(
        {
          error: object({ code: string, message: string, fields: {} }, ['code', 'message']),
          requestId: string,
        },
        ['error']
      ),
      User: object({
        id: { ...string, format: 'uuid' },
        name: string,
        email: { ...string, format: 'email' },
      }),
      Domain: object(
        {
          hostname: string,
          status: { type: 'string', enum: ['verified', 'pending'] },
          added: datetime,
          proof: object({ type: { type: 'string', enum: ['TXT'] }, name: string, value: string }),
        },
        ['hostname', 'status', 'added']
      ),
      ShortLink: shortLink,
      LinkDraft: object(draftProperties, ['title', 'destination', 'domain']),
      LinkPatch: {
        ...object(
          {
            title: draftProperties.title,
            destination: draftProperties.destination,
            slug: draftProperties.slug,
            tags: draftProperties.tags,
            category: draftProperties.category,
            expiresAt: nullableDate,
            archived: { type: 'boolean' },
            status: { type: 'string', enum: ['active', 'archived'] },
            protected: { type: 'boolean' },
            password: {
              ...draftProperties.password,
              nullable: true,
              description:
                'String sets/replaces password; null removes. protected=false removes; true requires an existing/new password.',
            },
          },
          []
        ),
        minProperties: 1,
      },
      LinkPage: object({
        items: array(ref('ShortLink')),
        total: integer,
        page: integer,
        pageSize: integer,
        totalPages: integer,
      }),
      Facets: object({
        counts: object({
          all: integer,
          active: integer,
          expiring: integer,
          expired: integer,
          archived: integer,
        }),
        tags: array(object({ name: string, count: integer })),
        categories: array(object({ name: string, count: integer })),
      }),
      AnalyticsReport: object({
        timeline: array(
          object({
            date: { ...string, format: 'date' },
            clicks: integer,
            visitors: integer,
            conversions: { type: 'integer', enum: [0] },
          })
        ),
        total: integer,
        visitors: integer,
        conversions: { type: 'integer', enum: [0] },
        channels: array(object({ ...breakdown, detail: string, color: string })),
        referrers: array(object({ ...breakdown, detail: string, color: string })),
        geography: array(object({ ...breakdown, code: string, color: string })),
        devices: array(object({ ...breakdown, color: string })),
        systems: array(object(breakdown)),
        leaders: array(
          object({
            link: ref('ShortLink'),
            clicks: integer,
            conversions: { type: 'integer', enum: [0] },
          })
        ),
        sourceName: string,
        peakHour: {
          ...string,
          nullable: true,
          description: 'Peak UTC hour, earliest tie; null for no clicks',
        },
        from: datetime,
        to: datetime,
        csv: object({
          name: string,
          content: string,
          type: { type: 'string', enum: ['text/csv'] },
        }),
      }),
    },
  },
  paths: {
    '/health': {
      get: operation(
        'PostgreSQL readiness (Redis is optional)',
        'Operations',
        object({ status: { type: 'string', enum: ['ok'] } }),
        { public: true }
      ),
    },
    '/api/openapi.json': {
      get: {
        summary: 'OpenAPI document',
        tags: ['Operations'],
        security: [],
        responses: {
          '200': { description: 'OpenAPI 3.0.3 document', content: json({ type: 'object' }) },
        },
      },
    },
    '/api/docs': {
      get: {
        summary: 'Swagger UI',
        tags: ['Operations'],
        security: [],
        responses: {
          '200': {
            description: 'Swagger interactive documentation',
            content: { 'text/html': { schema: string } },
          },
        },
      },
    },
    '/api/auth/register': {
      post: {
        ...register,
        responses: {
          ...register.responses,
          '201': {
            description: 'Account created and cookie set',
            content: json(envelope(ref('User'))),
            headers: cookieHeaders,
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        ...login,
        responses: {
          ...login.responses,
          '200': {
            description: 'Signed in and cookie set',
            content: json(envelope(ref('User'))),
            headers: cookieHeaders,
          },
        },
      },
    },
    '/api/auth/me': {
      get: operation('Read signed-in user', 'Auth', ref('User')),
      patch: operation(
        'Update profile (current password required for email changes)',
        'Auth',
        ref('User'),
        {
          request: object(
            {
              name: { ...string, minLength: 1, maxLength: 100 },
              email: authProperties.email,
              password: { ...authProperties.password, writeOnly: true },
            },
            ['name']
          ),
        }
      ),
    },
    '/api/auth/logout': { post: logout },
    '/api/domains': {
      get: operation(
        'List owned domains plus configured default host',
        'Domains',
        array(ref('Domain'))
      ),
      post: operation(
        'Reserve DNS hostname and obtain actual TXT ownership proof',
        'Domains',
        ref('Domain'),
        {
          status: '201',
          request: object({ hostname: string }),
          description:
            'Hostname only; no scheme/path/port. Hostnames globally unique; pending domains cannot be used for links.',
        }
      ),
    },
    '/api/domains/verify': {
      post: {
        ...operation('Verify actual DNS TXT record', 'Domains', ref('Domain'), {
          request: object({ hostname: string }),
          description:
            'Resolve _linkflow.<hostname>; joined TXT chunks must equal linkflow-verification=<proof>. No simulated success.',
        }),
        responses: {
          ...errors,
          '200': { description: 'Verified domain', content: json(envelope(ref('Domain'))) },
          '422': {
            description: 'DNS lookup unavailable, missing TXT, or proof mismatch',
            content: json(ref('Error')),
          },
        },
      },
    },
    '/api/links': {
      get: operation('List owned nondeleted links', 'Links', ref('LinkPage'), {
        parameters: listParameters,
      }),
      post: operation('Create owned link and reserve alias atomically', 'Links', ref('ShortLink'), {
        status: '201',
        request: ref('LinkDraft'),
      }),
    },
    '/api/links/facets': {
      get: operation(
        'Counts, categories, and tags of all owned nondeleted links',
        'Links',
        ref('Facets')
      ),
    },
    '/api/links/export': {
      get: exportOperation(
        'Export all matching owned links (same filters, pagination ignored)',
        listParameters
      ),
    },
    '/api/links/bulk': {
      post: operation(
        'Atomically archive, restore, or soft-delete owned links',
        'Links',
        object({ affected: integer }),
        {
          request: object({
            ids: {
              ...array({ ...string, format: 'uuid' }),
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
            },
            action: { type: 'string', enum: ['archive', 'restore', 'delete'] },
          }),
          description:
            'Entire operation fails if any ID is absent, deleted, or foreign; no partial mutations.',
        }
      ),
    },
    '/api/links/{id}': {
      get: operation(
        'Read owned nondeleted link with authoritative lifetime clicks',
        'Links',
        ref('ShortLink'),
        { parameters: [idParameter] }
      ),
      patch: operation(
        'Edit owned link including slug, lifecycle and password',
        'Links',
        ref('ShortLink'),
        {
          parameters: [idParameter],
          request: ref('LinkPatch'),
          description:
            'Domain cannot change. Old aliases become 404 and remain permanently reserved. Same link may reclaim its own old slug.',
        }
      ),
      delete: {
        summary: 'Soft-delete owned link; alias permanently reserved; historical events retained',
        tags: ['Links'],
        security: [{ sessionCookie: [] }],
        parameters: [idParameter],
        responses: { '204': { description: 'Deleted' }, ...errors },
      },
    },
    '/api/links/{id}/qr': {
      get: {
        summary: 'Owned QR encoding authoritative shortUrl',
        tags: ['Links'],
        security: [{ sessionCookie: [] }],
        parameters: [
          idParameter,
          parameter(
            'format',
            { type: 'string', enum: ['svg', 'png'], default: 'svg' },
            'Genuine SVG or 512px PNG QR'
          ),
        ],
        responses: {
          '200': {
            description: 'QR image, private no-store',
            content: {
              'image/svg+xml': { schema: string },
              'image/png': { schema: { type: 'string', format: 'binary' } },
            },
          },
          ...errors,
        },
      },
    },
    '/api/analytics': {
      get: operation(
        'Actual persisted-click analytics report',
        'Analytics',
        ref('AnalyticsReport'),
        {
          parameters: rangeParameters,
          description:
            'Range-distinct visitors are not summed daily uniques. All breakdown counts conserve total clicks. UTC timeline zero-fills dates. Leaders top 10 by in-range clicks; ShortLink clicks lifetime. Geography Unknown only. Compatibility conversions/growth zero, not measured. Historical deleted-link events retained.',
        }
      ),
    },
    '/api/analytics/export': {
      get: exportOperation(
        'Export CSV from the same analytics report and range/scope',
        rangeParameters
      ),
    },
    '/r/{slug}': {
      get: redirect(false, false),
      head: redirect(false, false),
      post: redirect(false, true),
    },
    '/{slug}': {
      get: redirect(true, false),
      head: redirect(true, false),
      post: redirect(true, true),
    },
  },
};
