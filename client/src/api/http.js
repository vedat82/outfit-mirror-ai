function isNativeWebView() {
  return window.Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:';
}

export function getApiBaseUrl() {
  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (isNativeWebView() && import.meta.env.DEV) {
    return 'http://localhost:4000';
  }

  return '';
}

export function apiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${cleanPath}`;
}

function shouldLogApiDebug() {
  return import.meta.env.DEV || import.meta.env.VITE_API_DEBUG === 'true';
}

function parseRequestBody(body) {
  if (!body || typeof body !== 'string') {
    return body || null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body.length > 600 ? `${body.slice(0, 600)}...` : body;
  }
}

export async function fetchJson(path, options = {}, debugArea = 'api') {
  const url = apiUrl(path);
  const method = options.method || 'GET';
  const requestBody = parseRequestBody(options.body);

  if (isNativeWebView() && !getApiBaseUrl()) {
    const error = new Error('messages.apiBaseUrlMissing');
    error.requestUrl = path;
    if (shouldLogApiDebug()) {
      console.error('[api] missing native API base URL', {
        area: debugArea,
        path,
        method
      });
    }
    throw error;
  }

  if (shouldLogApiDebug()) {
    console.info('[api] request', {
      area: debugArea,
      url,
      method,
      platform: isNativeWebView() ? 'capacitor' : 'web',
      payload: requestBody
    });
  }

  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    if (shouldLogApiDebug()) {
      console.error('[api] exception', {
        area: debugArea,
        url,
        method,
        payload: requestBody,
        message: error.message
      });
    }
    error.requestUrl = url;
    throw error;
  }

  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }
  }

  if (!response.ok) {
    if (shouldLogApiDebug()) {
      console.error('[api] error response', {
        area: debugArea,
        url,
        method,
        payload: requestBody,
        status: response.status,
        body: data
      });
    }
  }

  return {
    response,
    data,
    url,
    status: response.status,
    responseText
  };
}
