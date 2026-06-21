import * as Sentry from '@sentry/node';
import crypto from 'node:crypto';

const sensitiveKeys = new Set([
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'cardnumber',
  'card_number',
  'cvc',
  'cvv',
  'image',
  'imagedataurl',
  'openai_api_key',
  'password',
  'rawresult',
  'receipt',
  'secret',
  'secretkey',
  'token'
]);

function getMonitoringConfig() {
  const environment = process.env.APP_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const dsn = process.env.SENTRY_DSN_BACKEND || '';
  const enableLocal = String(process.env.SENTRY_ENABLE_LOCAL || '').toLowerCase() === 'true';
  const isEnabled = Boolean(dsn) && (environment === 'production' || enableLocal);

  return {
    dsn,
    environment,
    isEnabled,
    projectId: getProjectIdFromDsn(dsn)
  };
}

function getProjectIdFromDsn(value) {
  if (!value) return '';

  try {
    return new URL(value).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return '';
  }
}

function scrubObject(value) {
  if (Array.isArray(value)) {
    return value.map(scrubObject);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((safeValue, [key, itemValue]) => {
    const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();

    if (sensitiveKeys.has(normalizedKey)) {
      safeValue[key] = '[Filtered]';
      return safeValue;
    }

    safeValue[key] = scrubObject(itemValue);
    return safeValue;
  }, {});
}

function scrubEvent(event) {
  if (event.request?.headers) {
    delete event.request.headers.authorization;
    delete event.request.headers.Authorization;
    delete event.request.headers.cookie;
    delete event.request.headers.Cookie;
    delete event.request.headers['x-api-key'];
  }

  if (event.request?.data && typeof event.request.data === 'object') {
    event.request.data = scrubObject(event.request.data);
  }

  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }

  return event;
}

export function initBackendMonitoring() {
  const { dsn, environment, isEnabled } = getMonitoringConfig();

  if (!isEnabled) {
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: `daily-outfit-planner-server@${process.env.npm_package_version || '0.1.0'}`,
    integrations: [
      Sentry.expressIntegration(),
      Sentry.requestDataIntegration({
        include: {
          cookies: false,
          data: true,
          headers: true,
          ip: false,
          query_string: true,
          user: false
        }
      })
    ],
    tracesSampleRate: environment === 'production' ? 0.1 : 1,
    beforeSend: scrubEvent
  });
}

export function setupBackendErrorHandler(app) {
  const { isEnabled } = getMonitoringConfig();

  if (isEnabled) {
    Sentry.setupExpressErrorHandler(app);
  }
}

export function monitoringContextMiddleware(req, _res, next) {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  const { isEnabled } = getMonitoringConfig();

  if (isEnabled) {
    Sentry.setUser({ id: req.get('x-user-id') || undefined });
    Sentry.setTags({
      requestId,
      platform: req.get('x-platform') || req.body?.platform || req.query?.platform || 'unknown'
    });
    Sentry.setContext('request', {
      endpoint: req.originalUrl,
      method: req.method,
      requestId
    });
  }

  next();
}

export function captureBackendError(error, req, context = {}) {
  const { isEnabled } = getMonitoringConfig();
  if (!isEnabled) return;

  Sentry.withScope((scope) => {
    scope.setUser({ id: req?.get?.('x-user-id') || undefined });
    scope.setTags({
      endpoint: req?.originalUrl || 'unknown',
      method: req?.method || 'unknown',
      requestId: req?.requestId || 'unknown',
      platform: req?.get?.('x-platform') || req?.body?.platform || req?.query?.platform || 'unknown'
    });
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, scrubObject(value));
    });
    Sentry.captureException(error);
  });
}

export function addBackendBreadcrumb(req, category, message, data = {}) {
  const { isEnabled } = getMonitoringConfig();
  if (!isEnabled) return;

  Sentry.addBreadcrumb({
    category,
    message,
    level: 'info',
    data: {
      requestId: req?.requestId,
      ...data
    }
  });
}
