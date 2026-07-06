import { useEffect, useRef, useState } from 'react';
import { analyzeImage } from '../api/ai.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { compressImageFile, createItemPreviewImages } from '../utils/imageCompression.js';
import { imageSources, isNativeImagePickerCancel, pickNativeImageDataUrl } from '../utils/nativeImagePicker.js';
import { isNativeApp } from '../utils/platform.js';

const types = ['tshirt', 'shirt', 'long sleeve', 'jacket', 'pants', 'shoes'];
const colors = ['black', 'white', 'gray', 'blue', 'navy', 'beige', 'brown', 'red', 'green', 'pink', 'cream'];
const seasons = ['all', 'spring', 'summer', 'fall', 'winter'];
const styles = ['casual', 'formal', 'sporty', 'classic'];

const initialForm = {
  id: 1,
  type: '',
  color: '',
  season: 'all',
  style: 'casual',
  confidence: 1,
  selected: true,
  imageUrl: '',
  box: null,
  uncertainFields: []
};

export default function AddClothingForm({ onAdd, isLoading, accessStatus, initialPhotoSourceRequest = null }) {
  const { t, optionLabel, language } = useI18n();
  const [detectedItems, setDetectedItems] = useState([initialForm]);
  const [previewImage, setPreviewImage] = useState('');
  const [analysisState, setAnalysisState] = useState('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const libraryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const analysisRequestRef = useRef(0);
  const autoPickRequestRef = useRef(0);
  const canUseImageUpload = accessStatus.canUseImageUpload;

  useEffect(() => {
    return () => {
      if (previewImage.startsWith('blob:')) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  useEffect(() => {
    const requestId = Number(initialPhotoSourceRequest?.requestId || 0);
    const source = initialPhotoSourceRequest?.source;

    if (!requestId || autoPickRequestRef.current === requestId) return;
    if (![imageSources.photos, imageSources.camera].includes(source)) return;
    if (!canUseImageUpload || isLoading) return;

    autoPickRequestRef.current = requestId;
    const fallbackRef = source === imageSources.camera ? cameraInputRef : libraryInputRef;
    window.setTimeout(() => {
      handleNativeImagePick(source, fallbackRef);
    }, 120);
  }, [canUseImageUpload, initialPhotoSourceRequest, isLoading]);

  function normalizeOption(group, value, options) {
    const cleanValue = value.trim();
    const normalizedValue = cleanValue.toLocaleLowerCase();
    const matchedOption = options.find((option) => {
      const rawOption = option.toLocaleLowerCase();
      const translatedOption = optionLabel(group, option).toLocaleLowerCase();

      return normalizedValue === rawOption || normalizedValue === translatedOption;
    });

    return matchedOption ?? cleanValue;
  }

  function makeDetectedItem(item, index, imageUrl = '') {
    return {
      id: Date.now() + index,
      type: item.type,
      color: item.color,
      season: item.season,
      style: item.style,
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 1,
      selected: Number(item.confidence) >= 0.65 && !item.usedFallback,
      imageUrl,
      box: item.box || null,
      uncertainFields: Array.isArray(item.uncertainFields) ? item.uncertainFields : []
    };
  }

  function getConfidenceKey(confidence) {
    if (confidence >= 0.78) return 'high';
    if (confidence >= 0.55) return 'medium';
    return 'low';
  }

  function isFieldUncertain(item, fieldName) {
    return item.uncertainFields?.includes(fieldName) || item.confidence < 0.65;
  }

  function fieldClassName(item, fieldName) {
    const baseClass = 'rounded-md border bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
    return isFieldUncertain(item, fieldName)
      ? `${baseClass} border-amber-300 ring-2 ring-amber-100`
      : `${baseClass} border-slate-300`;
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    const itemId = Number(event.target.dataset.itemId);
    setDetectedItems((current) => current.map((item) => (item.id === itemId ? { ...item, [name]: value } : item)));
  }

  function handleSelectedChange(event) {
    const itemId = Number(event.target.dataset.itemId);
    setDetectedItems((current) => current.map((item) => (item.id === itemId ? { ...item, selected: event.target.checked } : item)));
  }

  async function analyzeSelectedImage(imageDataUrl) {
    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;

    if (previewImage.startsWith('blob:')) {
      URL.revokeObjectURL(previewImage);
    }

    setPreviewImage(imageDataUrl);
    setDetectedItems([{ ...initialForm, id: Date.now(), selected: false, imageUrl: '' }]);
    setAnalysisState('analyzing');
    setAnalysisError('');
    setAnalysisMessage('');
    setSubmitError('');

    try {
      try {
        const analysis = await analyzeImage({ mode: 'clothing', imageDataUrl, language });
        if (analysisRequestRef.current !== requestId) return;

        const items = Array.isArray(analysis.items) ? analysis.items : [];
        const itemPreviews = await createItemPreviewImages(imageDataUrl, items.length ? items : [initialForm], { size: 720, quality: 0.72 });
        if (analysisRequestRef.current !== requestId) return;

        setDetectedItems((items.length ? items : [initialForm]).map((item, index) => makeDetectedItem(item, index, itemPreviews[index] || imageDataUrl)));
        setAnalysisMessage(analysis.messageKey ? t(analysis.messageKey) : analysis.message || '');
        setAnalysisState(analysis.usedFallback || analysis.message ? 'review' : 'ready');
      } catch (error) {
        if (analysisRequestRef.current !== requestId) return;

        const itemPreviews = await createItemPreviewImages(imageDataUrl, [initialForm], { size: 720, quality: 0.72 });
        if (analysisRequestRef.current !== requestId) return;

        setDetectedItems([{ ...initialForm, id: Date.now(), imageUrl: itemPreviews[0] || imageDataUrl }]);
        setAnalysisError(error.message?.startsWith('messages.') ? t(error.message) : error.message?.includes('OPENAI_API_KEY') ? t('messages.aiConfigMissing') : t('addClothes.aiAnalysisFailed'));
        setAnalysisState('error');
      }
    } catch {
      if (analysisRequestRef.current !== requestId) return;

      setAnalysisError(t('addClothes.aiAnalysisFailed'));
      setAnalysisState('error');
    }
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageDataUrl = await compressImageFile(file, { maxDimension: 1280, quality: 0.78 });
      await analyzeSelectedImage(imageDataUrl);
    } finally {
      event.target.value = '';
    }
  }

  async function handleNativeImagePick(source, fallbackInputRef) {
    if (!canUseImageUpload || isLoading) return;

    try {
      const imageDataUrl = await pickNativeImageDataUrl({
        source,
        maxDimension: 1280,
        quality: 0.78
      });

      if (imageDataUrl) {
        await analyzeSelectedImage(imageDataUrl);
        return;
      }

      if (isNativeApp()) return;
    } catch (error) {
      if (isNativeImagePickerCancel(error)) return;
      setAnalysisError(t('addClothes.aiAnalysisFailed'));
      setAnalysisState('error');
      if (isNativeApp()) return;
    }

    fallbackInputRef.current?.click();
  }

  function getAnalysisTitle() {
    if (analysisState === 'analyzing') {
      return t('addClothes.analyzing');
    }

    if (analysisState === 'error') {
      return t('addClothes.aiAnalysisFailedTitle');
    }

    if (analysisState === 'review') {
      return t('addClothes.aiAnalysisNeedsReviewTitle');
    }

    return t('addClothes.aiAnalysisReady');
  }

  function getAnalysisDescription() {
    if (analysisState === 'error') {
      return analysisError || t('addClothes.aiAnalysisFailed');
    }

    if (analysisState === 'analyzing') {
      return t('addClothes.aiAnalysisDescription');
    }

    if (analysisState === 'review') {
      return analysisMessage || t('addClothes.aiAnalysisNeedsReview');
    }

    return t('addClothes.aiAnalysisEditable');
  }

  function resetForm() {
    analysisRequestRef.current += 1;
    setDetectedItems([initialForm]);
    setPreviewImage('');
    setAnalysisState('idle');
    setAnalysisError('');
    setAnalysisMessage('');
    setSubmitError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payloads = detectedItems.filter((item) => item.selected).map((item) => ({
      type: normalizeOption('types', item.type, types),
      color: normalizeOption('colors', item.color, colors),
      season: item.season,
      style: item.style,
      imageUrl: item.imageUrl || previewImage,
      sourceBox: item.box || null
    }));

    try {
      setSubmitError('');
      if (import.meta.env.DEV || import.meta.env.VITE_API_DEBUG === 'true') {
        console.info('[add-clothes] submit selected items', {
          count: payloads.length,
          payloads
        });
      }
      await onAdd(payloads);
      resetForm();
    } catch (error) {
      if (import.meta.env.DEV || import.meta.env.VITE_API_DEBUG === 'true') {
        console.error('[add-clothes] submit failed', {
          requestUrl: error.requestUrl,
          status: error.status,
          responseBody: error.payload || error.responseBody,
          message: error.message,
          payloads
        });
      }
      setSubmitError(t('addClothes.addFailedDetailed', {
        status: error.status || '-',
        message: error.message || t('messages.actionFailed')
      }));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid w-full max-w-full min-w-0 gap-4 overflow-hidden rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{t('addClothes.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('addClothes.description')}</p>
      </div>

      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="grid gap-2 text-sm font-medium text-slate-700">
          <p>{t('addClothes.photo')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleNativeImagePick(imageSources.photos, libraryInputRef)}
              disabled={isLoading || !canUseImageUpload}
              className={`rounded-md border px-3 py-2 text-center text-sm font-semibold transition ${canUseImageUpload ? 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700' : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'}`}
            >
              {!canUseImageUpload ? '🔒 ' : ''}{previewImage ? t('buttons.changePhoto') : t('buttons.uploadPhoto')}
            </button>
            <input ref={libraryInputRef} type="file" accept="image/*" className="sr-only" onChange={handleImageChange} disabled={isLoading || !canUseImageUpload} />
            <button
              type="button"
              onClick={() => handleNativeImagePick(imageSources.camera, cameraInputRef)}
              disabled={isLoading || !canUseImageUpload}
              className={`rounded-md border px-3 py-2 text-center text-sm font-semibold transition ${canUseImageUpload ? 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700' : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'}`}
            >
              {!canUseImageUpload ? '🔒 ' : ''}{t('buttons.takePhoto')}
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleImageChange} disabled={isLoading || !canUseImageUpload} />
          </div>
          {!canUseImageUpload ? <p className="mt-2 text-xs font-semibold text-amber-700">🔒 {t('premium.availableInPremium')}</p> : null}
        </div>

        {previewImage ? (
          <div className="mt-4 grid gap-3">
            <img src={previewImage} alt={t('addClothes.previewAlt')} className="h-44 w-full rounded-md object-cover" loading="lazy" decoding="async" />
            <div className={`rounded-md border bg-white p-3 text-sm text-slate-600 ${analysisState === 'error' ? 'border-amber-200' : 'border-teal-100'}`}>
              <p className={`font-semibold ${analysisState === 'error' ? 'text-amber-800' : 'text-teal-800'}`}>
                {getAnalysisTitle()}
              </p>
              <p className="mt-1">{getAnalysisDescription()}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {t('addClothes.detectedCount', { count: detectedItems.length })}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3">
        <p className="text-sm font-semibold text-slate-800">{t('addClothes.suggestionsTitle')}</p>
        {detectedItems.map((item, index) => (
          <div key={item.id} className="grid w-full max-w-full min-w-0 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {item.imageUrl || previewImage ? <img src={item.imageUrl || previewImage} alt={t('addClothes.previewAlt')} className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 object-cover" loading="lazy" decoding="async" /> : null}
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('addClothes.detectedItemTitle', { number: index + 1 })}
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${item.confidence < 0.55 ? 'text-amber-700' : item.confidence < 0.78 ? 'text-slate-500' : 'text-teal-700'}`}>
                    {t(`addClothes.confidence.${getConfidenceKey(item.confidence)}`)}
                  </p>
                </div>
              </div>
              <label className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  data-item-id={item.id}
                  checked={item.selected}
                  onChange={handleSelectedChange}
                  className="h-4 w-4 rounded border-slate-300 accent-teal-700"
                />
                {t('addClothes.selectItem')}
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              {t('addClothes.type')}
              <input
                name="type"
                data-item-id={item.id}
                list="type-suggestions"
                value={item.type}
                onChange={handleFieldChange}
                placeholder={t('addClothes.typePlaceholder')}
                className={fieldClassName(item, 'type')}
                disabled={isLoading}
                required
              />
              {isFieldUncertain(item, 'type') ? <span className="text-xs font-semibold text-amber-700">{t('addClothes.reviewField')}</span> : null}
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              {t('addClothes.color')}
              <input
                name="color"
                data-item-id={item.id}
                list="color-suggestions"
                value={item.color}
                onChange={handleFieldChange}
                placeholder={t('addClothes.colorPlaceholder')}
                className={fieldClassName(item, 'color')}
                disabled={isLoading}
                required
              />
              {isFieldUncertain(item, 'color') ? <span className="text-xs font-semibold text-amber-700">{t('addClothes.reviewField')}</span> : null}
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              {t('addClothes.season')}
              <select
                name="season"
                data-item-id={item.id}
                value={item.season}
                onChange={handleFieldChange}
                className={fieldClassName(item, 'season')}
                disabled={isLoading}
              >
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    {optionLabel('seasons', season)}
                  </option>
                ))}
              </select>
              {isFieldUncertain(item, 'season') ? <span className="text-xs font-semibold text-amber-700">{t('addClothes.reviewField')}</span> : null}
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              {t('addClothes.style')}
              <select
                name="style"
                data-item-id={item.id}
                value={item.style}
                onChange={handleFieldChange}
                className={fieldClassName(item, 'style')}
                disabled={isLoading}
              >
                {styles.map((style) => (
                  <option key={style} value={style}>
                    {optionLabel('styles', style)}
                  </option>
                ))}
              </select>
              {isFieldUncertain(item, 'style') ? <span className="text-xs font-semibold text-amber-700">{t('addClothes.reviewField')}</span> : null}
            </label>

            {item.confidence < 1 ? (
              <p className="text-xs font-semibold text-slate-500">
                {t('addClothes.confidenceLabel', { confidence: Math.round(item.confidence * 100) })}
              </p>
            ) : null}
          </div>
        ))}
        {!detectedItems.some((item) => item.selected) ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {t('addClothes.noSelectedItems')}
          </p>
        ) : null}
        {submitError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
            {submitError}
          </p>
        ) : null}
      </div>

      <datalist id="type-suggestions">
        {types.map((type) => (
          <option key={type} value={optionLabel('types', type)} />
        ))}
      </datalist>
      <datalist id="color-suggestions">
        {colors.map((color) => (
          <option key={color} value={optionLabel('colors', color)} />
        ))}
      </datalist>

      <button
        disabled={isLoading || analysisState === 'analyzing' || !detectedItems.some((item) => item.selected)}
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isLoading ? t('buttons.adding') : t('addClothes.addSelected')}
      </button>
      <button type="button" onClick={resetForm} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
        {t('buttons.cancel')}
      </button>
    </form>
  );
}
