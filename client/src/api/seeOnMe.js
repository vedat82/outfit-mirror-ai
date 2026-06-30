import { getAccessStatus, getLocalUserId } from './userIdentity.js';
import { addMonitoringBreadcrumb, captureAppError } from '../monitoring/sentry.js';
import { detectPaymentPlatform } from '../utils/platform.js';
import { sanitizeAppearanceProfileForSeeOnMe } from '../utils/seeOnMePayload.js';
import { fetchJson } from './http.js';
import { compressImageDataUrlToBudget } from '../utils/imageCompression.js';

const seeOnMeDebugStorageKey = 'outfitMirrorSeeOnMeDebug';

function saveSeeOnMeDebug(event) {
  try {
    window.localStorage.setItem(seeOnMeDebugStorageKey, JSON.stringify({
      ...event,
      createdAt: new Date().toISOString()
    }));
  } catch {
    // Diagnostics should never block generation.
  }
}

export function getSeeOnMeDebug() {
  try {
    return JSON.parse(window.localStorage.getItem(seeOnMeDebugStorageKey) || 'null');
  } catch {
    return null;
  }
}

function seeOnMeHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': getLocalUserId(),
    'X-Platform': detectPaymentPlatform()
  };
}

function handleResponse(response, data, area, details = {}) {
  if (!response.ok) {
    const error = new Error(data.messageKey || data.message || 'messages.actionFailed');
    error.status = response.status;
    error.payload = data;
    error.requestUrl = details.url;
    error.responseBody = details.responseText;
    captureAppError(error, { area, status: response.status, requestUrl: details.url });
    throw error;
  }

  return data;
}

function getFriendlyError(error, fallbackKey) {
  if (error.name === 'AbortError') {
    return new Error('seeOnMe.timeout');
  }

  return new Error(fallbackKey);
}

async function compressOptionalImageUrl(imageUrl, options) {
  if (!String(imageUrl || '').startsWith('data:image/')) {
    return imageUrl || '';
  }

  try {
    return await compressImageDataUrlToBudget(imageUrl, options);
  } catch {
    return '';
  }
}

async function prepareOutfitForSeeOnMe(outfit = {}) {
  const nextOutfit = { ...outfit };
  const referenceOptions = {
    maxBytes: 115000,
    maxDimension: 420,
    minDimension: 260,
    quality: 0.52,
    minQuality: 0.34
  };

  for (const key of ['top', 'bottom', 'shoes', 'jacket']) {
    if (!nextOutfit[key]) continue;

    const nextItem = { ...nextOutfit[key] };
    if (nextItem.imageUrl) {
      const compressedImageUrl = await compressOptionalImageUrl(nextItem.imageUrl, referenceOptions);
      if (compressedImageUrl) {
        nextItem.imageUrl = compressedImageUrl;
      } else {
        delete nextItem.imageUrl;
      }
    }
    nextOutfit[key] = nextItem;
  }

  return nextOutfit;
}

function getPayloadBytes(payload) {
  try {
    return JSON.stringify(payload).length;
  } catch {
    return 0;
  }
}

export async function generateSeeOnMePreview({ imageDataUrl, outfit, appearanceProfile, preferences, language, continueAnyway = false }) {
  const accessStatus = getAccessStatus();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90000);
  const requestImageDataUrl = await compressImageDataUrlToBudget(imageDataUrl, {
    maxBytes: 520000,
    maxDimension: 720,
    minDimension: 360,
    quality: 0.58,
    minQuality: 0.36
  });
  const requestOutfit = await prepareOutfitForSeeOnMe(outfit);
  const requestBody = {
    imageDataUrl: requestImageDataUrl,
    outfit: requestOutfit,
    appearanceProfile: sanitizeAppearanceProfileForSeeOnMe(appearanceProfile),
    preferences,
    language,
    continueAnyway
  };
  const requestBodyBytes = getPayloadBytes(requestBody);
  addMonitoringBreadcrumb('ai', 'see-on-me:start', {
    accessTier: accessStatus.tier,
    imageBytes: requestImageDataUrl.length,
    originalImageBytes: imageDataUrl.length,
    requestBodyBytes
  });
  saveSeeOnMeDebug({
    status: 'started',
    imageBytes: requestImageDataUrl.length,
    originalImageBytes: imageDataUrl.length,
    requestBodyBytes
  });

  try {
    const { response, data, url, responseText } = await fetchJson('/ai/see-on-me', {
      method: 'POST',
      headers: seeOnMeHeaders(),
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    }, 'see-on-me:generate');

    handleResponse(response, data, 'see-on-me-generate', { url, responseText });
    saveSeeOnMeDebug({ status: 'success', requestUrl: url, usedFallback: Boolean(data.usedFallback) });
    addMonitoringBreadcrumb('ai', 'see-on-me:success', {
      usedFallback: Boolean(data.usedFallback)
    });
    return data;
  } catch (error) {
    saveSeeOnMeDebug({
      status: 'failed',
      requestUrl: error.requestUrl,
      httpStatus: error.status,
      message: error.message,
      messageKey: error.payload?.messageKey,
      safeCode: error.payload?.safeCode,
      category: error.payload?.category,
      imageBytes: requestImageDataUrl.length,
      originalImageBytes: imageDataUrl.length,
      requestBodyBytes
    });
    if (error.payload || error.status) throw error;
    throw getFriendlyError(error, 'seeOnMe.generationFailed');
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function saveSeeOnMeLook({ previewImageUrl, userPhotoImageUrl, outfit, metadata }) {
  const { response, data, url, responseText } = await fetchJson('/ai/see-on-me/save', {
    method: 'POST',
    headers: seeOnMeHeaders(),
    body: JSON.stringify({ previewImageUrl, userPhotoImageUrl, outfit, metadata })
  }, 'see-on-me:save');

  return handleResponse(response, data, 'see-on-me-save', { url, responseText });
}

export async function getSavedSeeOnMeLooks() {
  const { response, data, url, responseText } = await fetchJson('/ai/see-on-me/saved', {
    headers: seeOnMeHeaders()
  }, 'see-on-me:saved');

  return handleResponse(response, data, 'see-on-me-saved', { url, responseText });
}
