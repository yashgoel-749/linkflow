# Local backend implementation

## Phases

- [x] Ground: inspect frontend state, authentication, URL and report consumers.
- [x] Sketch: compare feature modules with explicit repository/service layering.
- [x] Agree: proceed with feature modules and explicit HTTP contracts below.
- [x] Implement: persistent API, API-backed frontend, local services.
- [x] Verify: migrations, API integration tests, browser tests, builds.
- [x] Reconcile: update this document with verified results and any deviations.

## Grounding and synthesis

Before implementation, the provider owned in-memory links/profile/domains and login only navigated. Dashboard and Analytics fabricated reports from seeded totals. QR rendering encoded unreachable demo domains. These sources were replaced with authenticated persisted APIs and actual click reports.

Two independent designs compared feature modules (routers/schemas/services colocated) against global repository/service layers. Use feature modules: fewer forwarding wrappers and clearer feature ownership. Borrow the second design's cache rule: Redis caches routing hints, but a PostgreSQL lifecycle check remains authoritative so cache-fill races cannot revive deleted/archived/expired links. No separate cross-judge was run; both designs agreed on this security boundary.

Rubric: ownership on every private query; actual durable click counts; no synthetic frontend reports; database-enforced unique aliases; executable local setup/tests; small, traceable module boundaries.

## Contracts (implementation agreement)

Base `/api`, JSON `{ data: T }`; errors `{ error: { code: string, message: string, fields?: unknown }, requestId?: string }`. Cookie JWT authentication, HttpOnly SameSite=Lax; exact allowed Origin enforced on unsafe cookie-authenticated requests. JWT session revocation in PostgreSQL. Login/register set cookies; logout revokes and clears. Frontend requests include credentials; never stores tokens.

- `POST /auth/register` `{name,email,password,remember?:boolean}` => user `{id,name,email}`.
- `POST /auth/login` `{email,password,remember?:boolean}` => user.
- `GET /auth/me` => user; `POST /auth/logout` => 204.
- `PATCH /auth/me` `{name,email?}` => user (password required to change email, otherwise reject email change).
- `GET /domains` => `[{hostname,status:'verified'|'pending',added:string}]`. Always include configured default redirect host.
- `POST /domains` `{hostname}` => domain with DNS TXT proof information.
- `POST /domains/verify` `{hostname}` => domain after actual DNS ownership verification. No simulated success.
- `GET /links` query `page,pageSize,q,status,category,tag,sort` => `{items:ShortLink[],total,page,pageSize,totalPages}`; pageSize max 100. `GET /links/facets` => counts/tags/categories. `GET /links/export` => CSV matching filters.
- `POST /links` body matches frontend `LinkDraft`: `{title,destination,slug,domain,tags,protected,expiresAt,password?:string,category?:string}`. Empty slug generates code. Protected requires password.
- `GET /links/:id` => current owned `ShortLink`, or 404 for missing or foreign IDs.
- `PATCH /links/:id` supports title/destination/tags/category/expiresAt/slug, archive state, password setting/removal.
- `DELETE /links/:id` => 204, soft-delete and permanently reserve alias.
- `POST /links/bulk` `{ids,action:'archive'|'restore'|'delete'}` => `{affected}`; atomic ownership validation, max 100 IDs.
- `GET /links/:id/qr?format=svg|png` => owned QR image encoding authoritative `shortUrl`.
- `GET /r/:slug` on default host => 302 destination, valid current lifecycle required; expired/archived => 410, absent/deleted => 404. HEAD does not record. Password-protected GET challenges; POST `/r/:slug` verifies password, then records/redirects. Verified custom hosts use `/:slug` with explicit hostname resolution.
- `GET /analytics?days=31&source=all|everything|<linkId>` => report shape below. UTC rolling calendar days including today. Optional `from,to` ISO overrides for explicit half-open range (max 366 days).
- `GET /analytics/export` same range/scope => CSV from same report.

`ShortLink = {id,title,destination,slug,domain,shortUrl,tags:string[],category,status:'active'|'expiring'|'expired'|'archived',clicks:number,growth:number,createdAt:number,author:string,protected:boolean,expiresAt:string|null}`. Growth unavailable = 0, not presented as measured growth. Domain may contain default localhost port; shortUrl MUST be used instead of reconstructing HTTPS URLs.

`AnalyticsReport = {timeline:[{date:string,clicks:number,visitors:number,conversions:number}], total:number, visitors:number, conversions:number, channels:[{name,detail,share,count,color}], geography:[{name,code,share,count,color}], devices:[{name,share,count,color}], systems:[{name,share,count}], leaders:[{link:ShortLink,clicks:number,conversions:number}], sourceName:string, peakHour:string|null, from:string,to:string, csv:{name,content,type}}`.

Counts derive from actual redirect events. Visitors are range-distinct privacy-preserving hashes (estimates); daily uniques are not summed for period uniques. Device/OS/referrer parsed from request, no full IP/referrer-query storage. Geography is Unknown unless a trusted geolocation source exists. Conversion fields remain compatibility zeros but UI clearly says unavailable and does not imply measured conversion tracking. All breakdown counts conserve clicks. Backend CSV labels unsupported metrics unavailable. Default new accounts are empty.

## Local infrastructure

Separate `server/` package with Express/TypeScript, Prisma PostgreSQL migrations, Redis client, Zod validation, Swagger document and integration tests. No Docker. Root convenience scripts orchestrate frontend/server. Environment examples contain placeholders only; real local credentials stay ignored. Integration tests use a separate explicitly named test database and real Redis.

## Security and reliability

Password hashing, bounded input/body sizes, helmet, exact CORS/Origin, rate limiting, JWT algorithm/issuer/audience/expiration checks, revocable sessions, scoped ownership queries, safe CSV serialization and errors without stack traces. Slugs normalized to lowercase and globally unique by domain; generated collisions retry under database constraint. No arbitrary destination fetching. Redirect records click before sending response; database failure returns 503, not an uncounted success. Redis outage bypasses cache, never authorization/lifecycle. Custom-domain DNS verification does not provision certificates or production hosting.

## Final reconciliation and results

The report additionally includes `referrers: [{name,detail,share,count,color}]`, grouped by the recorded hostname with Direct for absent referrers. `channels` remains a separate marketing-channel summary. The Analytics page and CSV expose real hostnames without paths or queries.

`source=all` includes current active/expiring links only. `everything` and owned UUID reports retain archived, expired, and soft-deleted history. Aliases remain permanently reserved after edits and deletion. Protected GET returns a 401 HTML challenge; exact-origin form unlock was verified in Chromium, including a cross-origin redirect. Cookie-authenticated mutations use session epochs so delayed results cannot revive a logged-out account.

Verified locally: 16 PostgreSQL/Redis backend tests; 13 Chromium tests against the development frontend; 13 against production preview; both builds; lint; browser test type-check; responsive screenshot/overflow checks. The running API also passed a real Redis process outage/recovery check with exactly two durable clicks and archive enforcement. No Docker was added.

The UI uses loaded owned inventory for immediate list filters/pagination; the API independently supports server-side filters, facets, and pagination. All-time presentation is explicitly capped to the supported reporting window. Conversions, growth, geography beyond Unknown, billing, OAuth, reset email, and collaboration remain unavailable rather than simulated. Positive DNS ownership and production TLS/custom-host routing require external manual verification.
