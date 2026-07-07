const removeBgEndpoint = 'https://api.remove.bg/v1.0/removebg';

function isEnabled() {
  return String(process.env.BACKGROUND_REMOVAL_ENABLED || '').trim().toLowerCase() === 'true';
}

function getProvider() {
  const provider = String(process.env.BACKGROUND_REMOVAL_PROVIDER || 'none').trim().toLowerCase();
  return provider === 'removebg' || provider === 'remove.bg' ? 'removebg' : 'none';
}

function getTimeoutMs() {
  const timeoutMs = Number(process.env.BACKGROUND_REMOVAL_TIMEOUT_MS || 12000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000;
}

function getMaxInputBytes() {
  const maxBytes = Number(process.env.BACKGROUND_REMOVAL_MAX_INPUT_BYTES || 2_000_000);
  return Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 2_000_000;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error('Background removal timed out.');
      error.name = 'AbortError';
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}

async function removeWithRemoveBg(imageUrl, { fetchImpl = fetch } = {}) {
  const apiKey = String(process.env.REMOVEBG_API_KEY || '').trim();
  if (!apiKey) {
    return {
      imageUrl,
      changed: false,
      provider: 'removebg',
      reason: 'missing-key',
      durationMs: 0
    };
  }

  const parsedImage = parseDataUrl(imageUrl);
  if (!parsedImage) {
    return {
      imageUrl,
      changed: false,
      provider: 'removebg',
      reason: 'unsupported-image',
      durationMs: 0
    };
  }

  const maxInputBytes = getMaxInputBytes();
  if (parsedImage.buffer.length > maxInputBytes) {
    return {
      imageUrl,
      changed: false,
      provider: 'removebg',
      reason: 'image-too-large',
      inputBytes: parsedImage.buffer.length,
      maxInputBytes,
      durationMs: 0
    };
  }

  const startedAt = Date.now();
  const formData = new FormData();
  formData.append('image_file', new Blob([parsedImage.buffer], { type: parsedImage.mimeType }), 'wardrobe-item.png');
  formData.append('size', process.env.BACKGROUND_REMOVAL_SIZE || 'preview');
  formData.append('format', 'png');

  const response = await withTimeout(fetchImpl(removeBgEndpoint, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey
    },
    body: formData
  }), getTimeoutMs());
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const error = new Error(`remove.bg failed with HTTP ${response.status}`);
    error.statusCode = response.status;
    error.responseText = responseText.slice(0, 500);
    throw error;
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    imageUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
    changed: true,
    provider: 'removebg',
    inputBytes: parsedImage.buffer.length,
    outputBytes: buffer.length,
    durationMs
  };
}

export async function removeBackgroundFromImage(imageUrl, options = {}) {
  const provider = getProvider();
  if (!isEnabled() || provider === 'none') {
    return {
      imageUrl,
      changed: false,
      provider,
      reason: 'disabled',
      durationMs: 0
    };
  }

  try {
    if (provider === 'removebg') {
      return await removeWithRemoveBg(imageUrl, options);
    }

    return {
      imageUrl,
      changed: false,
      provider,
      reason: 'unsupported-provider',
      durationMs: 0
    };
  } catch (error) {
    if (!options.silent) {
      console.warn('[background-removal] provider failed', {
        provider,
        statusCode: error.statusCode,
        code: error.code,
        name: error.name,
        message: error.message
      });
    }

    return {
      imageUrl,
      changed: false,
      provider,
      reason: error.name === 'AbortError' ? 'timeout' : 'provider-failed',
      statusCode: error.statusCode,
      durationMs: 0
    };
  }
}

export function getBackgroundRemovalConfig() {
  return {
    enabled: isEnabled(),
    provider: getProvider(),
    timeoutMs: getTimeoutMs(),
    maxInputBytes: getMaxInputBytes()
  };
}
