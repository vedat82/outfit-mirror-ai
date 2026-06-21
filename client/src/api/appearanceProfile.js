const storageKey = 'daily-outfit-planner:appearance-profile';
const maxAppearancePhotos = 3;

export const defaultAppearanceProfile = {
  photos: [],
  gender: 'prefer not to say',
  bodyType: 'athletic',
  height: 'medium',
  skinTone: 'medium'
};

export { maxAppearancePhotos };

export function getAppearanceProfile() {
  const storedProfile = localStorage.getItem(storageKey);

  if (!storedProfile) {
    return defaultAppearanceProfile;
  }

  try {
    const parsedProfile = JSON.parse(storedProfile);

    return {
      ...defaultAppearanceProfile,
      ...parsedProfile,
      photos: Array.isArray(parsedProfile.photos) ? parsedProfile.photos.slice(0, maxAppearancePhotos) : []
    };
  } catch {
    return defaultAppearanceProfile;
  }
}

export function saveAppearanceProfile(profile) {
  const nextProfile = {
    photos: Array.isArray(profile.photos) ? profile.photos.slice(0, maxAppearancePhotos) : [],
    gender: profile.gender || defaultAppearanceProfile.gender,
    bodyType: profile.bodyType || defaultAppearanceProfile.bodyType,
    height: profile.height || defaultAppearanceProfile.height,
    skinTone: profile.skinTone || defaultAppearanceProfile.skinTone
  };

  localStorage.setItem(storageKey, JSON.stringify(nextProfile));
  return nextProfile;
}
