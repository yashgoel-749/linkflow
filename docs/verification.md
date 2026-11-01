# Verify the connected application

Start the local services, apply migrations, and start both the API and frontend as described in [README.md](../README.md).

## Verify each feature

| Feature                 | Check                                                                                                           | Expected result                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Registration            | Register a new email through **Sign Up**. Refresh Dashboard.                                                    | The account remains authenticated. The workspace is empty. Duplicate email registration returns a conflict.                         |
| Login and logout        | Sign out, try an incorrect password, then sign in with the correct password.                                    | Wrong credentials show an error. Correct credentials restore the same persisted links. Signout revokes the session.                 |
| Authentication          | Open `/links` in a private browser window. Inspect browser storage after login.                                 | The app opens Login. Tokens are not stored in localStorage. The session cookie is HttpOnly.                                         |
| Create and unique codes | Create two links without aliases.                                                                               | Both get different usable short URLs. Refresh retains them.                                                                         |
| Custom aliases          | Create a link with an alias. Try the same alias again, including different casing.                              | The first succeeds. The duplicate returns HTTP 409. Deleted aliases remain reserved.                                                |
| Edit                    | Edit a title, destination, alias, tags, or expiration in Links.                                                 | Refresh retains the change. Redirecting uses the new destination. The previous alias stops routing after an alias change.           |
| Delete                  | Cancel a deletion, then confirm it. Refresh.                                                                    | Cancel keeps the record. Confirm removes it from the list and disables its short URL.                                               |
| Bulk actions            | Select links across pages. Archive or delete them.                                                              | Only selected owned records change. The change persists. Foreign IDs fail atomically.                                               |
| Redirect                | Open or copy a short URL.                                                                                       | The API returns HTTP 302 and the configured destination. Unknown links return 404. Archived and expired links return 410.           |
| Password protection     | Create a protected link with a password. Open the short URL. Enter a wrong password, then the correct password. | The link challenges first. Wrong passwords do not expose the destination or record a click. The correct password redirects.         |
| Click tracking          | Request a short URL three times. Send a HEAD request once.                                                      | Clicks increase by three. HEAD does not add a click. Unsuccessful redirects do not add clicks.                                      |
| Analytics               | Select the visited link and switch date ranges. Inspect the chart, referrers, devices, and leaderboard.         | All totals derive from recorded requests. Breakdown counts sum to the selected click total. An unvisited link shows zero traffic.   |
| Visitors and geography  | Repeat a request from the same client.                                                                          | Estimated unique visitors do not increase on every request. Geography is Unknown without a trusted lookup source.                   |
| QR generation           | Open a link's QR preview. Download SVG and PNG from Swagger or the QR page.                                     | The files contain real QR images encoding the API's authoritative short URL. Scanning opens the real redirect.                      |
| Search and filters      | Search by title or destination. Combine tag, category, and status filters. Change pages.                        | Results and counts match the filters. Refresh never restores demo records.                                                          |
| CSV export              | Export Links and Analytics under selected filters.                                                              | CSV contains the selected owned data and actual counts. Formula-like values are escaped. Private referrer query strings are absent. |
| Redis caching           | Visit a link twice, then edit, archive, expire, or delete it. Visit it again.                                   | Repeated lookups can use Redis. Current database state still prevents stale destinations or disabled links from routing.            |
| Cache outage            | Stop the project's Redis process temporarily, then visit an active link. Restart Redis.                         | The database remains authoritative. Cache failure does not expose a foreign or disabled link.                                       |
| Ownership               | Create two accounts. Try one account's link ID with the other account's cookie using Swagger.                   | Private read, edit, delete, QR, and report requests return 404 rather than exposing the other user's data.                          |
| Validation              | Send invalid URLs, expired creation dates, oversized tags, unknown fields, or malformed JSON through Swagger.   | The API returns a structured validation error without a stack trace.                                                                |
| Security                | Send an unsafe cookie-authenticated request with a foreign Origin. Repeatedly attempt bad logins.               | The foreign Origin is rejected. Rate limiting eventually returns 429.                                                               |
| Domains                 | Add a hostname, publish the displayed TXT proof, then verify it.                                                | Only a matching DNS ownership proof marks the domain verified. A failed lookup is not simulated as success.                         |
| Profile                 | Change the profile name and refresh.                                                                            | The database retains the name.                                                                                                      |
| Responsive UI           | Open workspace routes at 1440, 971, 390, and 320 pixels.                                                        | Pages fit without document-level horizontal overflow. Navigation remains usable.                                                    |

## Run automated checks

Run `npm run test:api` against the separate test database. Run `npm run test:e2e -- --workers=1` against the running local API. The connected browser tests replace the earlier demo-only assertions, which deliberately expected no network calls and refresh resets.

Run `npm run build:all`, `npm run lint`, and `npm run format:check` before shipping changes. Browser screenshots and failure traces are in `test-results/`.

Protected links intentionally return a 401 HTML challenge. A successful password form redirects; it does not turn the initial challenge into a 200 page.

### Actual Redis-service outage

For the project's native Windows Redis only, run from `server/`:

```powershell
npx tsx scripts/verify-redis-outage.ts --stop-project-redis
```

This opt-in check verifies the Redis process belongs to this project's `.local` directory before stopping it. It calls the running API, checks durable redirect counts and archive enforcement while Redis is down, restarts Redis in `finally`, and checks recovery. It requires the development API at port 3001 and consumes one registration request. It leaves a uniquely named test account and removes its link. Do not run this against shared or production services.

## Verified results

- 16 backend tests passed against real PostgreSQL and Redis.
- All 13 Chromium tests passed against Vite development and the production frontend preview.
- Backend/frontend builds, lint, and browser test type-check passed.
- The actual Redis-service outage check passed.
- Responsive screenshots were inspected; document overflow checks passed at 1440, 971, 390, and 320 pixels.
- Positive DNS ownership and production HTTPS/custom-domain routing still require a domain and infrastructure you control.
