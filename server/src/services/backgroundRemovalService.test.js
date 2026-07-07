import assert from 'node:assert/strict';
import test from 'node:test';
import { removeBackgroundFromImage } from './backgroundRemovalService.js';

const sampleImage = `data:image/png;base64,${Buffer.from('fake-image').toString('base64')}`;

function withEnv(overrides, callback) {
  const previousValues = {};

  for (const key of Object.keys(overrides)) {
    previousValues[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previousValues)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test('background removal is disabled by default', async () => {
  await withEnv({
    BACKGROUND_REMOVAL_ENABLED: undefined,
    BACKGROUND_REMOVAL_PROVIDER: undefined,
    REMOVEBG_API_KEY: undefined
  }, async () => {
    const result = await removeBackgroundFromImage(sampleImage);

    assert.equal(result.imageUrl, sampleImage);
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'disabled');
  });
});

test('remove.bg provider falls back when the API key is missing', async () => {
  await withEnv({
    BACKGROUND_REMOVAL_ENABLED: 'true',
    BACKGROUND_REMOVAL_PROVIDER: 'removebg',
    REMOVEBG_API_KEY: undefined
  }, async () => {
    const result = await removeBackgroundFromImage(sampleImage);

    assert.equal(result.imageUrl, sampleImage);
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'missing-key');
  });
});

test('remove.bg provider returns a transparent image data url on success', async () => {
  await withEnv({
    BACKGROUND_REMOVAL_ENABLED: 'true',
    BACKGROUND_REMOVAL_PROVIDER: 'removebg',
    REMOVEBG_API_KEY: 'test-key'
  }, async () => {
    const resultImage = Buffer.from('cutout-image');
    const fetchImpl = async (_url, options) => {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Api-Key'], 'test-key');
      assert.ok(options.body instanceof FormData);

      return new Response(resultImage, {
        status: 200,
        headers: { 'content-type': 'image/png' }
      });
    };

    const result = await removeBackgroundFromImage(sampleImage, { fetchImpl, silent: true });

    assert.equal(result.changed, true);
    assert.equal(result.provider, 'removebg');
    assert.equal(result.imageUrl, `data:image/png;base64,${resultImage.toString('base64')}`);
    assert.ok(result.durationMs >= 0);
  });
});

test('remove.bg provider keeps the original image when the API fails', async () => {
  await withEnv({
    BACKGROUND_REMOVAL_ENABLED: 'true',
    BACKGROUND_REMOVAL_PROVIDER: 'removebg',
    REMOVEBG_API_KEY: 'test-key'
  }, async () => {
    const fetchImpl = async () => new Response('quota exceeded', { status: 429 });
    const result = await removeBackgroundFromImage(sampleImage, { fetchImpl, silent: true });

    assert.equal(result.imageUrl, sampleImage);
    assert.equal(result.changed, false);
    assert.equal(result.provider, 'removebg');
    assert.equal(result.reason, 'provider-failed');
    assert.equal(result.statusCode, 429);
  });
});
