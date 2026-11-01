import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const envPath = resolve(process.argv[2] ?? '.env');
const secretDirectory = resolve(process.argv[3] ?? '.local/docker-secrets');
await mkdir(secretDirectory, { recursive: true, mode: 0o750 });
const secrets = {
  POSTGRES_ADMIN_PASSWORD: 'postgres_admin_password',
  DB_PASSWORD: 'db_password',
  REDIS_PASSWORD: 'redis_password',
  JWT_SECRET: 'jwt_secret',
  VISITOR_SECRET: 'visitor_secret',
};
const settings = {
  DOCKER_PROJECT_NAME: 'linkflow-docker',
  DOCKER_PUBLIC_BASE_URL: 'http://localhost:8080',
  DOCKER_HTTP_BIND: '127.0.0.1',
  DOCKER_HTTP_PORT: '8080',
  DOCKER_PROXY_SUBNET: '172.30.240.0/28',
  DOCKER_PROXY_DYNAMIC_RANGE: '172.30.240.8/29',
  DOCKER_PROXY_IP: '172.30.240.2',
  DOCKER_SECRET_GID: '1000',
};
for (const [key, filename] of Object.entries(secrets)) {
  const path = resolve(secretDirectory, filename);
  try {
    await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o640 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  settings[`DOCKER_${key}_FILE`] = `./${relative(process.cwd(), path).replaceAll('\\', '/')}`;
}
let existing = '';
try {
  existing = await readFile(envPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const additions = Object.entries(settings).filter(
  ([key]) => !new RegExp(`^\\s*${key}\\s*=`, 'm').test(existing)
);
if (additions.length) {
  await writeFile(
    envPath,
    `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}\n# Docker: nonsecret settings; independent from native/Neon databases.\n${additions.map(([key, value]) => `${key}=${value}`).join('\n')}\n`
  );
}
console.log(`Docker configuration ready: ${envPath}`);
console.log(`Secret files ready (existing files preserved): ${secretDirectory}`);
console.log(
  'Linux: ensure the container supplemental group can read these 0640 files and traverse their directory.'
);
