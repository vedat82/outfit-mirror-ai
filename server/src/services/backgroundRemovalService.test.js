import assert from 'node:assert/strict';
import test from 'node:test';
import { removeBackgroundFromImage } from './backgroundRemovalService.js';
import { db } from '../db.js';

const sampleImage = `data:image/png;base64,${Buffer.from('fake-image').toString('base64')}`;
const secondSampleImage = `data:image/png;base64,${Buffer.from('second-fake-image').toString('base64')}`;

function cleanupUser(userId) {
  db.prepare('DELETE FROM background_removal_cache WHERE user_id = ?').run(userId);
}

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

test('fal BRIA provider uploads the image and returns a cutout', async () => {
  await withEnv({
    BACKGROUND_REMOVAL_ENABLED: 'true',
    BACKGROUND_REMOVAL_PROVIDER: 'fal_bria',
    FAL_KEY: 'test-fal-key',
    BACKGROUND_REMOVAL_USER_LIMIT: '50'
  }, async () => {
    const resultImage = Buffer.from('fal-cutout-image');
    const falClient = {
      config(value) {
        assert.equal(value.credentials, 'test-fal-key');
      },
      storage: {
        async upload(file) {
          assert.ok(file instanceof Blob);
          return 'https://fal.storage/input.png';
        }
      },
      async subscribe(model, options) {
        assert.equal(model, 'fal-ai/bria/background/remove');
        assert.equal(options.input.image_url, 'https://fal.storage/input.png');
        assert.equal(options.input.sync_mode, true);
        return {
          data: {
            image: {
              url: 'https://fal.storage/output.png'
            }
          }
        };
      }
    };
    const fetchImpl = async (url) => {
      assert.equal(url, 'https://fal.storage/output.png');
      return new Response(resultImage, {
        status: 200,
        headers: { 'content-type': 'image/png' }
      });
    };

    const result = await removeBackgroundFromImage(sampleImage, { falClient, fetchImpl, silent: true });

    assert.equal(result.changed, true);
    assert.equal(result.provider, 'fal_bria');
    assert.equal(result.imageUrl, `data:image/png;base64,${resultImage.toString('base64')}`);
    assert.ok(result.durationMs >= 0);
  });
});

test('background removal caches per user and enforces the successful removal limit', async () => {
  const userId = 'bg-test-limit-user';
  cleanupUser(userId);

  await withEnv({
    BACKGROUND_REMOVAL_ENABLED: 'true',
    BACKGROUND_REMOVAL_PROVIDER: 'fal_bria',
    FAL_KEY: 'test-fal-key',
    BACKGROUND_REMOVAL_USER_LIMIT: '1',
    BACKGROUND_REMOVAL_ESTIMATED_COST_USD: '0.018'
  }, async () => {
    let subscribeCalls = 0;
    const resultImage = Buffer.from('cached-cutout-image');
    const falClient = {
      config() {},
      storage: {
        async upload() {
          return 'https://fal.storage/input.png';
        }
      },
      async subscribe() {
        subscribeCalls += 1;
        return {
          data: {
            image: {
              url: 'https://fal.storage/output.png'
            }
          }
        };
      }
    };
    const fetchImpl = async () => new Response(resultImage, {
      status: 200,
      headers: { 'content-type': 'image/png' }
    });

    const first = await removeBackgroundFromImage(sampleImage, { userId, falClient, fetchImpl, silent: true });
    const cached = await removeBackgroundFromImage(sampleImage, { userId, falClient, fetchImpl, silent: true });
    const limited = await removeBackgroundFromImage(secondSampleImage, { userId, falClient, fetchImpl, silent: true });

    assert.equal(first.changed, true);
    assert.equal(first.cost.used, 1);
    assert.equal(first.cost.maxUserCostUsd, 0.018);
    assert.equal(cached.changed, true);
    assert.equal(cached.cached, true);
    assert.equal(cached.reason, 'cached');
    assert.equal(limited.changed, false);
    assert.equal(limited.reason, 'user-limit-reached');
    assert.equal(subscribeCalls, 1);
  });

  cleanupUser(userId);
});
