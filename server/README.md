# LinkFlow server

Persistent Express 5 / TypeScript API with Prisma 6.19, PostgreSQL, Redis, cookie JWT sessions, Zod 4 validation, actual click analytics, QR images, and Swagger.

## Local setup (no Docker)

Requirements: Node 22+, npm, native PostgreSQL 16+ and Redis. Create an application database and a separate `linkflow_test` database. Give the application role schema creation/migration permissions. Do not use a production database for tests.

From `server/`:

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env with private database credentials and two distinct random secrets.
npm run db:generate
npm run db:migrate
npm run dev
```

`db:migrate` deploys checked-in SQL migrations; nothing automatically runs `db push`, migrates on server startup, seeds accounts, or fabricates metrics. `npm run build` emits `dist/`; `npm start` runs the built server.

The current local service configuration is port 3001, `PUBLIC_BASE_URL=http://localhost:3001`, frontend origins `http://localhost:5173,http://localhost:4173`, and Redis `redis://127.0.0.1:6379`. Database port/credentials belong in the ignored `.env`, not this document. `.env.test` is also ignored. Root `.local` infrastructure is not managed by this package.

Generate each secret separately:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Required variables: `DATABASE_URL` (PostgreSQL), `JWT_SECRET` and `VISITOR_SECRET` (at least 32 characters each). Optional variables are documented in `.env.example`. Production requires an HTTPS public origin and sets Secure cookies. Host/path/scheme in `PUBLIC_BASE_URL` are validated; it must be an origin, not a path.

## API and Swagger

- JSON API: `http://localhost:3001/api`
- Swagger UI: `http://localhost:3001/api/docs/`
- Complete OpenAPI JSON: `http://localhost:3001/api/openapi.json`
- PostgreSQL readiness: `GET /health` (Redis is optional)

Success JSON is `{data:T}`; errors are `{error:{code,message,fields?},requestId}`. Downloads and redirects are not wrapped. Login/register set an HttpOnly `linkflow_session` cookie. Frontend fetch calls must use `credentials:'include'`; never save JWTs in frontend storage.

Every unsafe `/api` request, including login/register, requires an exact Origin from `FRONTEND_ORIGIN` or the explicitly configured `PUBLIC_BASE_URL` origin. Missing Origin, `null`, lookalike subdomains, and trailing-slash variants are rejected. CLI requests must supply an allowed Origin. The public API origin is admitted so Swagger works: execute register/login in Swagger, then execute owned endpoints. The browser retains the HttpOnly cookie automatically; Swagger is configured with credentials and does not need access to the token. Do not paste tokens into Authorize.

Owned endpoints include `GET /api/links/:id` (detail, added to the agreed list/read contract). Refer to Swagger for all body/query schemas, responses, errors, limits, image formats, CSV outputs, and ownership behavior.

## Data and security decisions

- Each private resource query is ownership-scoped. Foreign and absent links/domains both return 404. Bulk validates every ID and changes all or none, with a maximum of 100 distinct UUIDs.
- Passwords are scrypt-hashed with N=65536, r=8, p=2, a random 16-byte salt, and a 64-byte output. Hash work is globally bounded to four jobs; excess work returns 503. Hashes/passwords never appear in API responses.
- JWT checks enforce HS256, issuer, audience, subject/session IDs, issued-at, and expiration. Every authenticated request also validates its durable PostgreSQL session, including expiry and revocation. Logout revokes before clearing the cookie. Normal sessions expire in one day; remembered sessions/cookies in 30 days.
- Slugs are canonical lowercase and database-unique by domain. A permanent Alias table reserves every allocated alias. Editing removes routing from the old slug but never releases it to another link. The same still-owned nondeleted link may reclaim its own earlier alias. Deleted links cannot be restored or edited and every allocated alias remains reserved permanently.
- Link state is current PostgreSQL data. Archived/expired redirects return 410; missing/deleted/old aliases return 404. Redis contains only an ID hint with 60-second TTL. Current domain/slug/password/lifecycle are rechecked under a row lock before recording and redirecting. Cache races cannot revive a link. Click persistence failure returns 503 without a Location header.
- Public `GET /r/:slug` redirects on the exact configured default Host; custom `/:slug` routes require a verified hostname. Forwarded Host/IP headers are not trusted. HEAD never counts. Responses are no-store so caches cannot bypass lifecycle checks or click persistence.
- Protected GET/HEAD returns a 401 HTML challenge without the destination. An escaped HTML form POSTs to the same redirect path. POST accepts JSON or URL-encoded password and requires the exact public redirect origin (or a configured API/frontend origin); wrong passwords never count. A password edit during unlock is detected and requires retry. Redirect pages use a same-origin referrer policy to retain form Origin while suppressing referrers to external destinations. Their CSP permits HTTP(S) form redirects without naming or exposing the destination.
- No destination fetching occurs. Only HTTP(S) destinations without embedded credentials are accepted. JSON bodies are limited to 32 KiB; redirect forms to 2 KiB. Helmet, exact CORS, and scoped rate limits are enabled.
- Redis commands have a 200ms deadline and bounded queue. Outage bypasses cache; local rate limits remain enforced even across Redis recovery. Local counters have a 10,000-key hard cap with expired-key cleanup; saturation fails closed. `REDIS_NAMESPACE` isolates service/test keys. Single-process local fallback is supported; production multi-instance deployments need shared-limit reliability and a reviewed proxy configuration.

## Analytics semantics

`source=all` means currently nondeleted, nonarchived, unexpired owned links (includes expiring). `source=everything` includes all owned historical clicks, including archived, expired, and soft-deleted links. An owned UUID selects that link's history, including after deletion. Private lists/facets/link exports exclude deleted links. Historical leaders show deleted links as `archived` because the compatibility ShortLink status has no `deleted` variant.

`days=31` is a UTC calendar range including today, ending next UTC midnight. Explicit `from` and `to` must both be ISO instants; range is half-open `[from,to)` and at most 366 days. UTC timestamp defaults and explicit raw-query bindings prevent PostgreSQL session timezone shifts. Zero-click calendar dates are included. Report snapshots use repeatable-read transactions.

Clicks count committed redirect events. Visitors are range-distinct HMAC(IP + bounded user-agent) estimates; daily distinct visitors are not summed into period visitors. No full IP, raw user-agent, or referrer query/path is stored. Referrer hostname, parsed device, and OS generate actual breakdowns; all breakdown counts conserve total clicks. Geography is Unknown because no trusted geolocation source exists. Top 10 leaders use range click counts; nested ShortLink clicks are lifetime counts. Peak hour is UTC with earliest-hour tie breaking; empty reports use null.

Conversions and growth are unavailable, with compatibility zero fields only. CSV labels them `Unavailable`. Both link/report CSV exports quote all cells, double quotes, use CRLF, and neutralize spreadsheet formula prefixes (including leading whitespace/control characters). Report CSV and `/analytics/export` come from the same report builder. Link CSV exports all matching filters, not just the current page.

## DNS and deployment boundary

Domain creation returns `{proof:{type:'TXT',name:'_linkflow.<hostname>',value:'linkflow-verification=<random-proof>'}}`. Publish that TXT record, then POST `/api/domains/verify`. Verification uses actual DNS resolution and exact TXT match; no simulated success. Pending domains cannot be used. Verification does **not** provision DNS routing, certificates, reverse proxies, or production hosting. Those must direct the verified hostname to this server over HTTPS without changing the validated Host.

See [verification.md](docs/verification.md) for executable verification and known manual checks.
