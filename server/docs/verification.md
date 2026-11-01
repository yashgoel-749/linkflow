# Backend verification

## Repeatable integration suite

Tests require real PostgreSQL and Redis; they do not substitute mocked databases. The test URL is mandatory. Its database name must end in `_test` or contain `_test_`, unless the operator explicitly confirms a separate Neon test endpoint with `TEST_DATABASE_NEON_ENDPOINT`. For this Neon opt-in, the application URL is also required and the endpoint must differ. This is an operator confirmation, not automatic discovery of Neon projects.

Create ignored `server/.env.test`:

```dotenv
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/linkflow_test?schema=public
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=replace-with-unique-test-secret-at-least-32-characters
VISITOR_SECRET=replace-with-different-test-secret-at-least-32-characters
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:4173
PUBLIC_BASE_URL=http://localhost:3001
```

With native services running, from `server/`:

```powershell
npm ci
npm run db:generate
npm run db:migrate:test
npm run build
npm test
npm audit
```

`db:migrate:test` explicitly deploys the same checked-in migrations to `TEST_DATABASE_URL`. Tests never `db push` or auto-migrate. The runner refuses the app database and overrides `DATABASE_URL` only after checking the test name or confirmed Neon endpoint. It normalizes pooled/direct Neon hostnames and ignores credential/query differences when comparing database identity. Each run creates UUID-named users and its own random Redis namespace, then deletes only that run's owned records/keys on normal completion. No FLUSHALL, table truncation, or shared database shutdown occurs. A click-failure test installs an actual temporary PostgreSQL trigger scoped to one UUID, verifies 503/no redirect/no click, and removes it in `finally`.

If the machine's default Node is older than 22, run the suite with an isolated npm-provided Node 22 runtime:

```powershell
npm exec --yes --package=node@22 -- node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/integration.test.ts tests/pure.test.ts
```

The suite covers:

- Origin rejection, CORS credentials, unique normalized registration, password hash storage, cookie flags/remember duration, profile email-password checks, session expiry/revocation, wrong JWT algorithm/audience, logout reuse rejection.
- Empty accounts; concurrent alias uniqueness; generated/canonical aliases; private detail/list/update/delete/QR/export/facets/analytics ownership; pagination/filter status; atomic bulk archive/restore/delete and duplicate rejection.
- Cached destination edits, slug changes, stale deleted/archived/expired cache entries, permanent alias reservation, HEAD non-counting, password challenge/fail/success, replacement/removal, actual browser-style URL-encoded unlock from public origin.
- PNG decoding with independent jsQR to the exact authoritative shortUrl; SVG generation equality; safe CSV escaping and exports matching filters/report.
- UTC event defaults on non-UTC PostgreSQL; exact explicit range boundaries; cross-day visitor deduplication; conserved channels/referrer hostnames/geography/devices/OS; no conversions; historic deletion and distinct `all`/`everything` behavior.
- Real DNS failure/missing proof, scoped proof access, unverified-domain rejection, forged forwarded Host rejection, schema/body/range bad inputs, Swagger route coverage, actual click-insert DB failure, disconnected Redis fallback and actual local rate limit.

## Manual checks requiring external infrastructure/browser

1. **Positive DNS proof:** use a hostname you control, create the domain, publish the returned TXT record, then verify after propagation. Ensure mismatched TXT stays pending. Tests exercise actual negative DNS, not simulated positive proof. A successful custom-domain redirect additionally needs real hostname routing/TLS; this package intentionally does not provision it.
2. **Browser cookies/Swagger:** open `/api/docs/`, execute registration or login, then create/list a link without providing a token. Check HttpOnly cookie in browser storage and exact Origin network headers. Protected-link HTML form POST should redirect only with the correct password and add exactly one click. The parent/frontend verification owns browser coverage.
3. **Production HTTPS:** run behind reviewed TLS routing with `NODE_ENV=production`; confirm Secure cookie and actual custom-domain Host. `trust proxy` is intentionally disabled; do not enable it globally without defining trusted network hops.

## Dependencies

Prisma CLI/client stay pinned to stable 6.19.0 as requested. Its CLI's transitive Effect and deepmerge-ts dependencies are overridden to patched versions; generate/migrate/build/integration are exercised with those versions. Zod is patched 4.x. `npm audit` must be rerun after dependency updates; the committed lockfile defines exact resolved versions.

## Verified local results

On November 2, 2026, both SQL migrations deployed to the native PostgreSQL 16 application and test databases on port 5433. Redis on port 6379 returned PONG. The TypeScript build passed. All 16 tests passed with Node 22.23.4 and again through the Windows `npm test` command. Prisma's live database-to-schema diff reported no difference. `npm audit` reported zero vulnerabilities. Positive DNS ownership and production TLS remain external manual checks.

Final integration also passed all 13 connected Chromium tests against both the development frontend and production preview, including Swagger login, protected form unlock, and stale-session regressions. `scripts/verify-redis-outage.ts --stop-project-redis` verified the running API through an actual native Redis shutdown and restart. See the root [feature verification guide](../../docs/verification.md).

## Neon setup

The application's two checked-in migrations were deployed to both operator-provided Neon projects. Both use the database name `neondb`; the private `.env.test` explicitly confirms the separate test endpoint. A second deploy reported no pending migrations on either database. This applied the schema only; existing local user/link/click data was not copied.

All 18 backend tests passed against the Neon test database and local Redis, including two database-isolation safety tests. The connected browser creation/persistence/edit/redirect check also passed against the Neon application database. Builds, lint, formatting, and type-checks passed. The full 13-test browser suites recorded above were run against local PostgreSQL, not Neon.

Remote test runs need more time than local runs. For browser assertions, keep local defaults or opt in to a longer remote timeout:

```powershell
$env:PLAYWRIGHT_EXPECT_TIMEOUT = '30000'
npm run test:e2e -- --workers=1 --timeout=120000
```

This changes verification timing only, not application behavior or database transaction deadlines.
