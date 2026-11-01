import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { containerEnvironment } from './entrypoint.mjs';

const temporaryRoot =
  process.platform === 'win32' ? 'C:/Users/goely/AppData/Local/Temp/opencode' : tmpdir();
const directory = await mkdtemp(join(temporaryRoot, 'linkflow-entrypoint-'));
after(() => rm(directory, { recursive: true, force: true }));
const passwordPath = join(directory, 'db_password');
const redisPath = join(directory, 'redis_password');
const jwtPath = join(directory, 'jwt_secret');
const visitorPath = join(directory, 'visitor_secret');
await writeFile(passwordPath, 'p@ss:/?#%é');
await writeFile(redisPath, 'redis@:/?#%');
await writeFile(jwtPath, 'j'.repeat(32));
await writeFile(visitorPath, 'v'.repeat(32));
const database = {
  DB_HOST: 'postgres',
  DB_PORT: '5432',
  DB_NAME: 'linkflow',
  DB_USER: 'user@name',
  DB_PASSWORD_FILE: passwordPath,
};
const application = {
  ...database,
  REDIS_HOST: 'redis',
  REDIS_PORT: '6379',
  REDIS_PASSWORD_FILE: redisPath,
  JWT_SECRET_FILE: jwtPath,
  VISITOR_SECRET_FILE: visitorPath,
};
const cwd = fileURLToPath(new URL('../', import.meta.url));
const entrypoint = fileURLToPath(new URL('./entrypoint.mjs', import.meta.url));

test('file secrets generate encoded application and separate test URLs without mutating input', async () => {
  const env = await containerEnvironment({ ...application, TEST_DATABASE_NAME: 'linkflow_test' });
  const url = new URL(env.DATABASE_URL);
  assert.equal(decodeURIComponent(url.username), database.DB_USER);
  assert.equal(decodeURIComponent(url.password), 'p@ss:/?#%é');
  assert.equal(url.hostname, 'postgres');
  assert.equal(url.pathname, '/linkflow');
  assert.equal(url.search, '');
  assert.equal(new URL(env.TEST_DATABASE_URL).pathname, '/linkflow_test');
  assert.equal(decodeURIComponent(new URL(env.REDIS_URL).password), 'redis@:/?#%');
  assert.equal(env.JWT_SECRET, 'j'.repeat(32));
  assert.equal(env.VISITOR_SECRET, 'v'.repeat(32));
  assert.equal(application.DATABASE_URL, undefined);
});

test('migration requires only database inputs and targets DB_NAME directly', async () => {
  const env = await containerEnvironment({ ...database, DB_NAME: 'linkflow_test' });
  assert.equal(new URL(env.DATABASE_URL).pathname, '/linkflow_test');
  assert.equal(env.REDIS_URL, undefined);
  assert.equal(env.JWT_SECRET, undefined);
  assert.equal(
    new URL((await containerEnvironment({ ...database, DB_HOST: '::1' })).DATABASE_URL).hostname,
    '[::1]'
  );
});

test('direct credentials and URLs always conflict with file-secret configuration', async () => {
  for (const name of [
    'DATABASE_URL',
    'TEST_DATABASE_URL',
    'REDIS_URL',
    'DB_PASSWORD',
    'REDIS_PASSWORD',
    'JWT_SECRET',
    'VISITOR_SECRET',
  ]) {
    await assert.rejects(
      containerEnvironment({ ...application, [name]: 'private-value' }),
      new RegExp(name)
    );
  }
  await assert.rejects(
    containerEnvironment({ ...database, TEST_DATABASE_NAME: 'linkflow' }),
    /must differ/
  );
});

test('secret files reject empty content, whitespace, NUL and invalid UTF-8 without leaking content', async () => {
  const path = join(directory, 'invalid');
  for (const value of [
    '',
    'private\n',
    'private\r\n',
    'private value',
    'private\t',
    'private\0',
    '\uFEFFprivate',
    Buffer.from([0xff]),
  ]) {
    await writeFile(path, value);
    await assert.rejects(containerEnvironment({ ...database, DB_PASSWORD_FILE: path }), (error) => {
      assert.match(error.message, /DB_PASSWORD_FILE/);
      assert.equal(error.message.includes('private'), false);
      return true;
    });
  }
  await assert.rejects(
    containerEnvironment({ ...database, DB_PASSWORD_FILE: directory }),
    /DB_PASSWORD_FILE/
  );
  await assert.rejects(
    containerEnvironment({ ...database, DB_PASSWORD_FILE: join(directory, 'missing') }),
    /DB_PASSWORD_FILE/
  );
});

test('incomplete or malformed endpoint configuration fails closed', async () => {
  for (const change of [
    { DB_HOST: 'postgres/path' },
    { DB_HOST: 'post..gres' },
    { DB_PORT: '0' },
    { DB_PORT: '65536' },
    { DB_PORT: '5432x' },
    { DB_USER: '' },
    { DB_NAME: 'linkflow\n' },
    { REDIS_HOST: 'redis' },
  ]) {
    await assert.rejects(containerEnvironment({ ...database, ...change }));
  }
});

function fileSecretProcessEnvironment() {
  // The runner itself may already have resolved credentials. Exercise a fresh container boundary.
  return { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...database };
}

test('entrypoint preserves arguments, child exit status, and keeps secrets out of its output', () => {
  const result = spawnSync(
    process.execPath,
    [
      entrypoint,
      process.execPath,
      '-e',
      'if (new URL(process.env.DATABASE_URL).pathname !== "/linkflow" || process.argv[1] !== "with spaces") process.exit(1); process.exit(23)',
      'with spaces',
    ],
    { cwd, env: fileSecretProcessEnvironment(), encoding: 'utf8' }
  );
  assert.equal(result.status, 23, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

function configProcess(overrides = {}, code = 'await import("./src/config.ts")') {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://test:test@localhost/linkflow',
    JWT_SECRET: 'j'.repeat(32),
    VISITOR_SECRET: 'v'.repeat(32),
    FRONTEND_ORIGIN: 'http://localhost:5173',
    PUBLIC_BASE_URL: 'http://localhost:3001',
    DOTENV_CONFIG_PATH: join(directory, 'no-env-file'),
    ...overrides,
  };
  if (overrides.TRUST_PROXY_IP === undefined) delete env.TRUST_PROXY_IP;
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd,
    env,
    encoding: 'utf8',
  });
}

test('configuration accepts exact IPv4/IPv6 proxy IPs and rejects networks, hosts and global trust', () => {
  for (const ip of ['172.30.0.10', '2001:db8::10'])
    assert.equal(configProcess({ TRUST_PROXY_IP: ip }).status, 0);
  for (const ip of ['', 'true', '1', 'loopback', '172.30.0.0/24', 'proxy', '172.30.0.10 ']) {
    assert.notEqual(configProcess({ TRUST_PROXY_IP: ip }).status, 0);
  }
});

test('production requires HTTPS for every frontend origin as well as public origin', () => {
  assert.equal(
    configProcess({
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://app.example,https://other.example',
      PUBLIC_BASE_URL: 'https://links.example',
    }).status,
    0
  );
  assert.notEqual(
    configProcess({
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://app.example,http://other.example',
      PUBLIC_BASE_URL: 'https://links.example',
    }).status,
    0
  );
  assert.notEqual(
    configProcess({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://app.example' }).status,
    0
  );
});

test('one-hop proxy trust is opt-in and cannot be combined with exact-IP trust', () => {
  assert.equal(configProcess({ TRUST_PROXY_HOPS: '1' }).status, 0);
  for (const hops of ['true', '0', '2', '-1'])
    assert.notEqual(configProcess({ TRUST_PROXY_HOPS: hops }).status, 0);
  assert.notEqual(
    configProcess({ TRUST_PROXY_HOPS: '1', TRUST_PROXY_IP: '172.30.0.10' }).status,
    0
  );
});

test('the real app trusts only the configured peer and defaults to no proxy trust', () => {
  const result = configProcess(
    { TRUST_PROXY_IP: '172.30.0.10' },
    `
    import assert from 'node:assert/strict';
    const { app } = await import('./src/app.ts');
    assert.equal(app.get('trust proxy'), '172.30.0.10');
    assert.equal(app.get('trust proxy fn')('172.30.0.10'), true);
    assert.equal(app.get('trust proxy fn')('172.30.0.11'), false);
    assert.equal(app.get('trust proxy fn')('127.0.0.1'), false);
  `
  );
  assert.equal(result.status, 0, result.stderr);
  const defaultResult = configProcess(
    {},
    `
    import assert from 'node:assert/strict';
    const { app } = await import('./src/app.ts');
    assert.equal(app.get('trust proxy'), false);
  `
  );
  assert.equal(defaultResult.status, 0, defaultResult.stderr);
});

test(
  'entrypoint forwards SIGTERM to its child',
  { skip: process.platform === 'win32', timeout: 10000 },
  async () => {
    const child = spawn(
      process.execPath,
      [
        entrypoint,
        process.execPath,
        '-e',
        'process.on("SIGTERM", () => process.exit(42)); console.log("ready"); setInterval(() => {}, 1000)',
      ],
      { cwd, env: fileSecretProcessEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] }
    );
    try {
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolve(code));
      });
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Entrypoint exited before child readiness')));
        child.stdout.once('data', resolve);
      });
      child.kill('SIGTERM');
      assert.equal(await exited, 42);
    } finally {
      child.kill('SIGKILL');
    }
  }
);
