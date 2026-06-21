import { db } from '../db.js';

const tierLimits = {
  free: Number(process.env.AI_DAILY_FREE_LIMIT || 3),
  trial: Number(process.env.AI_DAILY_TRIAL_LIMIT || 45),
  premium: Number(process.env.AI_DAILY_PREMIUM_LIMIT || 180)
};

const modelCosts = {
  nano: 1,
  mini: 3,
  pro: 15
};

const sumUsage = db.prepare(`
  SELECT COALESCE(SUM(credits), 0) as credits
  FROM ai_usage
  WHERE user_id = ? AND usage_date = ?
`);

const insertUsage = db.prepare(`
  INSERT INTO ai_usage (user_id, usage_date, access_tier, task_type, model_tier, credits)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeAccessTier(value) {
  return ['free', 'trial', 'premium'].includes(value) ? value : 'free';
}

export function getModelCost(modelTier) {
  return modelCosts[modelTier] || modelCosts.nano;
}

export function getAiUsageState(userId, accessTier) {
  const normalizedTier = normalizeAccessTier(accessTier);
  const date = todayKey();
  const usedCredits = Number(sumUsage.get(userId, date)?.credits || 0);
  const limit = tierLimits[normalizedTier] || tierLimits.free;
  const remainingCredits = Math.max(0, limit - usedCredits);
  const usageRatio = limit > 0 ? usedCredits / limit : 1;

  return {
    date,
    accessTier: normalizedTier,
    usedCredits,
    remainingCredits,
    limit,
    isNearLimit: usageRatio >= 0.8,
    isHeavyUsage: usageRatio >= 0.65,
    isLimitReached: remainingCredits <= 0
  };
}

export function canSpendAiCredits(userId, accessTier, modelTier) {
  const usage = getAiUsageState(userId, accessTier);
  return {
    ...usage,
    requestedCredits: getModelCost(modelTier),
    canSpend: usage.remainingCredits >= getModelCost(modelTier)
  };
}

export function recordAiUsage({ userId, accessTier, taskType, modelTier }) {
  const usage = getAiUsageState(userId, accessTier);
  const credits = getModelCost(modelTier);

  insertUsage.run(userId, usage.date, usage.accessTier, taskType, modelTier, credits);

  return getAiUsageState(userId, accessTier);
}
