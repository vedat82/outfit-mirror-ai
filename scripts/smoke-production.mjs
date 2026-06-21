import assert from 'node:assert/strict';

const baseUrl = String(process.env.OUTFIT_API_BASE_URL || 'https://api.veerapps.com').replace(/\/+$/, '');

async function fetchWithRetry(url, options = {}, attempts = 12) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15_000)
      });

      if (response.status < 500 || attempt === attempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw lastError || new Error(`Request failed: ${url}`);
}

const healthResponse = await fetchWithRetry(`${baseUrl}/api/health`);
assert.equal(healthResponse.status, 200, 'Outfit health endpoint must return HTTP 200');
assert.deepEqual(await healthResponse.json(), { status: 'ok' });

const clothesResponse = await fetchWithRetry(`${baseUrl}/api/clothes`, {
  headers: { 'x-user-id': 'production-smoke-readonly' }
});
assert.equal(clothesResponse.status, 200, 'Outfit clothes endpoint must return HTTP 200');
assert.equal(Array.isArray(await clothesResponse.json()), true, 'Outfit clothes response must be an array');

console.log(`Outfit production smoke passed: ${baseUrl}`);
