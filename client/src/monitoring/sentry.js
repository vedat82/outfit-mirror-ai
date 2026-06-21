import * as Sentry from '@sentry/react';
import { getLocalUserId } from '../api/userIdentity.js';
import { detectPaymentPlatform } from '../utils/platform.js';

const environment = import.meta.env.VITE_APP_ENVIRONMENT || import.meta.env.MODE || 'development';
const dsn = import.meta.env.VITE_SENTRY_DSN_FRONTEND || '';
const enableLocal = String(import.meta.env.VITE_SENTRY_ENABLE_LOCAL || '').toLowerCase() === 'true';
const shouldEnableSentry = Boolean(dsn) && (environment === 'production' || enableLocal);
const debugSentry = String(import.meta.env.VITE_SENTRY_DEBUG || '').toLowerCase() === 'true';

function logSentryDebug(message, data = {}) {
  if (!debugSentry) return;

  console.info(`[sentry] ${message}`, {
    ...data,
    dsnExists: Boolean(dsn),
    shouldEnableSentry,
    environment
  });
}

function getEnvelopeEndpoint() {
  if (!dsn) return '';

  try {
    const parsedDsn = new URL(dsn);
    const projectId = parsedDsn.pathname.split('/').filter(Boolean).pop();
    return `${parsedDsn.protocol}//${parsedDsn.host}/api/${projectId}/envelope/`;
  } catch {
    return '';
  }
}

function scrubEvent(event) {
  if (event.request?.headers) {
    delete event.request.headers.authorization;
    delete event.request.headers.Authorization;
    delete event.request.headers['x-api-key'];
  }

  if (event.extra) {
    delete event.extra.imageDataUrl;
    delete event.extra.receipt;
    delete event.extra.apiKey;
  }

  return event;
}

export function initFrontendMonitoring() {
  logSentryDebug('init check');

  if (!shouldEnableSentry) {
    logSentryDebug('frontend disabled', {
      dsnExists: Boolean(dsn),
      shouldEnableSentry,
      environment
    });
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: `daily-outfit-planner-client@${__APP_VERSION__}`,
    debug: debugSentry,
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.browserApiErrorsIntegration()
    ],
    tracesSampleRate: environment === 'production' ? 0.1 : 1,
    beforeSend: scrubEvent,
    ignoreErrors: [
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      'NetworkError when attempting to fetch resource'
    ]
  });

  Sentry.setUser({ id: getLocalUserId() });
  Sentry.setContext('app', {
    version: __APP_VERSION__,
    platform: detectPaymentPlatform()
  });
  logSentryDebug('frontend initialized', {
    dsnExists: Boolean(dsn),
    shouldEnableSentry,
    environment,
    envelopeEndpoint: getEnvelopeEndpoint(),
    hasClient: Boolean(Sentry.getClient?.())
  });
}

export function addMonitoringBreadcrumb(category, message, data = {}) {
  if (!shouldEnableSentry) return;

  Sentry.addBreadcrumb({
    category,
    message,
    level: 'info',
    data
  });
}

export function captureAppError(error, context = {}) {
  if (!shouldEnableSentry) return;

  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      if (key !== 'imageDataUrl' && key !== 'receipt' && key !== 'apiKey') {
        scope.setExtra(key, value);
      }
    });
    Sentry.captureException(error);
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
