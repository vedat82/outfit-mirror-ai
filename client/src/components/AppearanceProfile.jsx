import { useRef, useState } from 'react';
import { maxAppearancePhotos } from '../api/appearanceProfile.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { compressImageFile } from '../utils/imageCompression.js';
import { imageSources, isNativeImagePickerCancel, pickNativeImageDataUrl } from '../utils/nativeImagePicker.js';
import { isNativeApp } from '../utils/platform.js';

const genders = ['male', 'female', 'non-binary', 'prefer not to say'];
const bodyTypes = ['slim', 'athletic', 'muscular', 'bulky', 'overweight', 'skinny-fat', 'petite', 'plus-size'];
const heights = ['short', 'medium', 'tall'];
const skinTones = ['light', 'medium', 'dark'];
const styleGoals = ['look bigger', 'slimmer', 'casual', 'elegant'];

export default function AppearanceProfile({ profile, accessStatus, onSave, showPhotoTools = true }) {
  const { t, optionLabel } = useI18n();
  const [draftProfile, setDraftProfile] = useState(profile);
  const libraryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canUseUserPhotoUpload = accessStatus.canUseUserPhotoUpload;
  const canUploadMore = canUseUserPhotoUpload && draftProfile.photos.length < maxAppearancePhotos;

  function analyzePhoto(fileName, currentCount) {
    const name = fileName.toLowerCase();
    const gender = name.includes('male') || name.includes('erkek') ? 'male' : name.includes('female') || name.includes('kadin') || name.includes('kadın') ? 'female' : 'prefer not to say';
    const bodyType = name.includes('skinny') ? 'skinny-fat' : name.includes('petite') ? 'petite' : name.includes('plus') ? 'plus-size' : name.includes('muscular') || name.includes('kasli') || name.includes('kaslı') ? 'muscular' : name.includes('overweight') ? 'overweight' : name.includes('slim') || name.includes('ince') ? 'slim' : name.includes('bulky') || name.includes('iri') ? 'bulky' : 'athletic';
    const height = name.includes('short') || name.includes('kisa') || name.includes('kısa') ? 'short' : name.includes('tall') || name.includes('uzun') ? 'tall' : 'medium';
    const skinTone = name.includes('light') || name.includes('acik') || name.includes('açık') ? 'light' : name.includes('dark') || name.includes('koyu') ? 'dark' : 'medium';

    return { gender, bodyType, height, skinTone };
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setDraftProfile((current) => ({ ...current, [name]: value }));
  }

  function addPhotoToDraft(imageDataUrl, fileName = '', index = 0) {
    setDraftProfile((current) => {
      const nextPhotos = [
        ...current.photos,
        {
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
          imageUrl: imageDataUrl
        }
      ].slice(0, maxAppearancePhotos);

      return {
        ...current,
        ...analyzePhoto(fileName, nextPhotos.length),
        photos: nextPhotos
      };
    });
  }

  function handlePhotoChange(event) {
    const files = Array.from(event.target.files || []).slice(0, maxAppearancePhotos - draftProfile.photos.length);
    if (files.length === 0) return;

    files.forEach((file, index) => {
      compressImageFile(file, { maxDimension: 840, quality: 0.68 }).then((imageDataUrl) => addPhotoToDraft(imageDataUrl, file.name, index));
    });

    event.target.value = '';
  }

  async function handleNativePhotoPick(source, fallbackInputRef) {
    if (!canUploadMore) return;

    try {
      const imageDataUrl = await pickNativeImageDataUrl({
        source,
        maxDimension: 840,
        quality: 0.68
      });

      if (imageDataUrl) {
        addPhotoToDraft(imageDataUrl, source);
        return;
      }
    } catch (error) {
      if (isNativeImagePickerCancel(error)) return;
      if (isNativeApp()) return;
    }

    fallbackInputRef.current?.click();
  }

  function handleRemovePhoto(photoId) {
    setDraftProfile((current) => ({
      ...current,
      photos: current.photos.filter((photo) => photo.id !== photoId)
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(draftProfile);
  }

  return (
    <form onSubmit={handleSubmit} className="grid w-full max-w-full min-w-0 gap-5 overflow-hidden rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{t('profile.appearancePreferencesTitle')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('appearance.description')}</p>
      </div>

      {showPhotoTools ? (
        <>
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{t('appearance.photos')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('appearance.photoLimit', { count: draftProfile.photos.length, max: maxAppearancePhotos })}</p>
                {!canUseUserPhotoUpload ? <p className="mt-2 text-xs font-semibold text-amber-700">🔒 {t('premium.availableInPremium')}</p> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleNativePhotoPick(imageSources.photos, libraryInputRef)}
                  disabled={!canUploadMore}
                  className={`rounded-md px-3 py-2 text-center text-sm font-semibold transition ${
                  canUploadMore
                    ? 'cursor-pointer border border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700'
                    : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                }`}
                >
                  {!canUseUserPhotoUpload ? '🔒 ' : ''}{t('buttons.uploadUserPhoto')}
                </button>
                <button
                  type="button"
                  onClick={() => handleNativePhotoPick(imageSources.camera, cameraInputRef)}
                  disabled={!canUploadMore}
                  className={`rounded-md px-3 py-2 text-center text-sm font-semibold transition ${
                  canUploadMore
                    ? 'cursor-pointer border border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700'
                    : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                }`}
                >
                  {!canUseUserPhotoUpload ? '🔒 ' : ''}{t('buttons.takePhoto')}
                </button>
                <input ref={libraryInputRef} type="file" accept="image/*" multiple disabled={!canUploadMore} className="sr-only" onChange={handlePhotoChange} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="user" disabled={!canUploadMore} className="sr-only" onChange={handlePhotoChange} />
              </div>
            </div>

            {draftProfile.photos.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {draftProfile.photos.map((photo) => (
                  <div key={photo.id} className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
                    <img src={photo.imageUrl} alt={t('appearance.previewAlt')} className="h-28 w-full object-cover" loading="lazy" decoding="async" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="absolute right-1 top-1 rounded bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm"
                    >
                      {t('buttons.remove')}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-5 text-center">
                <p className="text-sm font-semibold text-slate-800">{t('appearance.emptyPhotosTitle')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('appearance.emptyPhotosDescription')}</p>
              </div>
            )}
          </div>

          <div className="rounded-md border border-teal-100 bg-teal-50 p-4 text-sm text-teal-950">
            <p className="font-semibold">{t('appearance.analysisTitle')}</p>
            <p className="mt-1">{t('appearance.analysisDescription')}</p>
          </div>
        </>
      ) : null}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          {t('appearance.gender')}
          <select name="gender" value={draftProfile.gender} onChange={handleFieldChange} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
            {genders.map((gender) => (
              <option key={gender} value={gender}>
                {optionLabel('genders', gender)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          {t('preferences.bodyType')}
          <select name="bodyType" value={draftProfile.bodyType} onChange={handleFieldChange} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
            {bodyTypes.map((bodyType) => (
              <option key={bodyType} value={bodyType}>
                {optionLabel('bodyTypes', bodyType)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          {t('preferences.height')}
          <select name="height" value={draftProfile.height} onChange={handleFieldChange} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
            {heights.map((height) => (
              <option key={height} value={height}>
                {optionLabel('heights', height)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          {t('appearance.skinTone')}
          <select name="skinTone" value={draftProfile.skinTone} onChange={handleFieldChange} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
            {skinTones.map((skinTone) => (
              <option key={skinTone} value={skinTone}>
                {optionLabel('skinTones', skinTone)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          {t('preferences.styleGoal')}
          <select name="styleGoal" value={draftProfile.styleGoal || 'casual'} onChange={handleFieldChange} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
            {styleGoals.map((styleGoal) => (
              <option key={styleGoal} value={styleGoal}>
                {optionLabel('styleGoals', styleGoal)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">{t('appearance.logicTitle')}</p>
        <p className="mt-1">{t('appearance.logicDescription')}</p>
      </div>

      <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
        {t('buttons.saveAppearance')}
      </button>
    </form>
  );
}
