import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dockerDirectory =
  process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin')
    : '';
const candidate = join(dockerDirectory, 'docker.exe');
const docker = process.platform === 'win32' && existsSync(candidate) ? candidate : 'docker';
const env = { ...process.env };
if (dockerDirectory) env.PATH = `${dockerDirectory};${env.PATH}`;
const production = process.argv.includes('--production');
const envFile =
  process.argv.find((value, index) => process.argv[index - 1] === '--env-file') ??
  (production ? '.env.production' : '.env');
const compose = ['compose', '--env-file', envFile, '-f', 'docker-compose.yml'];
if (production) compose.push('-f', 'docker-compose.prod.yml');
function run(...args) {
  const result = spawnSync(docker, [...compose, ...args], { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('config', '--quiet');
run('build', 'backend', 'frontend', 'nginx', 'migrate');
run('up', '-d', '--wait', '--wait-timeout', '120', 'postgres', 'redis');
// Always run the current release's migrations. An old completed job is not a deployment gate.
run('run', '--rm', '--no-deps', 'migrate');
run('up', '-d', '--no-build', '--force-recreate', 'backend', 'frontend', 'nginx');
run('ps', '-a');
