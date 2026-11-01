import assert from 'node:assert/strict';
import { get } from 'node:http';

// Run through stdin inside disposable clients on the proxy network.
const [path, hostname, host] = process.argv.slice(2);
const response = await new Promise((resolve, reject) => {
  const req = get(
    {
      hostname,
      port: 8080,
      path,
      headers: {
        Host: host,
        'User-Agent': 'DockerSmoke/1',
        'X-Forwarded-For': '192.0.2.50',
      },
    },
    resolve
  );
  req.on('error', reject);
});
response.resume();
assert.equal(response.statusCode, 302);
console.log('Distinct-network-client redirect passed.');
