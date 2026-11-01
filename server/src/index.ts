import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { connectRedis, redis } from './security.js';

await db.$connect();
// Do not await Redis's reconnect loop; PostgreSQL-only operation is supported.
void connectRedis();
const server = app.listen(config.PORT, () => {
  process.stdout.write(
    JSON.stringify({ level: 'info', event: 'listening', port: config.PORT }) + '\n'
  );
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timer = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    await db.$disconnect();
    if (redis.isOpen) redis.destroy();
    clearTimeout(timer);
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
