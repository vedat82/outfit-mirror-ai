import crypto from 'node:crypto';
import { fal } from '@fal-ai/client';
import { db } from '../db.js';

const removeBgEndpoint = 'https://api.remove.bg/v1.0/removebg';

const getCachedRemoval = db.prepare(`
  SELECT provider, output_image_url as outputImageUrl, input_bytes as inputBytes, output_bytes as outputBytes, created_at as createdAt
  FROM background_removal_cache
  WHERE user_id = ? AND image_hash = ?
`);

const countSuccessfulRemovals = db.prepare(`
  SELECT COUNT(*) as count
  FROM background_removal_cache
  WHERE user_id = ?
`);

const insertCachedRemoval = db.prepare(`
  INSERT OR IGNORE INTO background_removal_cache (user_id, image_hash, provider, output_image_url, input_bytes, output_bytes)
  VALUES (@userId, @imageHash, @provider, @outputImageUrl, @inputBytes, @outputBytes)
`);

function isEnabled() {
  return String(process.env.BACKGROUND_REMOVAL_ENABLED || '').trim().toLowerCase() === 'true';
}

function getProvider() {
  const provider = String(process.env.BACKGROUND_REMOVAL_PROVIDER || 'none').trim().toLowerCase();
  if (provider === 'removebg' || provider === 'remove.bg') return 'removebg';
  if (provider === 'fal_bria' || provider === 'fal-bria' || provider === 'bria') return 'fal_bria';
  return 'none';
}

function getTimeoutMs() {
  const timeoutMs = Number(process.env.BACKGROUND_REMOVAL_TIMEOUT_MS || 12000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000;
}

function getMaxInputBytes() {
  const maxBytes = Number(process.env.BACKGROUND_REMOVAL_MAX_INPUT_BYTES || 2_000_000);
  return Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 2_000_000;
}

function getUserLimit() {
  const limit = Number(process.env.BACKGROUND_REMOVAL_USER_LIMIT || 50);
  return Number.isFinite(limit) && limit >= 0 ? limit : 50;
}

function getEstimatedCostUsd() {
  const cost = Number(process.env.BACKGROUND_REMOVAL_ESTIMATED_COST_USD || 0.018);
  return Number.isFinite(cost) && cost >= 0 ? cost : 0.018;
}

function getFalKey() {
  return String(process.env.FAL_KEY || process.env.FAL_API_KEY || '').trim();
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function hashImage(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
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

async function imageUrlToDataUrl(imageUrl, { fetchImpl = fetch, timeoutMs = getTimeoutMs() } = {}) {
  if (String(imageUrl || '').startsWith('data:image/')) return imageUrl;

  const response = await withTimeout(fetchImpl(imageUrl), timeoutMs);

  if (!response.ok) {
    const error = new Error(`Failed to download background removal result: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
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

async function removeWithFalBria(imageUrl, { falClient = fal, fetchImpl = fetch } = {}) {
  const apiKey = getFalKey();
  if (!apiKey) {
    return {
      imageUrl,
      changed: false,
      provider: 'fal_bria',
      reason: 'missing-key',
      durationMs: 0
    };
  }

  const parsedImage = parseDataUrl(imageUrl);
  if (!parsedImage) {
    return {
      imageUrl,
      changed: false,
      provider: 'fal_bria',
      reason: 'unsupported-image',
      durationMs: 0
    };
  }

  const maxInputBytes = getMaxInputBytes();
  if (parsedImage.buffer.length > maxInputBytes) {
    return {
      imageUrl,
      changed: false,
      provider: 'fal_bria',
      reason: 'image-too-large',
      inputBytes: parsedImage.buffer.length,
      maxInputBytes,
      durationMs: 0
    };
  }

  const model = process.env.BACKGROUND_REMOVAL_FAL_MODEL || 'fal-ai/bria/background/remove';
  const timeoutMs = getTimeoutMs();
  falClient.config?.({ credentials: apiKey });

  const startedAt = Date.now();
  const uploadedImageUrl = await withTimeout(
    falClient.storage.upload(new Blob([parsedImage.buffer], { type: parsedImage.mimeType })),
    timeoutMs
  );
  const result = await withTimeout(falClient.subscribe(model, {
    input: {
      image_url: uploadedImageUrl,
      sync_mode: true
    },
    logs: false
  }), timeoutMs);
  const outputUrl = result?.data?.image?.url || result?.image?.url || '';

  if (!outputUrl) {
    const error = new Error('fal BRIA response did not include an output image.');
    error.statusCode = 502;
    throw error;
  }

  const outputImageUrl = await imageUrlToDataUrl(outputUrl, { fetchImpl, timeoutMs });
  const outputBytes = parseDataUrl(outputImageUrl)?.buffer.length || Buffer.byteLength(outputImageUrl, 'utf8');

  return {
    imageUrl: outputImageUrl,
    changed: true,
    provider: 'fal_bria',
    model,
    inputBytes: parsedImage.buffer.length,
    outputBytes,
    durationMs: Date.now() - startedAt
  };
}

function getCostState(userId) {
  const userLimit = getUserLimit();
  const used = userId ? Number(countSuccessfulRemovals.get(userId)?.count || 0) : 0;
  const estimatedCostUsd = getEstimatedCostUsd();

  return {
    userLimit,
    used,
    remaining: Math.max(0, userLimit - used),
    estimatedCostUsd,
    maxUserCostUsd: Number((userLimit * estimatedCostUsd).toFixed(4)),
    canUse: userLimit === 0 ? false : used < userLimit
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

  const parsedImage = parseDataUrl(imageUrl);
  const userId = String(options.userId || '').trim();
  const imageHash = parsedImage ? hashImage(imageUrl) : '';
  const costState = getCostState(userId);

  if (userId && imageHash) {
    const cached = getCachedRemoval.get(userId, imageHash);
    if (cached?.outputImageUrl) {
      return {
        imageUrl: cached.outputImageUrl,
        changed: true,
        provider: cached.provider,
        reason: 'cached',
        cached: true,
        inputBytes: cached.inputBytes || 0,
        outputBytes: cached.outputBytes || 0,
        durationMs: 0,
        cost: costState
      };
    }
  }

  if (userId && !costState.canUse) {
    return {
      imageUrl,
      changed: false,
      provider,
      reason: 'user-limit-reached',
      durationMs: 0,
      cost: costState
    };
  }

  try {
    let result;
    if (provider === 'removebg') {
      result = await removeWithRemoveBg(imageUrl, options);
    } else if (provider === 'fal_bria') {
      result = await removeWithFalBria(imageUrl, options);
    } else {
      return {
        imageUrl,
        changed: false,
        provider,
        reason: 'unsupported-provider',
        durationMs: 0,
        cost: costState
      };
    }

    if (userId && imageHash && result.changed && result.imageUrl) {
      insertCachedRemoval.run({
        userId,
        imageHash,
        provider: result.provider,
        outputImageUrl: result.imageUrl,
        inputBytes: result.inputBytes || parsedImage?.buffer.length || 0,
        outputBytes: result.outputBytes || 0
      });
    }

    return {
      ...result,
      cost: getCostState(userId)
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
      durationMs: 0,
      cost: costState
    };
  }
}

export function getBackgroundRemovalConfig() {
  return {
    enabled: isEnabled(),
    provider: getProvider(),
    timeoutMs: getTimeoutMs(),
    maxInputBytes: getMaxInputBytes(),
    userLimit: getUserLimit(),
    estimatedCostUsd: getEstimatedCostUsd()
  };
}
