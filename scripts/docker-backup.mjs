import { existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const [output, ...composeArgs] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/docker-backup.mjs OUTPUT [Compose options]');
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
const configResult = spawnSync(docker, ['compose', ...composeArgs, 'config', '--format', 'json'], {
  env,
  encoding: 'utf8',
});
if (configResult.status !== 0) throw new Error('Cannot read Compose configuration');
const config = JSON.parse(configResult.stdout);
const database = config.services.postgres.environment.LINKFLOW_DB_NAME;
const file = openSync(output, 'wx', 0o600);
let result;
try {
  result = spawnSync(
    docker,
    [
      'compose',
      ...composeArgs,
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      database,
      '-Fc',
    ],
    {
      env,
      stdio: ['ignore', file, 'inherit'],
    }
  );
} finally {
  closeSync(file);
}
if (result.error || result.status !== 0) {
  unlinkSync(output);
  throw new Error('Backup failed; partial output removed');
}
console.log(`PostgreSQL backup written: ${output}`);
