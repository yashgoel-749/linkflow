import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

const directory = join(
  process.env.LOCALAPPDATA ?? '',
  'Programs',
  'DockerDesktop',
  'resources',
  'bin'
);
const docker =
  process.platform === 'win32' && existsSync(join(directory, 'docker.exe'))
    ? join(directory, 'docker.exe')
    : 'docker';
const env = { ...process.env };
if (process.platform === 'win32') env.PATH = `${directory};${env.PATH}`;
const composeArgs = process.argv.slice(2);
const result = spawnSync(docker, ['compose', ...composeArgs, 'config', '--format', 'json'], {
  env,
  encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr);
const config = JSON.parse(result.stdout);
for (const [name, service] of Object.entries(config.services)) {
  if (name !== 'nginx') assert.ok(!service.ports?.length, `${name} must not publish ports`);
  for (const key of Object.keys(service.environment ?? {})) {
    assert.ok(
      !['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'VISITOR_SECRET', 'POSTGRES_PASSWORD'].includes(
        key
      ),
      `${name}: plaintext ${key}`
    );
  }
}
assert.equal(config.networks.data.internal, true);
assert.equal(config.networks.web.internal, true);
assert.ok(config.services.postgres.volumes.some((volume) => volume.type === 'volume'));
const secrets = await Promise.all(
  Object.values(config.secrets).map(async ({ file }) => readFile(file))
);
const needles = secrets.filter((value) => value.length >= 32);
const overlap = Math.max(...needles.map((value) => value.length)) - 1;
const images = ['backend', 'frontend', 'nginx', 'migrate'].map(
  (name) => config.services[name].image ?? `${config.name}-${name}`
);
const runtimeCheck = spawnSync(
  docker,
  [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--entrypoint',
    'sh',
    images[0],
    '-c',
    'test "$(id -u)" != 0 && test ! -e /app/.env && test ! -d /app/src && test ! -d /app/tests && test ! -d /app/node_modules/prisma && test ! -d /app/node_modules/typescript',
  ],
  { env, encoding: 'utf8' }
);
assert.equal(
  runtimeCheck.status,
  0,
  'Runtime must be nonroot and exclude private files, source, tests, Prisma CLI, and TypeScript'
);
await mkdir('.local', { recursive: true });
const temporary = await mkdtemp('.local/image-audit-');
const archive = join(temporary, 'images.tar');
try {
  const saved = spawnSync(docker, ['image', 'save', ...images, '-o', archive], {
    env,
    encoding: 'utf8',
  });
  assert.equal(saved.status, 0, saved.stderr);
  const manifest = spawnSync('tar', ['-xOf', archive, 'manifest.json'], { encoding: 'utf8' });
  assert.equal(manifest.status, 0, manifest.stderr);
  const entries = new Set(
    JSON.parse(manifest.stdout).flatMap((image) => [image.Config, ...image.Layers])
  );
  for (const entry of entries) {
    const child = spawn('tar', ['-xOf', archive, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error('Cannot extract image layer'))
      );
    });
    child.stderr.resume();
    const iterator = child.stdout[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.ok(!first.done, 'Empty archive entry');
    const compressed = first.value[0] === 0x1f && first.value[1] === 0x8b;
    assert.ok(
      !(first.value[0] === 0x28 && first.value[1] === 0xb5),
      'Zstandard layers require a separate decompression audit'
    );
    const source = Readable.from(
      (async function* () {
        yield first.value;
        for await (const chunk of iterator) yield chunk;
      })()
    );
    const decoded = compressed ? source.pipe(createGunzip()) : source;
    let previous = Buffer.alloc(0);
    let leaked = false;
    for await (const chunk of decoded) {
      const data = Buffer.concat([previous, chunk]);
      if (needles.some((needle) => data.includes(needle))) leaked = true;
      previous = data.subarray(Math.max(0, data.length - overlap));
    }
    await exited;
    assert.ok(!leaked, 'A mounted secret appears in a decoded image layer or image configuration');
  }
} finally {
  if (existsSync(archive)) await unlink(archive);
  await rmdir(temporary);
}
console.log(
  'Audit passed: only proxy ports published, internal data/web networks, persistent PostgreSQL, no interpolated credentials, no mounted secret bytes in image layers.'
);
