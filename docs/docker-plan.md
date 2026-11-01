# Docker implementation plan

## Phases

- [x] Ground: inspect runtime configuration, routing, authentication, Prisma, and Docker Desktop.
- [x] Sketch: compare two container layouts and migration lifecycles.
- [x] Agree: select the topology and secret boundaries.
- [x] Implement: images, Compose, proxy, setup and verification scripts.
- [x] Verify: real builds, API/browser behavior, restart persistence, production TLS.
- [x] Reconcile: document commands, limits, and verified results.

## Existing boundaries

The frontend is a static Vite build; its API URL is compiled at build time. The API needs PostgreSQL, Redis, private JWT/visitor secrets, exact frontend/public Origins, and a correct public redirect Host. Production requires HTTPS and Secure cookies. Private URLs in `server/.env` currently target Neon and must not enter build contexts or container images.

Redirects use PostgreSQL row locks and record clicks before redirect. Nginx must preserve Host and password-form bodies, route `/api` and `/r` to the backend, and keep frontend history routes working. Custom-host root aliases must reach the backend rather than silently becoming SPA pages. Proxy-derived client IPs must be trusted only from the private proxy network, not arbitrary forwarded headers.

## Candidate rubric

Grade secret isolation, preserved auth/redirect semantics, migration ordering and failure behavior, data persistence/network boundaries, maintainability, and executable development/production verification. Designs are compared before files are implemented. The local stack must be independent of the operator's Neon projects.

## Chosen contract

Two independent sketches compared a shared Compose topology with production overrides against separate duplicated Compose files and startup migrations. Both preferred one-shot migration jobs for production. Choose shared `docker-compose.yml` plus `docker-compose.prod.yml` overrides: less duplication, verified merged configuration. The cross-family judge was skipped; no alternate model was requested/configured. Borrow explicit secret-file permissions and credential-rotation cautions from the second sketch.

Frontend builds with `/api` and serves static files as a nonroot process. Only Nginx publishes ports. PostgreSQL and authenticated Redis use persistent named volumes on an internal data network; an additional frontend network and proxy network isolate application traffic. The proxy has an explicit private IP trusted by Express and replaces rather than appends inbound forwarding headers. Backend retains outbound connectivity for DNS verification.

One-shot `migrate` must exit successfully before backend startup; the test profile has a separate test database/migration job. Backend Dockerfile has runtime, migrate, and test targets. Runtime receives file-backed database/Redis/JWT/visitor secrets, not URLs or passwords in Compose environment interpolation. Production requires a separately supplied TLS certificate and private key, HTTPS public origin, Secure cookies, and separate project volumes.

Setup adds only nonsecret Docker settings to the root `.env`, preserving frontend and Neon files. Generated private Docker secret files live under ignored `.local/docker-secrets`. Existing Neon credentials never enter any image. Verification includes actual Docker build/start, browser and API tests, persistence across down/up without deleting volumes, proxy spoof rejection, runtime image inspection, and local production TLS testing.

## Verified results

Verification ran on Docker Desktop 4.97.0, Engine 29.9.2, and Compose 5.6.1 in Linux-container mode on Windows. The local origin is `http://localhost:18080`. Production-mode verification used the separate `linkflow-production-test` project at `https://localhost:8443` with a temporary self-signed certificate.

| Check                                             | Result                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local and merged production Compose configuration | Validated; both stacks built and started with `up --build -d`.                                                                                                                  |
| Prisma migrations                                 | Both checked-in migrations applied. Repeat migration jobs reported no pending migrations.                                                                                       |
| Real PostgreSQL and Redis backend tests           | All 18 passed, including the final fresh migration and API test jobs.                                                                                                           |
| Chromium browser tests through Nginx              | All 13 passed over local HTTP; all 13 passed over production-mode HTTPS.                                                                                                        |
| Linux container boundary tests                    | All 10 passed, including exact proxy trust, HTTPS configuration, secret rejection, exit status, and SIGTERM forwarding.                                                         |
| Final application smoke checks                    | Local and HTTPS persisted authentication, links, analytics, Origin rejection, unknown Host rejection, and SPA routes passed. Final HTTPS writes, PNG QR, and CSV export passed. |
| Cookie security                                   | Local HTTP cookie settings and production `Secure`, `HttpOnly`, and `SameSite=Lax` flags passed.                                                                                |
| Proxy identity                                    | Distinct disposable clients produced four clicks and three visitors. Forged forwarded headers did not create identities.                                                        |
| Persistence and Redis outage                      | Sessions, links, and recorded clicks survived local and HTTPS stack recreation without deleting volumes. Local checks passed while Redis was stopped and after recovery.        |
| Migration failure                                 | A deliberately missing database failed migration and left backend `Created`. The deployment script restored the stack.                                                          |
| Runtime and secret isolation                      | Runtime excluded source, tests, `.env`, Prisma CLI, and TypeScript. Local and production decoded gzip image-layer audits found no mounted secret bytes.                         |
| Backup restoration                                | Binary-safe backup restored into separate `linkflow_restore_verify`, with 14 users and 10 clicks.                                                                               |
| Linux permissions                                 | Fresh nonroot PostgreSQL initialization passed with Linux-owned `0640` secret files and supplemental group 1000.                                                                |
| Setup idempotence                                 | Rerunning setup preserved `.env` and existing secrets byte-for-byte.                                                                                                            |
| Static checks                                     | ESLint, test TypeScript checks, and Prettier passed.                                                                                                                            |

The final runtime installs locked dependencies with `npm ci --omit=dev --omit=optional` and copies the generated Prisma client. Pruning alone retained optional Prisma CLI and TypeScript peers, so build assertions now reject those tools. PostgreSQL starts directly as `postgres` to retain its supplemental secret-reading group. Nginx's static trusted IP sits outside the dynamic allocation range.

Test commands use fresh `--rm --no-deps` jobs with migration first. The smoke script waits for readiness after recreation. Backend requests restart propagation for Compose-managed PostgreSQL updates, not for engine-managed crash recovery.

## Deployment limits and retained data

This verifies production behavior on localhost, not a public production deployment. The operator must supply DNS, valid certificate coverage for every served hostname, Linux file permissions, monitoring, and off-host backups. The temporary test certificate is not suitable for deployment. Resource limits have not been load-tested.

The temporary HTTPS and Linux permission-test stacks are stopped after verification. Their volumes and secret fixtures remain intact. The local application remains available on port 18080. Private smoke fixtures and the verified backup remain under ignored `.local/`. Native services and Neon configuration remain independent and unchanged. No database volumes were deleted.

Read [Docker operations](docker.md) for startup, deployment, backup, credential rotation, and troubleshooting. Read [Docker architecture](docker-architecture.md) for image stages, services, networks, and storage.
