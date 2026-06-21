import { canSpendAiCredits } from './aiUsageService.js';

const tierOrder = ['nano', 'mini', 'pro'];

export const modelByTier = {
  nano: process.env.OPENAI_NANO_MODEL || 'gpt-4.1-nano',
  mini: process.env.OPENAI_MINI_MODEL || process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
  pro: process.env.OPENAI_PRO_MODEL || 'gpt-4o'
};

function nextStrongerTier(modelTier) {
  const index = tierOrder.indexOf(modelTier);
  return tierOrder[Math.min(index + 1, tierOrder.length - 1)] || modelTier;
}

function chooseBaseTier(taskType, accessTier) {
  if (taskType === 'clothing') {
    return 'nano';
  }

  if (taskType === 'outfit') {
    return accessTier === 'premium' ? 'pro' : 'mini';
  }

  return 'mini';
}

function downgradeForUsage(modelTier, taskType, usage) {
  if (!usage.isHeavyUsage) {
    return modelTier;
  }

  if (modelTier === 'pro') {
    return 'mini';
  }

  if (modelTier === 'mini' && taskType === 'clothing') {
    return 'nano';
  }

  return modelTier;
}

function canUseTierForTask(modelTier, taskType) {
  if (taskType === 'clothing') {
    return modelTier === 'nano' || modelTier === 'mini';
  }

  if (taskType === 'outfit') {
    return modelTier === 'mini' || modelTier === 'pro';
  }

  return modelTier === 'mini' || modelTier === 'pro';
}

export function selectInitialAiModel({ userId, accessTier, taskType }) {
  let modelTier = chooseBaseTier(taskType, accessTier);
  let usage = canSpendAiCredits(userId, accessTier, modelTier);
  modelTier = downgradeForUsage(modelTier, taskType, usage);
  usage = canSpendAiCredits(userId, accessTier, modelTier);

  while (!usage.canSpend && tierOrder.indexOf(modelTier) > 0) {
    const nextTier = tierOrder[tierOrder.indexOf(modelTier) - 1];

    if (!canUseTierForTask(nextTier, taskType)) {
      break;
    }

    modelTier = nextTier;
    usage = canSpendAiCredits(userId, accessTier, modelTier);
  }

  return {
    modelTier,
    model: modelByTier[modelTier],
    usage
  };
}

export function selectUpgradeAiModel({ userId, accessTier, taskType, currentTier }) {
  const upgradedTier = nextStrongerTier(currentTier);

  if (upgradedTier === currentTier) {
    return null;
  }

  const usage = canSpendAiCredits(userId, accessTier, upgradedTier);

  if (!usage.canSpend) {
    return null;
  }

  if (taskType === 'clothing' && upgradedTier === 'pro') {
    return null;
  }

  return {
    modelTier: upgradedTier,
    model: modelByTier[upgradedTier],
    usage
  };
}
