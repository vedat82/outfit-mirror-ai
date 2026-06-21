import assert from 'node:assert/strict';

const baseUrl = String(process.env.OUTFIT_API_BASE_URL || 'https://api.veerapps.com').replace(/\/+$/, '');
const requestOptions = { signal: AbortSignal.timeout(15_000) };

const healthResponse = await fetch(`${baseUrl}/api/health`, requestOptions);
assert.equal(healthResponse.status, 200, 'Outfit health endpoint must return HTTP 200');
assert.deepEqual(await healthResponse.json(), { status: 'ok' });

const clothesResponse = await fetch(`${baseUrl}/api/clothes`, {
  ...requestOptions,
  headers: { 'x-user-id': 'production-smoke-readonly' }
});
assert.equal(clothesResponse.status, 200, 'Outfit clothes endpoint must return HTTP 200');
assert.equal(Array.isArray(await clothesResponse.json()), true, 'Outfit clothes response must be an array');

console.log(`Outfit production smoke passed: ${baseUrl}`);
