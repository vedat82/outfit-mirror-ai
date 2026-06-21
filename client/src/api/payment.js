import { getLocalUserId } from './userIdentity.js';
import { addMonitoringBreadcrumb, captureAppError } from '../monitoring/sentry.js';
import { detectPaymentPlatform } from '../utils/platform.js';
import { defaultPremiumPlanId } from '../config/pricing.js';
import { fetchJson } from './http.js';

function userHeaders(extraHeaders = {}) {
  return {
    ...extraHeaders,
    'X-User-Id': getLocalUserId(),
    'X-Platform': detectPaymentPlatform()
  };
}

function handleResponse(response, data, details = {}) {
  if (!response.ok) {
    const error = new Error(data.message || 'messages.paymentFailed');
    error.status = response.status;
    error.payload = data;
    error.requestUrl = details.url;
    error.responseBody = details.responseText;
    captureAppError(error, {
      area: 'payment-api',
      status: response.status,
      requestUrl: details.url
    });
    throw error;
  }

  return data;
}

export async function initiatePremiumPayment(language, platform = 'web', planId = defaultPremiumPlanId) {
  addMonitoringBreadcrumb('payment', 'premium:start', { platform, planId });
  const { response, data, url, responseText } = await fetchJson('/payment/initiate', {
    method: 'POST',
    headers: userHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ locale: language === 'en' ? 'en' : 'tr', platform, planId })
  }, 'payment:initiate');

  return handleResponse(response, data, { url, responseText });
}

export async function verifyApplePurchase({ receipt, jwsRepresentation, transactionId, productIdentifier, environment, planId = defaultPremiumPlanId }) {
  addMonitoringBreadcrumb('payment', 'apple-verify:start', {
    hasReceipt: Boolean(receipt),
    hasJwsRepresentation: Boolean(jwsRepresentation),
    hasTransactionId: Boolean(transactionId),
    productIdentifier,
    planId
  });
  console.info('[apple-iap] backend verify started', {
    transactionId,
    productIdentifier,
    environment,
    planId,
    hasJwsRepresentation: Boolean(jwsRepresentation)
  });
  const { response, data, url, responseText } = await fetchJson('/payment/apple/verify', {
    method: 'POST',
    headers: userHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ receipt, jwsRepresentation, transactionId, productIdentifier, environment, planId })
  }, 'payment:apple-verify');

  try {
    const result = handleResponse(response, data, { url, responseText });
    console.info('[apple-iap] backend verify success', {
      environment: result.verification?.environment || environment,
      productId: result.verification?.productId || productIdentifier,
      transactionId: result.verification?.transactionId || transactionId,
      originalTransactionId: result.verification?.originalTransactionId || null,
      expiresDate: result.verification?.expiresDate || null,
      verificationMode: result.verification?.verificationMode || result.verifiedBy,
      isPremiumActive: Boolean(result.isPremiumActive || result.isPremium)
    });
    return result;
  } catch (error) {
    console.info('[apple-iap] backend verify failed', {
      transactionId,
      productIdentifier,
      environment,
      status: error.status,
      code: error.payload?.code,
      message: error.message
    });
    throw error;
  }
}

export async function getPaymentStatus() {
  const { response, data, url, responseText } = await fetchJson('/payment/status', {
    headers: userHeaders()
  }, 'payment:status');

  return handleResponse(response, data, { url, responseText });
}

export async function resetPaymentStatus() {
  const { response, data, url, responseText } = await fetchJson('/payment/reset', {
    method: 'POST',
    headers: userHeaders()
  }, 'payment:reset');

  return handleResponse(response, data, { url, responseText });
}
