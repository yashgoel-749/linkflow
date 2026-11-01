# Run LinkFlow with Docker

This stack uses its own PostgreSQL database and Redis storage. It does not read `server/.env` or change Neon databases. For the image, service, network, and volume explanations, read [Docker architecture](docker-architecture.md).

## Start on Docker Desktop

1. Start Docker Desktop in Linux-container mode. Use Docker Compose 2.24.4 or newer for the production `!override` syntax, and Node.js 22 for the setup script.
2. Open PowerShell in `C:\projects\linkflow`. If Docker is absent from PATH, run:

   ```powershell
   $env:PATH = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:PATH"
   docker version
   docker compose version
   ```

   Adding the directory also fixes `docker-credential-desktop` lookup during image pulls. Other Docker installations may use `C:\Program Files\Docker\Docker\resources\bin`.

3. Generate local secrets and add missing Docker settings without replacing existing files:

   ```powershell
   node scripts/docker-setup.mjs
   docker compose config --quiet
   docker compose up --build -d
   docker compose ps -a
   ```

4. Open the origin in `.env` under `DOCKER_PUBLIC_BASE_URL`. This workspace uses `http://localhost:18080` because another process owns port 8080. Swagger is at `/api/docs`. The migration job must exit with code 0. The five long-running services must become healthy.

The first build downloads base images and npm packages. The frontend builds with `/api` regardless of the native frontend's `VITE_API_URL`. Only Nginx publishes a loopback port.

## Stop and restart without losing data

```powershell
docker compose restart
docker compose down
docker compose up -d
```

`down` removes containers and networks, not named volumes. Keep the same project name, database settings, and secret files when restarting. **Do not add `-v` to `down`. It deletes database and Redis storage.** Do not delete volumes in Docker Desktop.

## Deploy a new release

```powershell
node scripts/docker-deploy.mjs
```

The script validates and builds the release, starts database services, runs a fresh migration job, then recreates the application services. A failed migration stops deployment. An older completed migration container is not sufficient evidence that a new release's migrations ran. This is a single-host deployment with brief restart downtime, not a rolling deployment.

## Verify the container application

```powershell
docker compose --profile test build api-tests migrate-test
docker compose --profile test run --rm --no-deps migrate-test
docker compose --profile test run --rm --no-deps api-tests
$env:DOCKER_SMOKE_URL = 'http://localhost:18080'
node scripts/docker-smoke.mjs
npm ci
npx playwright install chromium
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:18080'
$env:API_BASE_URL = 'http://localhost:18080/api'
npm run test:e2e -- --workers=1
```

The API tests use `linkflow_test` and an independent Redis namespace, never the application database. Adjust the URLs above if you change the public port. Browser tests create unique accounts in the application database. They do not delete existing user data. Registration and login share a limit of 20 requests per client IP per 15 minutes. Wait before repeated browser runs rather than disabling that limit.

Start the main stack and confirm PostgreSQL and Redis health before these `--no-deps` jobs. Run test migrations first and stop if they fail. Fresh disposable jobs avoid completed test containers retaining references to networks removed by `down`. To run the Linux entrypoint, configuration, and signal tests:

```powershell
docker compose --profile test run --rm --no-deps api-tests node --test docker/entrypoint.test.mjs
```

To check persistence after the smoke script creates a fixture:

```powershell
docker compose down
docker compose up -d
node scripts/docker-smoke.mjs --verify
```

The smoke script saves its session cookie in ignored `.local/docker-smoke.json`. Treat that file as private. It checks persisted authentication, links, and recorded clicks.

The smoke script waits up to 30 seconds for `/health` before checking application behavior. Backend's direct PostgreSQL dependency requests a restart after Compose-managed database updates. Engine-driven crash restarts do not trigger that dependency behavior.

To check Redis failure and recovery:

```powershell
docker compose stop redis
node scripts/docker-smoke.mjs --verify
docker compose start redis
docker compose ps
```

PostgreSQL remains authoritative while Redis is unavailable. Do not restart the whole stack during this check because initial backend startup waits for healthy Redis.

## Deploy production HTTPS

1. Point your domain at the server. Allow inbound ports 80 and 443. Keep Docker's database and Redis ports unpublished.
2. Copy `.env.production.example` to `.env.production`. Set the actual HTTPS origin, separate project name, certificate paths, and secret paths. Never put passwords, tokens, or database URLs in this file.
3. Provide a valid certificate chain and private key in the configured files. Do not store certificates or keys in an image.
4. Generate independent production secrets:

   ```powershell
   node scripts/docker-setup.mjs .env.production .local/production-secrets
   ```

   On Linux, give the secret files a deployment-owned supplemental group matching `DOCKER_SECRET_GID`. Use mode `0640` for files and a traversable `0750` directory. For example, use your deployment group with `chgrp` and set its numeric ID in the environment file. Node, Nginx, PostgreSQL, and Redis users differ, so owner-only files will not work. Compose bind-backed secrets may preserve host permissions rather than honor requested secret modes. Check readability inside each actual container. Do not make private keys world-readable.

5. Validate the merged production configuration and deploy:

   ```powershell
   docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml config --quiet
   node scripts/docker-deploy.mjs --production
   ```

   For a first startup, the equivalent full-stack command is:

   ```powershell
   docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up --build -d
   ```

6. Check HTTPS, HTTP redirection, and the `Secure`, `HttpOnly`, and `SameSite=Lax` session cookie. Use your real domain in browser verification.

All production commands must use the same `--env-file` and both Compose files. Resource limits are starting budgets, not capacity guarantees. Monitor memory, disk, authentication load, and database connections before increasing traffic.

Custom-domain verification proves DNS ownership only. Each enabled custom domain also needs DNS pointing here and certificate coverage. The supplied proxy uses one certificate chain for HTTPS hosts. Supply a SAN or wildcard certificate covering the hosts you serve, or manage separate validated virtual hosts outside this template. Unknown custom hosts reach backend alias validation and return 404. Do not serve a hostname whose certificate is missing. Unknown HTTP hosts return 404 rather than redirecting attacker-controlled Host values.

## Back up PostgreSQL

Run backups before migration or database-image changes. Use the script to stream a binary `pg_dump` archive without PowerShell text redirection:

```powershell
node scripts/docker-backup.mjs .local/linkflow.dump
```

The script refuses to overwrite an existing backup. For production:

```powershell
node scripts/docker-backup.mjs .local/production.dump --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml
```

Do not use `docker cp` on `/tmp` because this stack mounts it as tmpfs. Encrypt backups, copy them off the Docker host, and test restoration into a separate database. A Docker volume is not a backup. Keep PostgreSQL on the same major version until you perform a planned database upgrade.

## Rotate credentials

Changing a secret file does not update passwords stored in an existing PostgreSQL volume. Stop application writes, back up, change the role password through a private administrative session, update the mounted file, and recreate affected services. Never pass passwords as command-line arguments or paste them into logs. Redis reads its new secret after recreation. JWT rotation invalidates existing authentication tokens. Visitor-secret rotation changes visitor estimates across the rotation boundary. Keep a recovery copy of old secrets until the rotation is confirmed.

## Troubleshoot

Use these commands without printing secrets:

```powershell
docker compose ps -a
docker compose logs --tail 100 nginx backend migrate
docker compose logs --tail 100 postgres redis
docker compose exec nginx nginx -t -c /tmp/linkflow.conf
docker compose exec backend node -e "fetch('http://127.0.0.1:3001/health').then(async r=>console.log(r.status,await r.text()))"
docker compose exec postgres pg_isready -U postgres -d postgres
docker compose exec redis sh /etc/linkflow/health.sh
docker network ls
docker volume ls
docker stats --no-stream
```

- If Docker cannot connect to the engine, start Docker Desktop and select Linux containers. Run `docker context ls` and `docker version`.
- If a port is occupied, change `DOCKER_HTTP_PORT` and the port in `DOCKER_PUBLIC_BASE_URL` together. Recreate services. For HTTPS, update both HTTPS settings.
- If a subnet overlaps a VPN or another Docker network, change `DOCKER_PROXY_SUBNET`, `DOCKER_PROXY_DYNAMIC_RANGE`, and `DOCKER_PROXY_IP` together. Keep the static proxy IP inside the subnet but outside the dynamic range. This prevents the backend from receiving the proxy's reserved address. Run `down` without `-v`, then `up -d` to recreate the network while preserving volumes.
- If migrations fail, inspect `migrate` logs. Fix connection, permissions, or the failed migration. Run a new migration job with `docker compose run --rm migrate`. Never use `prisma migrate reset` on persisted data. Use `prisma migrate resolve` only after an operator reviews the failed migration and the actual schema.
- If PostgreSQL reports password authentication failure after secret replacement, the volume still has the old password. Follow credential rotation. Do not delete the volume to bypass the error.
- If a secret is unreadable, check its host group, permissions, and mount path. Setup generates newline-free hexadecimal secrets. Redis intentionally rejects nonhexadecimal passwords in this configuration.
- If Nginx returns 502, inspect backend and frontend health and logs. Check `/health`, then validate Nginx configuration. The proxy resolves Docker DNS again after container replacement.
- If authentication fails with 403, use the exact configured origin, including scheme and port. Production accepts HTTPS origins only.
- If the browser refuses a cookie, check that HTTPS reaches production Nginx and that public and frontend origins agree. Local HTTP deliberately uses development cookie settings.
- If authentication returns 429 during repeated tests, wait for the rate-limit window. Do not disable production protection.
- If HTTPS reports a certificate mismatch, check SAN coverage, expiration, and the full chain. Replace certificates and recreate Nginx. Never disable certificate validation in deployment.
- If health is unhealthy but the process runs, inspect logs. Docker health checks do not automatically restart unhealthy containers. Restart policies apply when processes exit.

Do not share `.env` files, secret files, private backups, session fixtures, process environments, or full `docker inspect` output without reviewing them first.

## Verification record

To repeat the network, credential-interpolation, and decoded image-layer audit, use Node and the system `tar` command:

```powershell
node scripts/docker-audit.mjs
node scripts/docker-audit.mjs --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml
```

The audit reads secrets for byte comparison without printing them. It exports images into an ignored temporary directory, decompresses gzip layers, and removes its own archive afterward. It fails rather than silently skipping Zstandard-compressed layers.

See [the Docker implementation record](docker-plan.md) for actual results and remaining deployment-specific limits.
