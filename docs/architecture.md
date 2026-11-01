# Application architecture

## Ownership

PostgreSQL owns users, revocable sessions, links, domains, and immutable click events. The frontend keeps an API-backed workspace view and local presentation state. React Context shares loaded records, mutation methods, and notifications. Theme preference remains in browser storage. No demo fixture is a source of runtime data.

The API authenticates requests with a JWT in an HttpOnly cookie. Each private query includes the authenticated user's ownership constraint. Resource IDs from the client never establish ownership.

## Request flow

A form validates immediate input for feedback, then awaits an API mutation. The API validates the request with Zod, checks ownership and business rules, and writes through Prisma. The frontend updates its workspace from the successful response and displays structured failures instead of claiming success.

Public short URLs resolve through the API, not React Router. The resolver checks the current database lifecycle and password requirements before recording a click. PostgreSQL stores the click before the API sends a redirect response. HEAD requests, password challenges, and rejected links do not record clicks.

## Cache boundary

Redis caches routing lookups. A cached record is not permission to redirect: the database remains authoritative for deletion, archive state, expiration, password protection, and destination changes. Redis outages do not turn a disabled link into a redirect. They can reduce cache availability.

## Reports

Analytics aggregates actual redirect events for the selected user, date range, and link scope. The JSON report and CSV use the same aggregation. Device, operating system, referrer, country, and link totals conserve the selected click count.

Visitor hashes estimate distinct clients. Period unique visitors are computed over the full selected range, not by adding daily unique counts. Referrer storage excludes paths and query strings. The API does not invent countries or conversion events.

Dashboard uses real reports and current link inventory. Links and QR views use persisted records and the API's complete `shortUrl`, including the correct local protocol and redirect path.

## Modules

- `server/prisma/` owns the schema and migrations.
- `server/src/` owns the API composition, boundary middleware, and feature modules.
- `src/app/` owns guarded frontend routes.
- `src/context/` owns authentication, the workspace view, notifications, and theme preference.
- `src/lib/` owns API access and report presentation helpers.
- `src/components/` owns shared UI and charts.
- `src/pages/` owns route composition and local control state.

Feature modules were chosen over a global repository layer to keep authorization and transactions close to their callers. The API has no generic CRUD base class or alternate in-memory implementation.

## Verification

Backend integration tests use actual PostgreSQL and Redis with a separate test database. Chromium tests drive authentication, persistent mutations, working redirects, reports, QR images, and responsive pages. See [the verification guide](verification.md) and [the implementation agreement](backend-plan.md).
