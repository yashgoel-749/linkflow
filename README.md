# LinkFlow

LinkFlow is a URL-shortening application with a React frontend and an Express API. PostgreSQL stores users, sessions, links, and click events. Redis caches routing lookups. Prisma manages the schema and migrations. The API uses TypeScript, JWT cookies, Zod validation, and Swagger.

## Run locally

For a single-address deployment with all services on Render, follow [the Render guide](docs/render.md), including the exact build commands and environment variables.

To run the complete stack with Docker Desktop, follow [the Docker guide](docs/docker.md). It includes a separate HTTPS production configuration, persistent databases, verification, and troubleshooting. [Docker architecture](docs/docker-architecture.md) explains every image, service, network, and volume.

Use Node.js 22.13 or newer, PostgreSQL 16, and Redis. No Docker is required.

1. Install both packages:

   ```sh
   npm install
   npm run install:api
   ```

2. Start PostgreSQL and Redis. On Windows, with PostgreSQL 16 installed in its default location:

   ```sh
   npm run services:start
   ```

   This creates an isolated PostgreSQL instance on port 5433 and the `linkflow` and `linkflow_test` databases. It does not change the system PostgreSQL instance on port 5432. The script downloads a checksum-verified community Redis Windows build and binds it to localhost. You can use your own PostgreSQL and Redis services instead.

3. Copy `server/.env.example` to `server/.env`. Set its database URL, Redis URL, and random JWT and visitor-hash secrets. For the Windows helper, private database URLs are in `.local/database.env`. Follow [the API setup guide](server/README.md) for all environment variables. Never commit these files.

4. Copy `.env.example` to `.env` if you need to change the frontend API URL. The default is `http://localhost:3001/api`.

5. Apply the checked-in database migrations:

   ```sh
   npm run db:generate
   npm run db:migrate
   ```

6. Start the API in one terminal:

   ```sh
   npm run dev:api
   ```

7. Start the frontend in another terminal:

   ```sh
   npm run dev
   ```

8. Open [LinkFlow](http://localhost:5173). Register an account. New accounts start with no links or synthetic click history.

Open [Swagger](http://localhost:3001/api/docs) for the API reference. Local short URLs use `http://localhost:3001/r/<code>`.

To scan a QR code on another device, set `PUBLIC_BASE_URL` to a hostname that device can reach. `localhost` on a phone refers to the phone, not your development computer.

## Run verification

Configure a separate test database using `server/.env.test.example`. The API test runner accepts names ending in `_test` or an explicitly confirmed separate Neon endpoint. For Neon projects whose database is named `neondb`, set `TEST_DATABASE_NEON_ENDPOINT` to the test endpoint ID (without `-pooler`) in `server/.env.test`. The runner compares the application database too and refuses the same database even if credentials or pooler settings differ. Tests use actual PostgreSQL and Redis, not an in-memory database replacement.

```sh
npm --prefix server run db:migrate:test
npm run test:api
npm run typecheck:tests
npm run build:all
npm run lint
npm run format:check
npx playwright install chromium
npm run test:e2e -- --workers=1
```

The API must be running for browser tests. Playwright starts the frontend if needed. Browser tests create uniquely named local accounts and links. They do not clear existing user data.

Registration and login share a limit of 20 requests per IP per 15 minutes. One browser-suite run fits within that limit; repeated runs may return 429. Wait for the window to expire or use an isolated local API instance for additional runs. Do not disable production rate limiting.

To verify the frontend's production build, run `npm run preview`, then:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:4173'
npm run test:e2e -- --workers=1
```

See [the feature verification guide](docs/verification.md) for individual checks. Build output is in `dist/` and `server/dist/`. Stop the helper-managed local services with `npm run services:stop`.

## Project structure

- `server/prisma/` contains the database schema and versioned SQL migrations.
- `server/src/` contains API configuration, middleware, and feature modules.
- `server/tests/` contains backend integration tests.
- `src/context/` contains authentication and API-backed workspace state.
- `src/lib/` contains the API client, report adapters, and frontend utilities.
- `src/pages/` contains the existing responsive workspace pages.
- `tests/application.spec.ts` tests the connected application in Chromium.
- `docs/backend-plan.md` records the implementation contracts and design decisions.

## Data and deployment limits

Clicks count accepted redirect requests. They do not prove that a person reached the destination. The API stores a privacy-preserving visitor hash, a normalized referrer hostname, and parsed device information. Period unique visitors are estimates, not a sum of daily counts.

Conversions are unavailable because no conversion-event integration is connected. Geography remains Unknown without a trusted geolocation source. The frontend does not fabricate either metric.

Custom-domain verification checks a DNS TXT ownership proof. Verification does not provision HTTPS certificates or a reverse proxy. OAuth, password-reset email, billing, and team collaboration are not connected. The frontend marks unsupported actions unavailable.

For production, use HTTPS, secure cookies, strong private secrets, a restricted frontend Origin, a correctly configured reverse proxy, database backups, and authenticated Redis. Serve `index.html` for frontend routes. Review the [API security and operations notes](server/README.md) before public deployment.
