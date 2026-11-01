import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testEnvironment } from './test-env.js';

testEnvironment();
const cli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
