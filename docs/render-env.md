# Render environment variables

These values belong to the Node web service, not the frontend files or GitHub. Replace `https://YOUR-SERVICE.onrender.com` with the exact URL that Render assigns. Do not add a trailing slash or quotes in Render's value fields.

| Variable           | Value                                               | Purpose                                                                                                      |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`         | `production`                                        | Enables Secure cookies and HTTPS configuration checks.                                                       |
| `NODE_VERSION`     | `22.22.0`                                           | Pins a Node 22 release compatible with Vite and the API.                                                     |
| `VITE_API_URL`     | `/api`                                              | Compiles the frontend to call the API on the same address. This is public, not a secret.                     |
| `FRONTEND_DIST`    | `dist`                                              | Makes Express serve the built frontend. Relative to the repository root used by the start command.           |
| `FRONTEND_ORIGIN`  | `https://YOUR-SERVICE.onrender.com`                 | Allows browser writes from this exact origin.                                                                |
| `PUBLIC_BASE_URL`  | `https://YOUR-SERVICE.onrender.com`                 | Determines generated short URLs, QR URLs, and the canonical redirect Host.                                   |
| `DATABASE_URL`     | The Render Postgres **Internal Database URL**       | Private PostgreSQL credentials. Use the complete URL, not the hostname alone.                                |
| `REDIS_URL`        | The Render Key Value **Internal URL**               | Private Redis-compatible connection. Copy the complete URL exactly.                                          |
| `REDIS_NAMESPACE`  | `linkflow-production`                               | Separates rate-limit keys from other environments.                                                           |
| `JWT_SECRET`       | One newly generated 64-character hex string         | Signs authentication tokens. Keep private and stable across deploys.                                         |
| `VISITOR_SECRET`   | A different newly generated 64-character hex string | Hashes visitor identities and rate-limit keys. Keep private and stable across deploys.                       |
| `TRUST_PROXY_HOPS` | `1`                                                 | Uses the nearest forwarded address behind Render's public load balancer. Never use unrestricted proxy trust. |
| `PORT`             | Leave unset                                         | Render supplies `10000`; the app reads it automatically.                                                     |

Leave `TRUST_PROXY_IP` unset on Render. It is the exact-IP option for the Docker proxy and cannot be combined with `TRUST_PROXY_HOPS`.

One-hop trust assumes requests enter through Render's public load balancer, which Render [recommends for Express](https://render.com/articles/how-to-implement-authentication-and-authorization). The service's HTTP port is not directly public. Do not reuse this setting on a directly exposed server or add an alternate private ingress without rechecking the proxy chain. Leftmost addresses supplied by a client are not trusted. A live Render deployment is still required to confirm platform header behavior.

Generate each secret locally with this command. Run it twice and paste the two different outputs into Render's secret fields:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not put database credentials or either secret in any `VITE_` variable. Vite includes those variables in downloadable frontend code. No `DOCKER_*`, test database, OAuth, or email credentials are required for this deployment.
