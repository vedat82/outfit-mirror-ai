const storageKey = 'daily-outfit-planner:preferences';
const onboardingStorageKey = 'daily-outfit-planner:onboardingCompleted';

export const defaultPreferences = {
  preferredColors: [],
  preferredStyle: 'casual',
  styleGoal: 'casual'
};

export function getPreferences() {
  const storedPreferences = localStorage.getItem(storageKey);

  if (!storedPreferences) {
    return defaultPreferences;
  }

  try {
    return {
      ...defaultPreferences,
      ...JSON.parse(storedPreferences)
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences) {
  const nextPreferences = {
    preferredColors: preferences.preferredColors || [],
    preferredStyle: preferences.preferredStyle || defaultPreferences.preferredStyle,
    styleGoal: preferences.styleGoal || defaultPreferences.styleGoal
  };

  localStorage.setItem(storageKey, JSON.stringify(nextPreferences));
  return nextPreferences;
}

export function getOnboardingCompleted() {
  return localStorage.getItem(onboardingStorageKey) === 'true';
}

export function setOnboardingCompleted() {
  localStorage.setItem(onboardingStorageKey, 'true');
  return true;
}
