# Deploy LinkFlow on Render

Deploy the frontend and API together as one Node web service. Store data in Render Postgres and cache entries in Render Key Value. No Vercel, Docker Compose, separate frontend service, or web-service disk is needed.

For a production short-link service, choose always-on paid compute and paid Postgres with backups. A free web service sleeps after 15 idle minutes, so short URLs can have a cold-start delay. Free Postgres expires after 30 days and has no backups. Free Key Value loses its cache and counters on restart. See [Render's free-plan limits](https://render.com/docs/free).

## Create the data stores

1. Open the [Render dashboard](https://dashboard.render.com). Choose **New > Postgres**.
2. Name it `linkflow-db`. Choose PostgreSQL 16 if available and select your region and compute plan.
3. Wait for the database to become available. Copy its **Internal Database URL** for the web service's `DATABASE_URL`.
4. Choose **New > Key Value**. Name it `linkflow-cache` and select the same region.
5. Choose `allkeys-lru` for its eviction policy if the dashboard offers this setting. Copy its **Internal URL** for `REDIS_URL`.
6. Keep both data stores private. Do not enable public Redis access. Restrict external Postgres access when you do not need it.

The new database starts empty. Your existing Neon and Docker databases remain untouched. To preserve existing application data on Render, restore a verified PostgreSQL backup into the new database before opening the app to users. Do not run test migrations or `prisma migrate reset` against production. Prisma migrations create or update the schema; they do not copy existing records from another database.

## Create the web service

1. Choose **New > Web Service > Git Provider**. Connect GitHub and select `yashgoel-749/linkflow`.
2. Select branch `main`. Leave **Root Directory** empty so the build runs at the repository root.
3. Choose the **Node** runtime, not Docker. Select the same region as both data stores.
4. Set **Build Command** to:

   ```sh
   npm run build:render
   ```

   This installs both locked dependency trees, generates Prisma Client, and builds the API and frontend. Development dependencies are explicitly included because TypeScript, Vite, and Prisma are build tools.

5. For a free web service, set **Start Command** to:

   ```sh
   npm run start:render
   ```

   This applies checked-in migrations before starting the API. A migration failure prevents the app from listening.

   For a paid web service, set **Pre-Deploy Command** to `npm run db:migrate` and **Start Command** to `node server/dist/index.js`. Pre-deploy commands require paid compute. Do not migrate during the build. Use one instance for the initial deployment.

6. Under **Advanced**, set **Health Check Path** to `/health`.
7. Add the values from [Render environment variables](render-env.md). Generate two different secrets. Copy the internal database URLs from the data stores.
8. Use the service's actual assigned HTTPS URL for both `FRONTEND_ORIGIN` and `PUBLIC_BASE_URL`. Do not assume the requested service name is available. If the URL appears only after creation, update both values and redeploy.
9. Choose **Create Web Service**. Check the deploy logs for completed Prisma migrations and the `listening` event.

Keep the Prisma CLI available for migration commands. Do not add `npm prune --omit=dev` to these commands. Never paste your local `.env` wholesale into Render.

## Check the deployment

1. Open `https://YOUR-SERVICE.onrender.com/health`. Expect `{"data":{"status":"ok"}}`.
2. Open `/login`. Register an account, create a link, and open its generated `/r/<slug>` URL.
3. Confirm that the redirect reaches the destination and the click appears in analytics.
4. Refresh `/dashboard` and `/links` directly. Both must load the app, not return a server 404.
5. Generate and scan a QR code. It must contain the public HTTPS address, never `localhost`.
6. Check the login response in browser developer tools. Authentication cookies must have `Secure` and `HttpOnly`.
7. Redeploy the service. Log in again and confirm the saved link remains. A fresh database has no sample accounts or fabricated history.

The single-service frontend and proxy regressions can also run locally after `npm run build:all` with `npm run test:render`. Those checks do not connect to a database or verify Render's live infrastructure.

If the frontend calls `localhost:3001`, fix `VITE_API_URL=/api` and rebuild. For `ORIGIN_FORBIDDEN`, compare the browser's origin with the configured exact HTTPS origin. For a database connection failure, check the internal URL and that all services share a region. For a blank page or missing deep route, check `FRONTEND_DIST=dist`, the empty Root Directory, and the exact start command.

## Add a custom domain later

1. Add your application domain in the web service's **Settings > Custom Domains**.
2. Apply Render's DNS instructions and wait for verification and the managed HTTPS certificate.
3. Set `PUBLIC_BASE_URL` and `FRONTEND_ORIGIN` to the new exact HTTPS origin. Redeploy and use that address for the app.

Changing `PUBLIC_BASE_URL` changes the canonical redirect host. Existing links stored under the old host need a deliberate migration or verified custom-domain setup to remain usable. Do not change this value casually once you have published links.

For additional customers' short-link domains, add each domain to Render too. LinkFlow's TXT ownership verification alone does not route traffic or provision HTTPS. Retain database backups and stable secrets before domain or data migrations.
