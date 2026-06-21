import test from 'node:test';
import assert from 'node:assert/strict';
import { selectInitialAiModel } from './aiModelRouter.js';
import { recordAiUsage } from './aiUsageService.js';

function makeUserId(label) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('routes simple clothing analysis to nano', () => {
  const route = selectInitialAiModel({
    userId: makeUserId('clothing'),
    accessTier: 'free',
    taskType: 'clothing'
  });

  assert.equal(route.modelTier, 'nano');
  assert.equal(route.usage.canSpend, true);
});

test('routes normal outfit analysis to mini for trial users', () => {
  const route = selectInitialAiModel({
    userId: makeUserId('trial-outfit'),
    accessTier: 'trial',
    taskType: 'outfit'
  });

  assert.equal(route.modelTier, 'mini');
  assert.equal(route.usage.canSpend, true);
});

test('routes premium outfit analysis to pro while usage is healthy', () => {
  const route = selectInitialAiModel({
    userId: makeUserId('premium-outfit'),
    accessTier: 'premium',
    taskType: 'outfit'
  });

  assert.equal(route.modelTier, 'pro');
  assert.equal(route.usage.canSpend, true);
});

test('quietly downgrades premium outfit analysis from pro to mini during heavy usage', () => {
  const userId = makeUserId('heavy-premium');

  for (let index = 0; index < 8; index += 1) {
    recordAiUsage({ userId, accessTier: 'premium', taskType: 'outfit', modelTier: 'pro' });
  }

  const route = selectInitialAiModel({
    userId,
    accessTier: 'premium',
    taskType: 'outfit'
  });

  assert.equal(route.modelTier, 'mini');
  assert.equal(route.usage.canSpend, true);
});

test('does not downgrade outfit analysis to nano when only nano credits remain', () => {
  const userId = makeUserId('no-outfit-nano');

  recordAiUsage({ userId, accessTier: 'free', taskType: 'clothing', modelTier: 'nano' });

  const route = selectInitialAiModel({
    userId,
    accessTier: 'free',
    taskType: 'outfit'
  });

  assert.equal(route.modelTier, 'mini');
  assert.equal(route.usage.canSpend, false);
});

test('stops free clothing analysis when the hidden daily limit is reached', () => {
  const userId = makeUserId('free-limit');

  for (let index = 0; index < 3; index += 1) {
    recordAiUsage({ userId, accessTier: 'free', taskType: 'clothing', modelTier: 'nano' });
  }

  const route = selectInitialAiModel({
    userId,
    accessTier: 'free',
    taskType: 'clothing'
  });

  assert.equal(route.modelTier, 'nano');
  assert.equal(route.usage.canSpend, false);
});
