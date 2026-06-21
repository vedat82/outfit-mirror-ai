import { getAccessStatus, getLocalUserId } from './userIdentity.js';
import { addMonitoringBreadcrumb, captureAppError } from '../monitoring/sentry.js';
import { detectPaymentPlatform } from '../utils/platform.js';
import { fetchJson } from './http.js';

export async function analyzeImage({ mode, imageDataUrl, language, appearanceProfile, preferences }) {
  const accessStatus = getAccessStatus();
  addMonitoringBreadcrumb('ai', 'analyze-image:start', {
    mode,
    accessTier: accessStatus.tier,
    imageBytes: imageDataUrl.length
  });
  const { response, data, url, responseText } = await fetchJson('/ai/analyze-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getLocalUserId(),
      'X-Platform': detectPaymentPlatform()
    },
    body: JSON.stringify({ mode, imageDataUrl, language, appearanceProfile, preferences })
  }, `ai:analyze:${mode}`);

  if (!response.ok) {
    const error = new Error(data.messageKey || data.message || 'Image analysis failed.');
    error.status = response.status;
    error.payload = data;
    error.requestUrl = url;
    error.responseBody = responseText;
    captureAppError(error, {
      area: 'ai-upload',
      mode,
      status: response.status,
      requestUrl: url,
      accessTier: accessStatus.tier
    });
    throw error;
  }

  addMonitoringBreadcrumb('ai', 'analyze-image:success', {
    mode,
    usedFallback: Boolean(data.usedFallback)
  });
  return data;
}
