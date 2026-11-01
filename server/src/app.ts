import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { errors, HttpError, requestId } from './errors.js';
import { originGuard, rateLimit } from './security.js';
import { authRouter } from './auth/auth.js';
import { domainsRouter } from './domains/domains.js';
import { linksRouter } from './links/links.js';
import { analyticsRouter } from './analytics/analytics.js';
import { redirectsRouter } from './redirects/redirects.js';
import { openapi } from './openapi.js';
import { db } from './db.js';
import { frontendRouter } from './frontend.js';

export const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY_IP) app.set('trust proxy', config.TRUST_PROXY_IP);
else if (config.TRUST_PROXY_HOPS) app.set('trust proxy', 1);
app.use(
  requestId,
  helmet(),
  cors({
    origin: config.origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);
app.use(
  express.json({ limit: '32kb' }),
  express.urlencoded({ extended: false, limit: '2kb', parameterLimit: 4 }),
  cookieParser()
);
app.get('/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ data: { status: 'ok' } });
});
app.get('/api/openapi.json', (_req, res) => {
  res.json(openapi);
});
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    swaggerOptions: { withCredentials: true, persistAuthorization: false },
  })
);
app.use(
  '/api',
  (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
  originGuard,
  rateLimit('api', 300, 60000)
);
app.use('/api/auth', authRouter);
app.use('/api/domains', domainsRouter);
app.use('/api/links', linksRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api', () => {
  throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found');
});
if (config.FRONTEND_DIST) app.use(frontendRouter(config.FRONTEND_DIST));
app.use(redirectsRouter);
app.use(() => {
  throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found');
});
app.use(errors);
