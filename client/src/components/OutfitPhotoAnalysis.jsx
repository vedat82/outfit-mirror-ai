import { useRef, useState } from 'react';
import { analyzeImage } from '../api/ai.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { optimizeAiImageFile } from '../utils/imageCompression.js';
import { imageSources, isNativeImagePickerCancel, pickNativeImageDataUrl } from '../utils/nativeImagePicker.js';
import { isNativeApp } from '../utils/platform.js';

export default function OutfitPhotoAnalysis({ clothes, accessStatus, appearanceProfile, preferences, onAnalysisComplete }) {
  const { t, language } = useI18n();
  const [previewImage, setPreviewImage] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analysisState, setAnalysisState] = useState('idle');
  const [analysisError, setAnalysisError] = useState('');
  const libraryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canUseOutfitPhotoAnalysis = accessStatus.canUseOutfitPhotoAnalysis;

  function isUncertain(fieldName) {
    return analysis?.uncertainFields?.includes(fieldName) || analysis?.confidence < 0.65;
  }

  async function analyzeSelectedPhoto(imageDataUrl) {
    setAnalysis(null);
    setAnalysisError('');
    setAnalysisState('analyzing');
    setPreviewImage(imageDataUrl);

    try {
      const result = await analyzeImage({ mode: 'outfit', imageDataUrl, language, appearanceProfile, preferences });
      const translatedMessage = result.messageKey ? t(result.messageKey) : result.message || '';
      const resultSuggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
      const nextAnalysis = {
        score: Math.max(1, Math.min(10, Math.round(Number(result.rating) || 7))),
        feedback: result.usedFallback && translatedMessage ? translatedMessage : result.feedback,
        suggestions: result.usedFallback && translatedMessage ? [translatedMessage] : resultSuggestions,
        confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 1,
        uncertainFields: Array.isArray(result.uncertainFields) ? result.uncertainFields : [],
        message: translatedMessage,
        usedFallback: Boolean(result.usedFallback)
      };
      setAnalysis(nextAnalysis);
      onAnalysisComplete?.({
        type: 'review',
        imageUrl: imageDataUrl,
        score: nextAnalysis.score,
        feedback: nextAnalysis.feedback,
        suggestions: nextAnalysis.suggestions,
        confidence: nextAnalysis.confidence,
        createdAt: Date.now()
      });
      setAnalysisState(result.usedFallback || result.message ? 'review' : 'ready');
    } catch (error) {
      setAnalysisError(error.message?.startsWith('messages.') ? t(error.message) : error.message?.includes('OPENAI_API_KEY') ? t('messages.aiConfigMissing') : t('outfitAnalysis.aiAnalysisFailed'));
      setAnalysisState('error');
    }
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalysis(null);
    setAnalysisError('');
    setAnalysisState('analyzing');

    optimizeAiImageFile(file).then(analyzeSelectedPhoto).catch(() => {
      setAnalysisError(t('outfitAnalysis.aiAnalysisFailed'));
      setAnalysisState('error');
    }).finally(() => {
      event.target.value = '';
    });
  }

  async function handleNativePhotoPick(source, fallbackInputRef) {
    if (!canUseOutfitPhotoAnalysis) return;

    try {
      setAnalysis(null);
      setAnalysisError('');
      setAnalysisState('analyzing');

      const imageDataUrl = await pickNativeImageDataUrl({
        source,
        maxDimension: 1024,
        quality: 0.8
      });

      if (imageDataUrl) {
        await analyzeSelectedPhoto(imageDataUrl);
        return;
      }
    } catch (error) {
      if (isNativeImagePickerCancel(error)) {
        setAnalysisState(analysis ? 'ready' : 'idle');
        return;
      }
      setAnalysisError(t('outfitAnalysis.aiAnalysisFailed'));
      setAnalysisState('error');
      if (isNativeApp()) return;
    }

    fallbackInputRef.current?.click();
  }

  return (
    <section className="grid w-full max-w-full min-w-0 gap-5 overflow-hidden rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{t('outfitAnalysis.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('outfitAnalysis.description')}</p>
      </div>

      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="grid gap-2 text-sm font-medium text-slate-700">
          {t('outfitAnalysis.photo')}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => handleNativePhotoPick(imageSources.photos, libraryInputRef)} disabled={!canUseOutfitPhotoAnalysis} className={`rounded-md border px-3 py-2 text-center text-sm font-semibold transition ${canUseOutfitPhotoAnalysis ? 'border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
              {!canUseOutfitPhotoAnalysis ? '🔒 ' : ''}{previewImage ? t('buttons.changePhoto') : t('buttons.uploadOutfitPhoto')}
            </button>
            <button type="button" onClick={() => handleNativePhotoPick(imageSources.camera, cameraInputRef)} disabled={!canUseOutfitPhotoAnalysis} className={`rounded-md border px-3 py-2 text-center text-sm font-semibold transition ${canUseOutfitPhotoAnalysis ? 'border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
              {!canUseOutfitPhotoAnalysis ? '🔒 ' : ''}{t('buttons.takePhoto')}
            </button>
          </div>
          <input ref={libraryInputRef} type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} disabled={!canUseOutfitPhotoAnalysis} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhotoChange} disabled={!canUseOutfitPhotoAnalysis} />
        </div>
        {!canUseOutfitPhotoAnalysis ? <p className="mt-2 text-xs font-semibold text-amber-700">🔒 {t('premium.availableInPremium')}</p> : null}

        {previewImage ? (
          <div className="mt-4 grid gap-3">
            <img src={previewImage} alt={t('outfitAnalysis.previewAlt')} className="h-64 w-full rounded-md object-cover" loading="lazy" decoding="async" />
            {analysisState === 'analyzing' ? (
              <div className="rounded-md border border-teal-100 bg-white p-3 text-sm font-semibold text-teal-800">
                {t('outfitAnalysis.analyzing')}
              </div>
            ) : null}
            {analysisState === 'error' ? (
              <div className="rounded-md border border-amber-200 bg-white p-3 text-sm font-semibold text-amber-800">
                {analysisError || t('outfitAnalysis.aiAnalysisFailed')}
              </div>
            ) : null}
          </div>
        ) : analysisState === 'analyzing' ? (
          <div className="mt-4 rounded-md border border-teal-100 bg-white p-4 text-sm font-semibold text-teal-800">
            {t('outfitAnalysis.analyzing')}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">{t('outfitAnalysis.emptyTitle')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('outfitAnalysis.emptyDescription')}</p>
          </div>
        )}
      </div>

      {analysis ? (
        <div className="grid gap-4">
          {analysis.message ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              {analysis.message}
            </div>
          ) : null}

          <div className={`rounded-md border p-4 ${isUncertain('rating') ? 'border-amber-200 bg-amber-50' : 'border-teal-100 bg-teal-50'}`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">{t('outfitAnalysis.scoreLabel')}</p>
            <p className="mt-1 text-4xl font-bold text-teal-950">{t('outfitAnalysis.scoreValue', { score: analysis.score })}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {t('outfitAnalysis.confidenceLabel', { confidence: Math.round(analysis.confidence * 100) })}
            </p>
            {isUncertain('rating') ? <p className="mt-1 text-xs font-semibold text-amber-700">{t('outfitAnalysis.reviewResult')}</p> : null}
          </div>

          <div className={`rounded-md border p-4 ${isUncertain('feedback') ? 'border-amber-200' : 'border-slate-200'}`}>
            <h3 className="text-sm font-semibold text-slate-950">{t('outfitAnalysis.feedbackTitle')}</h3>
            <ul className="mt-3 grid gap-2 text-sm text-slate-600">
              <li className="rounded-md bg-slate-50 px-3 py-2">{analysis.feedback}</li>
            </ul>
            {isUncertain('feedback') ? <p className="mt-2 text-xs font-semibold text-amber-700">{t('outfitAnalysis.reviewResult')}</p> : null}
          </div>

          <div className={`rounded-md border p-4 ${isUncertain('suggestions') ? 'border-amber-200' : 'border-slate-200'}`}>
            <h3 className="text-sm font-semibold text-slate-950">{t('outfitAnalysis.suggestionsTitle')}</h3>
            <ul className="mt-3 grid gap-2 text-sm text-slate-600">
              {(analysis.suggestions.length ? analysis.suggestions : [t('outfitAnalysis.noSuggestions')]).map((suggestion) => (
                <li key={suggestion} className="rounded-md bg-slate-50 px-3 py-2">
                  {suggestion}
                </li>
              ))}
            </ul>
            {isUncertain('suggestions') ? <p className="mt-2 text-xs font-semibold text-amber-700">{t('outfitAnalysis.reviewResult')}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
