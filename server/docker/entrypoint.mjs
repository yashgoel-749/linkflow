import { open } from 'node:fs/promises';
import { isIP } from 'node:net';
import { constants } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function required(env, name) {
  const value = env[name];
  if (!value || /[\s\0]/u.test(value)) throw new Error(`${name} must be set without whitespace`);
  return value;
}

async function secret(env, name) {
  const path = required(env, `${name}_FILE`);
  let file;
  try {
    file = await open(path, 'r');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > 65536) throw new Error();
    const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await file.readFile()
    );
    if (!value || /[\s\0]/u.test(value)) throw new Error();
    return value;
  } catch {
    throw new Error(
      `${name}_FILE must reference a readable, nonempty UTF-8 file without whitespace or NUL`
    );
  } finally {
    await file?.close();
  }
}

function endpoint(env, prefix) {
  const host = required(env, `${prefix}_HOST`);
  const hostname =
    host.length <= 253 &&
    host.split('.').every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
  if (!isIP(host) && !hostname) {
    throw new Error(`${prefix}_HOST must be an IP address or hostname`);
  }
  const port = required(env, `${prefix}_PORT`);
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error(`${prefix}_PORT must be between 1 and 65535`);
  }
  return `${isIP(host) === 6 ? `[${host}]` : host}:${port}`;
}

const encode = (value) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );

export async function containerEnvironment(input) {
  const env = { ...input };
  for (const name of [
    'DATABASE_URL',
    'TEST_DATABASE_URL',
    'REDIS_URL',
    'DB_PASSWORD',
    'REDIS_PASSWORD',
    'JWT_SECRET',
    'VISITOR_SECRET',
  ]) {
    if (env[name] !== undefined)
      throw new Error(`${name} conflicts with Docker file-secret configuration`);
  }
  const databaseEndpoint = endpoint(env, 'DB');
  const user = encode(required(env, 'DB_USER'));
  const password = encode(await secret(env, 'DB_PASSWORD'));
  const databaseUrl = (name) =>
    `postgresql://${user}:${password}@${databaseEndpoint}/${encode(name)}`;
  env.DATABASE_URL = databaseUrl(required(env, 'DB_NAME'));
  if (env.TEST_DATABASE_NAME !== undefined) {
    const testName = required(env, 'TEST_DATABASE_NAME');
    if (testName === env.DB_NAME) throw new Error('TEST_DATABASE_NAME must differ from DB_NAME');
    env.TEST_DATABASE_URL = databaseUrl(testName);
  }
  if (Object.keys(env).some((name) => name.startsWith('REDIS_') && name !== 'REDIS_NAMESPACE')) {
    env.REDIS_URL = `redis://:${encode(await secret(env, 'REDIS_PASSWORD'))}@${endpoint(env, 'REDIS')}`;
  }
  for (const name of ['JWT_SECRET', 'VISITOR_SECRET']) {
    if (env[`${name}_FILE`] !== undefined) env[name] = await secret(env, name);
  }
  return env;
}

export async function run(command, input = process.env) {
  if (!command.length) throw new Error('A container command is required');
  const env = await containerEnvironment(input);
  const child = spawn(command[0], command.slice(1), { env, stdio: 'inherit' });
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  const handlers = signals.map((signal) => {
    const handler = () => child.kill(signal);
    process.on(signal, handler);
    return handler;
  });
  const cleanup = () =>
    signals.forEach((name, index) => process.removeListener(name, handlers[index]));
  child.once('error', () => {
    cleanup();
    process.stderr.write('Unable to start container command\n');
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    process.exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
