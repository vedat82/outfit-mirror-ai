import { defaultPremiumPlanId, getPlanById, getPlanByState, subscriptionStates } from '../config/pricing.js';

const storageKey = 'daily-outfit-planner:userId';
const premiumStorageKey = 'daily-outfit-planner:isPremium';
const subscriptionPlanStorageKey = 'daily-outfit-planner:subscriptionPlan';
const trialStartDateStorageKey = 'daily-outfit-planner:trialStartDate';
const dailySuggestionUsageKey = 'daily-outfit-planner:dailySuggestionUsage';
export const freeDailySuggestionLimit = 3;
export const trialLengthDays = 3;
const localTrialEnabled = import.meta.env.VITE_ENABLE_LOCAL_TRIAL === 'true';

function createUserId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getLocalUserId() {
  const existingUserId = localStorage.getItem(storageKey);

  if (existingUserId) {
    return existingUserId;
  }

  const userId = createUserId();
  localStorage.setItem(storageKey, userId);

  return userId;
}

export function getIsPremium() {
  return localStorage.getItem(premiumStorageKey) === 'true';
}

export function getPremiumPlanId() {
  return getIsPremium() ? localStorage.getItem(subscriptionPlanStorageKey) || defaultPremiumPlanId : '';
}

export function setPremiumPlan(planId) {
  const plan = getPlanById(planId);
  localStorage.setItem(subscriptionPlanStorageKey, plan.id);
  return plan.id;
}

export function setIsPremium(isPremium, planId = defaultPremiumPlanId) {
  localStorage.setItem(premiumStorageKey, String(Boolean(isPremium)));
  if (isPremium) {
    setPremiumPlan(planId);
  } else {
    localStorage.removeItem(subscriptionPlanStorageKey);
  }
  return Boolean(isPremium);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getTrialStartDate() {
  return localStorage.getItem(trialStartDateStorageKey);
}

export function getAccessStatus() {
  const isPremium = getIsPremium();
  const premiumPlanId = getPremiumPlanId();
  const premiumPlan = premiumPlanId ? getPlanById(premiumPlanId) : null;
  const trialStartDate = getTrialStartDate();
  const hasTrialStarted = localTrialEnabled && Boolean(trialStartDate);
  const trialStart = hasTrialStarted ? new Date(`${trialStartDate}T00:00:00`) : null;
  const trialEnd = trialStart ? new Date(trialStart) : null;

  if (trialStart && trialEnd) {
    trialEnd.setDate(trialStart.getDate() + trialLengthDays);
  }

  const now = new Date();
  const isTrialActive = Boolean(trialEnd && now < trialEnd);
  const millisecondsLeft = trialEnd ? Math.max(0, trialEnd.getTime() - now.getTime()) : 0;
  const trialDaysLeft = isTrialActive ? Math.max(1, Math.ceil(millisecondsLeft / (1000 * 60 * 60 * 24))) : 0;
  const hasFullAccess = isPremium || isTrialActive;
  const subscriptionState = isPremium
    ? premiumPlan?.state || subscriptionStates.premiumMonthly
    : isTrialActive
      ? subscriptionStates.trial
      : subscriptionStates.free;
  const tier = isPremium ? 'premium' : isTrialActive ? 'trial' : 'free';

  return {
    isPremium,
    premiumPlanId,
    premiumPlan,
    subscriptionState,
    subscriptionLabelKey: getPlanByState(subscriptionState) ? `premium.subscriptionStates.${subscriptionState}` : `premium.subscriptionStates.${subscriptionState}`,
    trialStartDate,
    hasTrialStarted,
    isTrialActive,
    isTrialEnded: hasTrialStarted && !isTrialActive && !isPremium,
    trialDaysLeft,
    trialEndDate: trialEnd ? formatDateKey(trialEnd) : '',
    tier,
    hasFullAccess,
    canStartTrial: !isPremium && !hasTrialStarted,
    dailySuggestionLimit: hasFullAccess ? null : freeDailySuggestionLimit,
    canUseManualClothesEntry: true,
    canUseUnlimitedOutfits: hasFullAccess,
    canUseImageUpload: hasFullAccess,
    canUseUserPhotoUpload: hasFullAccess,
    canUseOutfitPhotoAnalysis: hasFullAccess,
    canUseSeeOnMe: hasFullAccess,
    canUseAdvancedOutfitLogic: hasFullAccess
  };
}

export function getHasFullAccess() {
  return getAccessStatus().hasFullAccess;
}

export function getCanUseAdvancedOutfitLogic() {
  return getAccessStatus().canUseAdvancedOutfitLogic;
}

function getTodayKey() {
  return formatDateKey(new Date());
}

export function getDailySuggestionUsage() {
  const today = getTodayKey();
  const emptyUsage = { date: today, count: 0 };
  const storedUsage = localStorage.getItem(dailySuggestionUsageKey);

  if (!storedUsage) {
    localStorage.setItem(dailySuggestionUsageKey, JSON.stringify(emptyUsage));
    return emptyUsage;
  }

  try {
    const usage = JSON.parse(storedUsage);

    if (usage.date === today && Number.isInteger(usage.count)) {
      return usage;
    }
  } catch {
    // Replace invalid local data with a clean daily counter.
  }

  localStorage.setItem(dailySuggestionUsageKey, JSON.stringify(emptyUsage));
  return emptyUsage;
}

export function incrementDailySuggestionUsage() {
  const usage = getDailySuggestionUsage();
  const nextUsage = {
    ...usage,
    count: usage.count + 1
  };

  localStorage.setItem(dailySuggestionUsageKey, JSON.stringify(nextUsage));
  return nextUsage;
}
