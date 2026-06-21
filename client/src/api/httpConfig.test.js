import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('production build targets the public Outfit API', () => {
  const productionEnv = fs.readFileSync(new URL('../../.env.production', import.meta.url), 'utf8');
  const apiUrl = productionEnv
    .split(/\r?\n/)
    .find((line) => line.startsWith('VITE_API_BASE_URL='))
    ?.split('=')
    .slice(1)
    .join('=');

  assert.equal(apiUrl, 'https://api.veerapps.com');
});
