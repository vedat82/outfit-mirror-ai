export function sanitizeAppearanceProfileForSeeOnMe(appearanceProfile = {}) {
  const { photos, ...profileWithoutPhotos } = appearanceProfile || {};

  return profileWithoutPhotos;
}
