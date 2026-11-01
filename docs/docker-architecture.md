# Docker architecture

## Images and build stages

`Dockerfile` builds the frontend with Node 22. `npm ci` uses the lockfile, then TypeScript and Vite produce static assets. `VITE_API_URL=/api` makes browser requests use the public proxy origin. The final stage contains nonroot Nginx and `dist`, not Node, source code, or build dependencies. It listens on 8080. Its health check requests `/frontend-health`. Static assets use immutable caching, while the SPA entry document is not cached.

`server/Dockerfile` has a common Node 22 Debian base with OpenSSL and CA certificates for Prisma. The dependency stage installs locked packages and generates Linux Prisma binaries. Its build-only database URL is a dummy localhost URL, not a credential for a real database. The build stage compiles TypeScript and removes source maps. The production dependency stage installs without development or optional packages, then copies the generated Prisma client. This excludes Prisma's optional CLI and TypeScript peers. Build assertions reject either tool in the runtime dependencies.

The backend's `runtime` stage contains production dependencies, compiled code, and the secret bootstrap. It runs as the Node user on port 3001. The `migrate` stage retains the installed Prisma CLI, schema, and versioned migrations. The `test` stage retains development dependencies and test source. Neither migration nor test tooling enters the runtime stage.

`server/docker/entrypoint.mjs` reads mounted secrets, constructs encoded PostgreSQL and Redis URLs internally, and starts the requested command. It rejects conflicting plaintext configuration, invalid endpoints, unreadable secrets, and identical application/test names. It forwards termination signals and child exit status. URLs are process environment values inside the container, not image layers or Compose-interpolated values. A Docker host administrator can still access container secrets. File-backed Compose secrets are not an encrypted secret-management service.

`docker/nginx/Dockerfile` uses a separate, small proxy build context. Its nonroot startup script validates the public origin, renders a local or HTTPS template into `/tmp`, checks Nginx syntax, then starts Nginx. Certificates remain mounted files. The proxy and static server are separate so TLS, aliases, and API routing do not enter frontend build logic.

The root, server, and proxy `.dockerignore` files exclude private configuration and unrelated files. The frontend and proxy use allowlists. Host `node_modules`, existing build output, Neon credentials, secret files, and private keys never enter the application build contexts.

## Compose services

| Service        | Purpose and lifecycle                                                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`     | PostgreSQL 16 with persistent application data. A file supplies the bootstrap administrator password. The empty-volume init script creates a nonsuperuser `linkflow` role and separate app/test databases. `pg_isready` gates migration startup.                 |
| `redis`        | Authenticated Redis 7.4. Its startup script creates a private temporary config instead of putting a password in argv. AOF stores state in `/data`; the health script authenticates without printing its password.                                                |
| `migrate`      | One-shot `prisma migrate deploy` using the checked-in migrations. It waits for PostgreSQL health, exits with the CLI status, and does not restart. Backend startup requires its success.                                                                         |
| `backend`      | Compiled Express API, authentication, redirects, DNS verification, and analytics. Its health check queries the real PostgreSQL-backed `/health`. Redis failure does not make this health endpoint fail because bounded cache/rate-limit fallback is intentional. |
| `frontend`     | Static React SPA served by its own nonroot Nginx. Frontend routes fall back to `index.html`.                                                                                                                                                                     |
| `nginx`        | Public reverse proxy and production TLS endpoint. Only this service publishes host ports. It waits for backend and frontend health.                                                                                                                              |
| `migrate-test` | Optional `test` profile job. It migrates `linkflow_test` independently of application data.                                                                                                                                                                      |
| `api-tests`    | Optional `test` profile runner using the real test database and Redis. It waits for test migration success. It does not start by default.                                                                                                                        |

All long-running services use `unless-stopped`, bounded health checks, and rotated JSON logs. Every service runs nonroot, drops capabilities, and uses a read-only root filesystem with writable temporary mounts. PostgreSQL starts directly as its official `postgres` user against owned data storage. This preserves its supplemental secret-reading group instead of losing that group in a root-to-postgres user switch. Backend uses an init process and graceful shutdown. Secret files are read-only mounts with a configured supplemental group.

The database role owns the app and test schemas so Prisma can apply migrations. It is not a superuser, but it is not a separate DML-only runtime role either. Deployments needing stricter database privilege separation must provision separate migration and application roles.

## Request routing and proxy trust

```text
Browser
  → Nginx public HTTP or HTTPS
      → canonical host /api and /r → backend:3001
      → canonical host SPA routes → frontend:8080
      → custom host alias paths → backend:3001
          → PostgreSQL and Redis
```

The proxy preserves raw Host, including a local port, request URI, body, Origin, and cookies. It replaces `X-Forwarded-For` with the connecting client's address and removes supplied forwarded Host values. Express trusts only the proxy's configured private IP. Arbitrary direct headers cannot change client identity or redirect domains.

Nginx uses Docker DNS with variable upstreams to recover after container recreation. It does not cache API or redirect responses. Production HTTP redirects to the configured HTTPS origin rather than reflecting arbitrary Hosts. Password-protected alias forms and Swagger retain backend security headers.

## Networks

| Network | Members and boundary                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`   | Nginx and frontend only. Internal network with no external route.                                                                                                                         |
| `proxy` | Nginx and backend. A small configured subnet assigns Nginx a stable trusted IP outside the dynamic allocation range. Backend retains outbound connectivity here for DNS ownership checks. |
| `data`  | PostgreSQL, Redis, backend, migration jobs, and API tests. Internal network. Database services have no published host ports.                                                              |

Docker service names provide private DNS names. These networks are traffic boundaries, not encryption or isolation from a Docker host administrator. Do not attach untrusted containers to them.

## Volumes and temporary mounts

`postgres_data` maps to `/var/lib/postgresql/data` and stores users, sessions, links, clicks, and Prisma migration history. PostgreSQL init scripts run only when this volume is empty. Restarting or recreating the container does not reinitialize it.

`redis_data` maps to `/data` and stores Redis AOF files. Redis is a cache, but persisted rate-limit windows also survive ordinary restart. AOF uses `everysec`, so an abrupt host failure can lose about a second of Redis writes. PostgreSQL remains the durable source for link lifecycle and accepted clicks.

Compose prefixes volume and network names with the project name. `linkflow-docker`, `linkflow-production`, and verification projects therefore keep independent storage. Changing a project name selects different volumes; it does not migrate data.

`/tmp` mounts hold Nginx config/PIDs/body buffers, Redis's generated config, and runtime temporary files. PostgreSQL also has a temporary socket directory. These mounts are not application storage and disappear on recreation. Source-bound init/start scripts and file-backed secrets are read-only, not data volumes.

## Production override

`docker-compose.prod.yml` changes the public proxy to HTTPS, adds mounted TLS files, requires a public origin, enables production backend validation and Secure cookies, and sets service resource limits. `ports: !override` replaces local published ports instead of merging them. It does not duplicate the shared service topology.

Local HTTP uses compiled production-style images with `NODE_ENV=development` only for HTTP-compatible cookies. The production override uses `NODE_ENV=production`. Public production requires operator-owned DNS, valid certificates, file permissions, monitoring, and backups.
