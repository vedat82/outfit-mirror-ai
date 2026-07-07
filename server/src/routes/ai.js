import express from 'express';
import OpenAI from 'openai';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { getIsPremium, requireUserId } from '../services/userService.js';
import { canSpendAiCredits, getAiUsageState, normalizeAccessTier, recordAiUsage } from '../services/aiUsageService.js';
import { modelByTier, selectInitialAiModel, selectUpgradeAiModel } from '../services/aiModelRouter.js';
import { createIpRateLimiter, createRateLimiter } from '../services/rateLimitService.js';
import { addBackendBreadcrumb, captureBackendError } from '../services/monitoringService.js';

const router = express.Router();
const analyzeImageRateLimit = createRateLimiter({
  scope: 'ai-analyze-image',
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  maxRequests: Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS || 20)
});
const seeOnMeRateLimit = createRateLimiter({
  scope: 'ai-see-on-me',
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  maxRequests: Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS || 20)
});
const seeOnMeIpRateLimit = createIpRateLimiter({
  scope: 'ai-see-on-me-ip',
  windowMs: Number(process.env.SEE_ON_ME_IP_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000),
  maxRequests: Number(process.env.SEE_ON_ME_IP_RATE_LIMIT_MAX_REQUESTS || 10),
  message: 'seeOnMe.tooManyAttempts'
});

const allowedTypes = ['tshirt', 'shirt', 'jacket', 'pants', 'shoes'];
const allowedColors = ['black', 'white', 'gray', 'blue', 'navy', 'beige', 'brown', 'red', 'green', 'pink', 'cream'];
const allowedStyles = ['casual', 'formal', 'sporty'];
const allowedSeasons = ['all', 'spring', 'summer', 'fall', 'winter'];
const reviewMessage = 'Could not analyze perfectly, please adjust.';
const reviewMessageKey = 'messages.aiReviewNeeded';
const usageNearLimitMessageKey = 'messages.aiUsageNearLimit';
const usageLimitReachedMessageKey = 'messages.aiUsageLimitReached';
const seeOnMeLimitReachedMessageKey = 'seeOnMe.limitReached';
const seeOnMeUnavailableMessageKey = 'seeOnMe.unavailable';
const seeOnMeGenerationFailedMessageKey = 'seeOnMe.generationFailed';
const seeOnMeTimeoutMessageKey = 'seeOnMe.timeout';
const seeOnMeTemporaryMessageKey = 'seeOnMe.serviceUnavailable';
const seeOnMeAuthMessageKey = 'seeOnMe.configUnavailable';
const seeOnMeQuotaMessageKey = 'seeOnMe.capacityUnavailable';
const seeOnMeOrganizationMessageKey = 'seeOnMe.organizationUnavailable';
const seeOnMeInvalidRequestMessageKey = 'seeOnMe.generationFailed';
const seeOnMeMaintenanceMessageKey = 'seeOnMe.maintenance';
const seeOnMeCooldownMessageKey = 'seeOnMe.cooldown';
const seeOnMeAlreadyRunningMessageKey = 'seeOnMe.alreadyRunning';

const activeSeeOnMeGenerations = new Map();
const seeOnMePreviewCache = new Map();

const countSeeOnMeUsage = db.prepare(`
  SELECT COUNT(*) as count
  FROM see_on_me_usage
  WHERE user_id = ? AND usage_date = ?
`);

const insertSeeOnMeUsage = db.prepare(`
  INSERT INTO see_on_me_usage (user_id, usage_date, access_tier)
  VALUES (?, ?, ?)
`);

const latestSeeOnMeUsage = db.prepare(`
  SELECT created_at as createdAt
  FROM see_on_me_usage
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`);

const countSeeOnMeUsageByDate = db.prepare(`
  SELECT COUNT(*) as count
  FROM see_on_me_usage
  WHERE usage_date = ?
`);

const insertSavedLook = db.prepare(`
  INSERT INTO saved_looks (user_id, preview_image_url, user_photo_image_url, outfit_json, metadata_json)
  VALUES (?, ?, ?, ?, ?)
`);

const listSavedLooks = db.prepare(`
  SELECT
    id,
    user_id as userId,
    preview_image_url as previewImageUrl,
    user_photo_image_url as userPhotoImageUrl,
    outfit_json as outfitJson,
    metadata_json as metadataJson,
    created_at as createdAt
  FROM saved_looks
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT 24
`);

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getResponseLanguage(language) {
  return language === 'en' ? 'English' : 'Turkish';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseLimitValue(value, fallback) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (normalizedValue === 'unlimited' || normalizedValue === 'true') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function getSeeOnMeLimit(accessTier) {
  if (String(process.env.SEE_ON_ME_UNLIMITED || '').trim().toLowerCase() === 'true') {
    return null;
  }

  if (accessTier === 'premium') {
    return parseLimitValue(process.env.SEE_ON_ME_PREMIUM_DAILY_LIMIT, 5);
  }

  if (accessTier === 'trial') {
    return parseLimitValue(process.env.SEE_ON_ME_TRIAL_DAILY_LIMIT, 2);
  }

  return 0;
}

function getSeeOnMeUsage(userId, accessTier) {
  const date = todayKey();
  const used = Number(countSeeOnMeUsage.get(userId, date)?.count || 0);
  const limit = getSeeOnMeLimit(accessTier);

  return {
    date,
    accessTier,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    canUse: limit === null || used < limit,
    isUnlimited: limit === null
  };
}

function recordSeeOnMeUsage(userId, accessTier) {
  insertSeeOnMeUsage.run(userId, todayKey(), accessTier);
  return getSeeOnMeUsage(userId, accessTier);
}

function isAdminBypass(req) {
  const configuredToken = String(process.env.SEE_ON_ME_ADMIN_BYPASS_TOKEN || '').trim();
  if (!configuredToken) return false;

  return String(req.get('x-admin-bypass') || '').trim() === configuredToken;
}

function getCooldownState(userId) {
  const cooldownSeconds = Number(process.env.SEE_ON_ME_COOLDOWN_SECONDS || 60);
  if (!Number.isFinite(cooldownSeconds) || cooldownSeconds <= 0) {
    return { isCoolingDown: false, remainingSeconds: 0, cooldownSeconds };
  }

  const latestUsage = latestSeeOnMeUsage.get(userId);
  if (!latestUsage?.createdAt) {
    return { isCoolingDown: false, remainingSeconds: 0, cooldownSeconds };
  }

  const latestAt = new Date(`${latestUsage.createdAt.replace(' ', 'T')}Z`).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - latestAt) / 1000));
  const remainingSeconds = Math.max(0, cooldownSeconds - elapsedSeconds);

  return {
    isCoolingDown: remainingSeconds > 0,
    remainingSeconds,
    cooldownSeconds
  };
}

function getBudgetState() {
  const budgetUsd = Number(process.env.SEE_ON_ME_DAILY_BUDGET_USD || 0);
  const estimatedCostUsd = Number(process.env.SEE_ON_ME_ESTIMATED_COST_USD || 0.08);
  const date = todayKey();
  const generationCount = Number(countSeeOnMeUsageByDate.get(date)?.count || 0);
  const usedUsd = generationCount * estimatedCostUsd;

  return {
    date,
    budgetUsd,
    estimatedCostUsd,
    generationCount,
    usedUsd,
    isExceeded: budgetUsd > 0 && usedUsd >= budgetUsd
  };
}

function getGenerationCacheKey({ userId, imageDataUrl, outfit, appearanceProfile, preferences, language }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      userId,
      imageHash: crypto.createHash('sha256').update(imageDataUrl).digest('hex'),
      outfit,
      appearanceProfile,
      preferences,
      language
    }))
    .digest('hex');
}

function getCachedPreview(cacheKey) {
  if (String(process.env.SEE_ON_ME_CACHE_ENABLED || 'true').trim().toLowerCase() === 'false') {
    return null;
  }

  const cachedPreview = seeOnMePreviewCache.get(cacheKey);
  const ttlMs = Number(process.env.SEE_ON_ME_CACHE_TTL_MS || 10 * 60 * 1000);

  if (!cachedPreview || cachedPreview.expiresAt <= Date.now()) {
    seeOnMePreviewCache.delete(cacheKey);
    return null;
  }

  return cachedPreview.value;
}

function setCachedPreview(cacheKey, preview) {
  if (String(process.env.SEE_ON_ME_CACHE_ENABLED || 'true').trim().toLowerCase() === 'false') {
    return;
  }

  const ttlMs = Number(process.env.SEE_ON_ME_CACHE_TTL_MS || 10 * 60 * 1000);
  seeOnMePreviewCache.set(cacheKey, {
    value: preview,
    expiresAt: Date.now() + ttlMs
  });
}

function buildAppearanceContext(appearanceProfile = {}, preferences = {}) {
  const parts = [
    appearanceProfile.gender ? `gender: ${appearanceProfile.gender}` : '',
    appearanceProfile.bodyType ? `body type: ${appearanceProfile.bodyType}` : '',
    appearanceProfile.height ? `height: ${appearanceProfile.height}` : '',
    appearanceProfile.skinTone ? `skin tone: ${appearanceProfile.skinTone}` : '',
    preferences.styleGoal ? `style goal: ${preferences.styleGoal}` : '',
    preferences.preferredStyle ? `preferred style: ${preferences.preferredStyle}` : ''
  ].filter(Boolean);

  return parts.length ? `User context: ${parts.join(', ')}.` : 'User context: not provided.';
}

function buildPrompt(mode, language, appearanceProfile, preferences) {
  const responseLanguage = getResponseLanguage(language);

  if (mode === 'outfit') {
    return `Analyze this outfit photo. Return only JSON:
{"rating":1-10,"feedback":"short sentence","suggestions":["short suggestion","short suggestion"],"confidence":0-1}
${buildAppearanceContext(appearanceProfile, preferences)}
Use body type, height, gender, and style goal only for supportive fit and proportion advice. Avoid stereotypes. Keep it inclusive.
Keep it concise. Max 3 suggestions. Write feedback and suggestions in ${responseLanguage}. Use confidence to reflect image clarity.`;
  }

  return `Analyze clothing in this image. Return only JSON:
{"items":[{"type":"tshirt|shirt|jacket|pants|shoes","color":"black|white|gray|blue|navy|beige|brown|red|green|pink|cream","style":"casual|formal|sporty","season":"all|spring|summer|fall|winter","confidence":0-1,"box":{"x":0-1,"y":0-1,"width":0-1,"height":0-1}}]}
Use closest allowed values. If there are multiple visible clothing items, include up to 4.
For each item, include a normalized bounding box around only that clothing item, relative to the full image: x/y are top-left, width/height are item size. Make the box slightly generous, but avoid including unrelated garments when possible.
For shoes, the box must include the full visible shoe or shoe pair, not only the heel, toe, laces, sole, or another small detail.
Use confidence to reflect image clarity and item certainty.`;
}

function buildPhotoValidationPrompt(language) {
  const responseLanguage = getResponseLanguage(language);

  return `Validate this user photo for a premium outfit preview. Return only JSON:
{"isValid":true|false,"issues":["fullBody","blurry","lighting","multiplePeople","orientation"],"severity":"ok|borderline|reject","message":"short friendly message","confidence":0-1}
Be pragmatic, not perfectionist. Accept mirror selfies, indoor mirror photos, normal indoor lighting, slight blur, imperfect framing, and partial lower-leg visibility if outfit placement is still possible.
Use "borderline" for photos that may not be ideal but are still worth trying.
Use "reject" only for clearly unusable inputs: multiple people, extremely blurry, almost completely dark, sideways/upside down, or heavily cropped upper-body-only images.
Write message in ${responseLanguage}.`;
}

function describeOutfit(outfit = {}) {
  const parts = [
    outfit.top ? `top: ${outfit.top.color} ${outfit.top.type}` : '',
    outfit.bottom ? `bottom: ${outfit.bottom.color} ${outfit.bottom.type}` : '',
    outfit.shoes ? `shoes: ${outfit.shoes.color} ${outfit.shoes.type}` : '',
    outfit.jacket ? `layer: ${outfit.jacket.color} ${outfit.jacket.type}` : ''
  ].filter(Boolean);

  return parts.join(', ') || 'outfit pieces from the user wardrobe';
}

function buildSeeOnMePrompt({ outfit, appearanceProfile, preferences, language }) {
  return `Create a premium mobile fashion preview of the person wearing this outfit: ${describeOutfit(outfit)}.
Use the first image as the person reference. Additional images, if provided, are the user's real wardrobe item references.
Preserve the person's real face identity, body proportions, pose, camera perspective, lighting direction, and natural silhouette.
Dress the person in the referenced wardrobe pieces when available. Match their visual details as closely as possible: color, texture, cut, sleeve length, trouser shape, shoe style, and layering.
Place clothing realistically: natural scale, correct shoulder/waist/leg/foot alignment, correct occlusion, believable folds, no floating garments, no warped limbs, no distorted body shape, no face replacement.
Support mirror selfies, indoor photos, and slightly imperfect framing while keeping the result plausible.
Avoid random hallucinated clothing. If a reference item is missing, infer only from the outfit metadata.
User context: ${buildAppearanceContext(appearanceProfile, preferences)}
Output only the final preview image. Language context: ${getResponseLanguage(language)}.`;
}

function getOutfitReferenceImages(outfit = {}) {
  return [outfit.top, outfit.bottom, outfit.shoes, outfit.jacket]
    .map((item) => String(item?.imageUrl || '').trim())
    .filter((imageUrl) => imageUrl.startsWith('data:image/'))
    .slice(0, 4);
}

function byteLength(value = '') {
  return Buffer.byteLength(String(value), 'utf8');
}

function safeImageLabel(index) {
  return index === 0 ? 'person' : `wardrobe-${index}`;
}

function buildGenerationImages(personImageUrl, outfit) {
  const maxSingleImageBytes = Number(process.env.SEE_ON_ME_MAX_SINGLE_IMAGE_BYTES || 1_800_000);
  const maxTotalImageBytes = Number(process.env.SEE_ON_ME_MAX_TOTAL_IMAGE_BYTES || 6_000_000);
  const maxReferenceImages = Number(process.env.SEE_ON_ME_MAX_REFERENCE_IMAGES || 3);
  const sourceImages = [personImageUrl, ...getOutfitReferenceImages(outfit).slice(0, maxReferenceImages)];
  const images = [];
  const skipped = [];
  let totalBytes = 0;

  sourceImages.forEach((imageUrl, index) => {
    const bytes = byteLength(imageUrl);
    const label = safeImageLabel(index);

    if (index > 0 && bytes > maxSingleImageBytes) {
      skipped.push({ label, reason: 'single-image-too-large', bytes });
      return;
    }

    if (index > 0 && totalBytes + bytes > maxTotalImageBytes) {
      skipped.push({ label, reason: 'total-payload-too-large', bytes });
      return;
    }

    images.push({ label, imageUrl, bytes });
    totalBytes += bytes;
  });

  return {
    images,
    skipped,
    totalBytes,
    maxSingleImageBytes,
    maxTotalImageBytes
  };
}

function getSeeOnMeGenerationModel() {
  const configuredModel = process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_IMAGE_ROUTER_MODEL || modelByTier.pro;

  if (configuredModel.startsWith('gpt-image')) {
    const fallbackModel = process.env.OPENAI_IMAGE_ROUTER_MODEL || modelByTier.pro;
    console.warn('[ai/see-on-me] OPENAI_IMAGE_MODEL must be a Responses-compatible mainline model when using the image_generation tool.', {
      configuredModel,
      fallbackModel
    });
    return fallbackModel;
  }

  return configuredModel;
}

function classifyOpenAIError(error) {
  const status = error?.status || error?.statusCode || error?.response?.status;
  const code = error?.code || error?.error?.code || '';
  const type = error?.type || error?.error?.type || '';
  const message = String(error?.message || error?.error?.message || '').toLowerCase();

  if (message.includes('organization must be verified') || message.includes('verify organization')) {
    return { category: 'organization_restriction', messageKey: seeOnMeOrganizationMessageKey, safeCode: 'AI_ORG_RESTRICTED' };
  }

  if (status === 401 || code.includes('auth') || type.includes('auth')) {
    return { category: 'auth', messageKey: seeOnMeAuthMessageKey, safeCode: 'AI_AUTH_UNAVAILABLE' };
  }

  if (
    status === 429 ||
    code === 'rate_limit_exceeded' ||
    code === 'insufficient_quota' ||
    type.includes('rate_limit') ||
    message.includes('quota') ||
    message.includes('billing')
  ) {
    return { category: 'quota', messageKey: seeOnMeQuotaMessageKey, safeCode: 'AI_CAPACITY_UNAVAILABLE' };
  }

  if (error?.name === 'AbortError' || code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('timed out')) {
    return { category: 'timeout', messageKey: seeOnMeTimeoutMessageKey, safeCode: 'AI_TIMEOUT' };
  }

  if (status === 400 || message.includes('invalid') || message.includes('unsupported')) {
    return { category: message.includes('model') ? 'unsupported_model' : 'invalid_request', messageKey: seeOnMeInvalidRequestMessageKey, safeCode: 'AI_INVALID_REQUEST' };
  }

  if (status >= 500) {
    return { category: 'service_unavailable', messageKey: seeOnMeTemporaryMessageKey, safeCode: 'AI_SERVICE_UNAVAILABLE' };
  }

  return { category: 'unknown', messageKey: seeOnMeGenerationFailedMessageKey, safeCode: 'AI_UNKNOWN_FAILURE' };
}

function logOpenAIError(error, context = {}) {
  const classification = classifyOpenAIError(error);
  console.error('[ai/see-on-me] OpenAI generation error', {
    ...context,
    category: classification.category,
    name: error?.name,
    status: error?.status || error?.statusCode || error?.response?.status,
    code: error?.code || error?.error?.code,
    type: error?.type || error?.error?.type,
    message: error?.message || error?.error?.message,
    stack: error?.stack
  });
  return classification;
}

function clampConfidence(value, fallback = 0.65) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.min(1, numericValue));
}

function pickAllowed(value, allowedValues, fallback) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  const matchedValue = allowedValues.find((allowedValue) => allowedValue === normalizedValue);
  return {
    value: matchedValue || fallback,
    isValid: Boolean(matchedValue)
  };
}

function normalizeBoundingBox(box) {
  if (!box || typeof box !== 'object') return null;

  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);

  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0.05 || height <= 0.05) return null;

  const safeX = Math.max(0, Math.min(0.96, x));
  const safeY = Math.max(0, Math.min(0.96, y));
  const safeWidth = Math.max(0.08, Math.min(1 - safeX, width));
  const safeHeight = Math.max(0.08, Math.min(1 - safeY, height));

  return {
    x: Number(safeX.toFixed(4)),
    y: Number(safeY.toFixed(4)),
    width: Number(safeWidth.toFixed(4)),
    height: Number(safeHeight.toFixed(4))
  };
}

function parseJsonResponse(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildClothingFallback(reason = reviewMessage) {
  return {
    mode: 'clothing',
    usedFallback: true,
    messageKey: reviewMessageKey,
    message: reason,
    items: [
      {
        type: 'tshirt',
        color: 'black',
        style: 'casual',
        season: 'all',
        confidence: 0.35,
        uncertainFields: ['type', 'color', 'style', 'season']
      }
    ]
  };
}

function buildOutfitFallback(reason = reviewMessage) {
  return {
    mode: 'outfit',
    usedFallback: true,
    messageKey: reviewMessageKey,
    message: reason,
    rating: 7,
    feedback: reason,
    suggestions: [reason],
    confidence: 0.35,
    uncertainFields: ['rating', 'feedback', 'suggestions']
  };
}

function normalizeClothingAnalysis(rawAnalysis, fallbackMessage = reviewMessage) {
  const rawItems = Array.isArray(rawAnalysis?.items) ? rawAnalysis.items : [rawAnalysis];
  const items = rawItems
    .filter(Boolean)
    .slice(0, 4)
    .map((item) => {
      const type = pickAllowed(item.type, allowedTypes, 'tshirt');
      const color = pickAllowed(item.color, allowedColors, 'black');
      const style = pickAllowed(item.style, allowedStyles, 'casual');
      const season = pickAllowed(item.season, allowedSeasons, 'all');
      const confidence = clampConfidence(item.confidence, [type, color, style, season].every((field) => field.isValid) ? 0.82 : 0.48);
      const invalidFields = [
        !type.isValid ? 'type' : null,
        !color.isValid ? 'color' : null,
        !style.isValid ? 'style' : null,
        !season.isValid ? 'season' : null
      ].filter(Boolean);
      const uncertainFields = confidence < 0.65 ? ['type', 'color', 'style', 'season'] : invalidFields;

      return {
        type: type.value,
        color: color.value,
        style: style.value,
        season: season.value,
        confidence,
        box: normalizeBoundingBox(item.box),
        uncertainFields
      };
    });

  if (!items.length) {
    return buildClothingFallback(fallbackMessage);
  }

  const lowConfidence = items.some((item) => item.confidence < 0.65 || item.uncertainFields.length > 0);

  return {
    mode: 'clothing',
    usedFallback: false,
    messageKey: lowConfidence ? reviewMessageKey : '',
    message: lowConfidence ? fallbackMessage : '',
    items
  };
}

function normalizeOutfitAnalysis(rawAnalysis, fallbackMessage = reviewMessage) {
  const numericRating = Number(rawAnalysis?.rating);
  const rating = Math.max(1, Math.min(10, Number.isFinite(numericRating) ? Math.round(numericRating) : 7));
  const suggestions = Array.isArray(rawAnalysis?.suggestions)
    ? rawAnalysis.suggestions.map((suggestion) => String(suggestion || '').trim()).filter(Boolean).slice(0, 3)
    : [];
  const confidence = clampConfidence(rawAnalysis?.confidence, Number.isFinite(numericRating) ? 0.78 : 0.45);
  const uncertainFields = [
    !Number.isFinite(numericRating) || confidence < 0.65 ? 'rating' : null,
    !rawAnalysis?.feedback || confidence < 0.65 ? 'feedback' : null,
    !suggestions.length || confidence < 0.65 ? 'suggestions' : null
  ].filter(Boolean);

  return {
    mode: 'outfit',
    usedFallback: false,
    messageKey: uncertainFields.length ? reviewMessageKey : '',
    message: uncertainFields.length ? fallbackMessage : '',
    rating,
    feedback: String(rawAnalysis?.feedback || 'The outfit looks balanced.').trim().slice(0, 220),
    suggestions,
    confidence,
    uncertainFields
  };
}

function normalizePhotoValidation(rawValidation) {
  const issues = Array.isArray(rawValidation?.issues)
    ? rawValidation.issues
        .map((issue) => String(issue || '').trim())
        .filter((issue) => ['fullBody', 'blurry', 'lighting', 'multiplePeople', 'orientation'].includes(issue))
    : [];
  const confidence = clampConfidence(rawValidation?.confidence, rawValidation?.isValid === false ? 0.5 : 0.74);
  const rawSeverity = String(rawValidation?.severity || '').trim().toLowerCase();
  const modelSaysUsable = rawValidation?.isValid === true && rawSeverity === 'ok' && confidence >= 0.55;
  const hardRejectIssues = issues.filter((issue) => ['multiplePeople', 'orientation'].includes(issue));
  const isHardReject = rawSeverity === 'reject' || hardRejectIssues.length > 0 || (issues.includes('fullBody') && confidence < 0.35);
  const isBorderline = !isHardReject && !modelSaysUsable && (rawSeverity === 'borderline' || issues.length > 0 || confidence < 0.55);

  return {
    isValid: !isHardReject && !isBorderline,
    canContinue: !isHardReject,
    severity: isHardReject ? 'reject' : isBorderline ? 'borderline' : 'ok',
    issues,
    message: String(rawValidation?.message || '').trim().slice(0, 180),
    confidence
  };
}

function getAccessTier(req) {
  return normalizeAccessTier(getIsPremium(req) ? 'premium' : 'free');
}

function withUsageMessage(analysis, usage) {
  if (!usage.isNearLimit) {
    return analysis;
  }

  return {
    ...analysis,
    messageKey: analysis.messageKey || usageNearLimitMessageKey
  };
}

async function runOpenAIAnalysis({ client, model, mode, imageDataUrl, language, appearanceProfile, preferences }) {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(mode, language, appearanceProfile, preferences) },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: mode === 'clothing' ? 420 : 260
  });

  const content = completion.choices?.[0]?.message?.content || '{}';
  console.log('[ai/analyze-image] raw response', { mode, model, content });

  const rawAnalysis = parseJsonResponse(content);
  return rawAnalysis
    ? mode === 'outfit'
      ? normalizeOutfitAnalysis(rawAnalysis)
      : normalizeClothingAnalysis(rawAnalysis)
    : mode === 'outfit'
      ? buildOutfitFallback()
      : buildClothingFallback();
}

async function validateSeeOnMePhoto({ client, model, imageDataUrl, language }) {
  if (!client) {
    return {
      isValid: true,
      issues: [],
      message: '',
      confidence: 0.68,
      usedFallback: true
    };
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPhotoValidationPrompt(language) },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 180
  });
  const content = completion.choices?.[0]?.message?.content || '{}';
  console.log('[ai/see-on-me] validation raw response', { model, content });
  return normalizePhotoValidation(parseJsonResponse(content) || {});
}

function extractGeneratedImageDataUrl(response) {
  const output = Array.isArray(response?.output) ? response.output : [];

  for (const item of output) {
    if (item?.type === 'image_generation_call' && item.result) {
      return `data:image/png;base64,${item.result}`;
    }

    const content = Array.isArray(item?.content) ? item.content : [];
    for (const contentItem of content) {
      if (contentItem?.type === 'output_image' && contentItem.image_base64) {
        return `data:image/png;base64,${contentItem.image_base64}`;
      }
    }
  }

  return '';
}

async function generateSeeOnMePreview({ client, imageDataUrl, outfit, appearanceProfile, preferences, language }) {
  if (!client) {
    return {
      previewImageUrl: imageDataUrl,
      usedFallback: true,
      messageKey: reviewMessageKey,
      message: reviewMessage
    };
  }

  const model = getSeeOnMeGenerationModel();
  const timeoutMs = Number(process.env.SEE_ON_ME_OPENAI_TIMEOUT_MS || 180000);
  const imagePayload = buildGenerationImages(imageDataUrl, outfit);
  const content = [
    { type: 'input_text', text: buildSeeOnMePrompt({ outfit, appearanceProfile, preferences, language }) },
    ...imagePayload.images.map((item) => ({ type: 'input_image', image_url: item.imageUrl }))
  ];

  console.log('[ai/see-on-me] OpenAI image generation start', {
    model,
    timeoutMs,
    imageCount: imagePayload.images.length,
    payloadBytes: imagePayload.totalBytes,
    imageBytes: imagePayload.images.map((item) => ({ label: item.label, bytes: item.bytes })),
    skippedImages: imagePayload.skipped,
    maxSingleImageBytes: imagePayload.maxSingleImageBytes,
    maxTotalImageBytes: imagePayload.maxTotalImageBytes
  });

  const startedAt = Date.now();
  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'user',
        content
      }
    ],
    tools: [{ type: 'image_generation', quality: 'medium', size: '1024x1536' }],
    tool_choice: { type: 'image_generation' }
  }, { timeout: timeoutMs });
  const durationMs = Date.now() - startedAt;

  console.log('[ai/see-on-me] OpenAI image generation response', {
    model,
    durationMs,
    outputTypes: Array.isArray(response?.output) ? response.output.map((item) => item.type) : []
  });

  const previewImageUrl = extractGeneratedImageDataUrl(response);

  if (!previewImageUrl) {
    const error = new Error('OpenAI response did not include an image_generation_call result.');
    error.statusCode = 502;
    error.responseOutputTypes = Array.isArray(response?.output) ? response.output.map((item) => item.type) : [];
    throw error;
  }

  return {
    previewImageUrl,
    usedFallback: false,
    messageKey: '',
    message: '',
    generationDiagnostics: {
      model,
      durationMs,
      imageCount: imagePayload.images.length,
      payloadBytes: imagePayload.totalBytes,
      skippedImages: imagePayload.skipped
    }
  };
}

async function analyzeWithOpenAI({ userId, accessTier, mode, imageDataUrl, language, appearanceProfile, preferences }) {
  const client = getOpenAIClient();

  if (!client) {
    const fallback = mode === 'outfit' ? buildOutfitFallback(reviewMessage) : buildClothingFallback(reviewMessage);
    console.log('[ai/analyze-image] fallback response', { mode, error: 'OPENAI_API_KEY is missing', fallback });
    return fallback;
  }

  const initialRoute = selectInitialAiModel({ userId, accessTier, taskType: mode });

  if (!initialRoute.usage.canSpend) {
    const error = new Error(usageLimitReachedMessageKey);
    error.statusCode = 429;
    error.messageKey = usageLimitReachedMessageKey;
    throw error;
  }

  let chargedForRequest = false;

  try {
    let route = initialRoute;
    let normalizedAnalysis = await runOpenAIAnalysis({ client, model: route.model, mode, imageDataUrl, language, appearanceProfile, preferences });
    recordAiUsage({ userId, accessTier, taskType: mode, modelTier: route.modelTier });
    chargedForRequest = true;

    const confidence = mode === 'outfit'
      ? normalizedAnalysis.confidence
      : Math.min(...normalizedAnalysis.items.map((item) => item.confidence));

    if (confidence < 0.55) {
      const upgradeRoute = selectUpgradeAiModel({ userId, accessTier, taskType: mode, currentTier: route.modelTier });

      if (upgradeRoute) {
        route = upgradeRoute;
        normalizedAnalysis = await runOpenAIAnalysis({ client, model: route.model, mode, imageDataUrl, language, appearanceProfile, preferences });
        recordAiUsage({ userId, accessTier, taskType: mode, modelTier: route.modelTier });
      }
    }

    const usage = getAiUsageState(userId, accessTier);
    console.log('[ai/analyze-image] normalized response', { mode, modelTier: route.modelTier, accessTier, normalizedAnalysis });
    return withUsageMessage(normalizedAnalysis, usage);
  } catch (error) {
    if (error.messageKey) {
      throw error;
    }

    if (!chargedForRequest) {
      recordAiUsage({ userId, accessTier, taskType: mode, modelTier: initialRoute.modelTier });
    }

    const fallback = mode === 'outfit' ? buildOutfitFallback() : buildClothingFallback();
    console.log('[ai/analyze-image] fallback response', { mode, error: error.message, fallback });
    return fallback;
  }
}

router.post('/analyze-image', analyzeImageRateLimit, async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const mode = req.body?.mode === 'outfit' ? 'outfit' : 'clothing';
  const language = req.body?.language === 'en' ? 'en' : 'tr';
  const accessTier = getAccessTier(req);
  const appearanceProfile = req.body?.appearanceProfile && typeof req.body.appearanceProfile === 'object' ? req.body.appearanceProfile : {};
  const preferences = req.body?.preferences && typeof req.body.preferences === 'object' ? req.body.preferences : {};
  const imageDataUrl = String(req.body?.imageDataUrl || '');
  const continueAnyway = Boolean(req.body?.continueAnyway);
  addBackendBreadcrumb(req, 'ai', 'analyze-image:start', {
    mode,
    accessTier,
    imageBytes: imageDataUrl.length
  });

  if (!imageDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ message: 'A valid image data URL is required.' });
  }

  try {
    const analysis = await analyzeWithOpenAI({ userId, accessTier, mode, imageDataUrl, language, appearanceProfile, preferences });
    return res.json(analysis);
  } catch (error) {
    captureBackendError(error, req, {
      area: 'ai-analyze-image',
      mode,
      accessTier,
      statusCode: error.statusCode || 500
    });
    return res.status(error.statusCode || 500).json({
      message: error.messageKey || error.message || 'Image analysis failed.',
      messageKey: error.messageKey || ''
    });
  }
});

router.post('/see-on-me', seeOnMeIpRateLimit, seeOnMeRateLimit, async (req, res) => {
  const requestStartedAt = Date.now();
  const userId = requireUserId(req, res);
  if (!userId) return;

  const language = req.body?.language === 'en' ? 'en' : 'tr';
  const accessTier = getAccessTier(req);
  const imageDataUrl = String(req.body?.imageDataUrl || '');
  const outfit = req.body?.outfit && typeof req.body.outfit === 'object' ? req.body.outfit : null;
  const appearanceProfile = req.body?.appearanceProfile && typeof req.body.appearanceProfile === 'object' ? req.body.appearanceProfile : {};
  const preferences = req.body?.preferences && typeof req.body.preferences === 'object' ? req.body.preferences : {};
  const continueAnyway = Boolean(req.body?.continueAnyway);
  const usage = getSeeOnMeUsage(userId, accessTier);
  const adminBypass = isAdminBypass(req);
  addBackendBreadcrumb(req, 'ai', 'see-on-me:start', {
    accessTier,
    imageBytes: imageDataUrl.length,
    usage: usage.used,
    adminBypass
  });

  if (!adminBypass && String(process.env.SEE_ON_ME_FORCE_DISABLED || '').trim().toLowerCase() === 'true') {
    console.warn('[ai/see-on-me] force-disabled rejection', { userId, accessTier });
    return res.status(503).json({
      message: seeOnMeMaintenanceMessageKey,
      messageKey: seeOnMeMaintenanceMessageKey,
      code: 'SEE_ON_ME_MAINTENANCE',
      category: 'maintenance'
    });
  }

  if (!adminBypass && accessTier === 'free') {
    return res.status(403).json({ message: 'Available in Premium', messageKey: 'premium.availableInPremium' });
  }

  if (!imageDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ message: 'A valid image data URL is required.' });
  }

  if (!outfit?.top || !outfit?.bottom || !outfit?.shoes) {
    return res.status(400).json({ message: 'A generated outfit is required.' });
  }

  const cacheKey = getGenerationCacheKey({ userId, imageDataUrl, outfit, appearanceProfile, preferences, language });
  const cachedPreview = !adminBypass ? getCachedPreview(cacheKey) : null;

  if (cachedPreview) {
    const cacheHitDurationMs = Date.now() - requestStartedAt;
    console.log('[ai/see-on-me] cache hit', { userId, accessTier, durationMs: cacheHitDurationMs });
    return res.json({
      ...cachedPreview,
      usage,
      cached: true,
      metadata: {
        ...(cachedPreview.metadata || {}),
        timings: {
          ...(cachedPreview.metadata?.timings || {}),
          cacheHitDurationMs,
          totalDurationMs: cacheHitDurationMs
        }
      }
    });
  }

  if (!adminBypass && !usage.canUse) {
    console.warn('[ai/see-on-me] daily limit rejection', { userId, accessTier, usage });
    return res.status(429).json({ message: seeOnMeLimitReachedMessageKey, messageKey: seeOnMeLimitReachedMessageKey, usage });
  }

  const budgetState = getBudgetState();
  if (!adminBypass && budgetState.isExceeded) {
    console.warn('[ai/see-on-me] budget rejection', { userId, accessTier, budgetState });
    return res.status(503).json({
      message: seeOnMeQuotaMessageKey,
      messageKey: seeOnMeQuotaMessageKey,
      code: 'SEE_ON_ME_DAILY_BUDGET_EXCEEDED',
      category: 'budget',
      budget: {
        date: budgetState.date,
        generationCount: budgetState.generationCount
      }
    });
  }

  const cooldown = getCooldownState(userId);
  if (!adminBypass && cooldown.isCoolingDown) {
    console.warn('[ai/see-on-me] cooldown rejection', { userId, accessTier, remainingSeconds: cooldown.remainingSeconds });
    return res.status(429).json({
      message: seeOnMeCooldownMessageKey,
      messageKey: seeOnMeCooldownMessageKey,
      code: 'SEE_ON_ME_COOLDOWN',
      category: 'cooldown',
      retryAfterSeconds: cooldown.remainingSeconds
    });
  }

  if (!adminBypass && activeSeeOnMeGenerations.has(userId)) {
    console.warn('[ai/see-on-me] concurrent rejection', { userId, accessTier });
    return res.status(409).json({
      message: seeOnMeAlreadyRunningMessageKey,
      messageKey: seeOnMeAlreadyRunningMessageKey,
      code: 'SEE_ON_ME_ALREADY_RUNNING',
      category: 'concurrent'
    });
  }

  const validationUsage = canSpendAiCredits(userId, accessTier, 'nano');
  const generationUsage = canSpendAiCredits(userId, accessTier, 'pro');

  if (!adminBypass && (!validationUsage.canSpend || !generationUsage.canSpend)) {
    return res.status(429).json({ message: usageLimitReachedMessageKey, messageKey: usageLimitReachedMessageKey });
  }

  const client = getOpenAIClient();
  activeSeeOnMeGenerations.set(userId, {
    startedAt: Date.now(),
    accessTier
  });

  try {
    const validationStartedAt = Date.now();
    const validation = await validateSeeOnMePhoto({
      client,
      model: modelByTier.nano,
      imageDataUrl,
      language
    });
    const validationDurationMs = Date.now() - validationStartedAt;
    recordAiUsage({ userId, accessTier, taskType: 'see-on-me-validation', modelTier: 'nano' });

    if (validation.severity !== 'ok') {
      console.log('[ai/see-on-me] validation decision', {
        decision: validation.canContinue ? 'borderline' : 'rejected',
        issues: validation.issues,
        confidence: validation.confidence,
        continueAnyway
      });
    }

    if (!validation.isValid) {
      if (validation.canContinue && !continueAnyway) {
        return res.status(422).json({
          message: validation.message || 'This photo may not be ideal, but you can still try.',
          messageKey: 'seeOnMe.validationWarning',
          validation,
          usage
        });
      }

      if (!validation.canContinue) {
        return res.status(422).json({
          message: validation.message || seeOnMeUnavailableMessageKey,
          messageKey: 'seeOnMe.validationFailed',
          validation,
          usage
        });
      }

      console.log('[ai/see-on-me] continuing with borderline photo by user choice', {
        userId,
        accessTier,
        issues: validation.issues,
        confidence: validation.confidence
      });
    }

    let preview;
    let generationDurationMs = 0;

    try {
      const generationStartedAt = Date.now();
      preview = await generateSeeOnMePreview({
        client,
        imageDataUrl,
        outfit,
        appearanceProfile,
        preferences,
        language
      });
      generationDurationMs = Date.now() - generationStartedAt;
      recordAiUsage({ userId, accessTier, taskType: 'see-on-me-generation', modelTier: 'pro' });
      console.log('[ai/see-on-me] generation success', {
        userId,
        accessTier,
        timings: {
          validationDurationMs,
          generationDurationMs,
          openAiGenerationDurationMs: preview.generationDiagnostics?.durationMs || generationDurationMs,
          totalDurationMs: Date.now() - requestStartedAt
        },
        generationDiagnostics: preview.generationDiagnostics || null
      });
    } catch (generationError) {
      const classification = logOpenAIError(generationError, {
        accessTier,
        userId,
        route: '/ai/see-on-me'
      });
      captureBackendError(generationError, req, {
        area: 'ai-see-on-me-generation',
        accessTier,
        category: classification.category,
        statusCode: generationError.statusCode || generationError.status || 502
      });
      return res.status(generationError.statusCode || generationError.status || 502).json({
        message: classification.messageKey,
        messageKey: classification.messageKey,
        code: classification.safeCode,
        category: classification.category
      });
    }

    const nextUsage = recordSeeOnMeUsage(userId, accessTier);
    const timings = {
      validationDurationMs,
      generationDurationMs,
      openAiGenerationDurationMs: preview.generationDiagnostics?.durationMs || generationDurationMs,
      totalDurationMs: Date.now() - requestStartedAt
    };
    const responsePayload = {
      ...preview,
      validation,
      usage: nextUsage,
      outfit,
      metadata: {
        modelTier: 'pro',
        validationModelTier: 'nano',
        generatedAt: new Date().toISOString(),
        timings,
        generationDiagnostics: preview.generationDiagnostics || null
      }
    };
    setCachedPreview(cacheKey, responsePayload);

    return res.json(responsePayload);
  } catch (error) {
    console.error('[ai/see-on-me] route failure', {
      userId,
      accessTier,
      durationMs: Date.now() - requestStartedAt,
      message: error.message,
      messageKey: error.messageKey
    });
    captureBackendError(error, req, {
      area: 'ai-see-on-me',
      accessTier,
      statusCode: error.statusCode || 500
    });
    return res.status(error.statusCode || 500).json({
      message: error.messageKey || seeOnMeUnavailableMessageKey,
      messageKey: error.messageKey || seeOnMeUnavailableMessageKey,
      code: error.messageKey ? 'AI_KNOWN_FAILURE' : 'AI_UNKNOWN_FAILURE'
    });
  } finally {
    activeSeeOnMeGenerations.delete(userId);
  }
});

router.post('/see-on-me/save', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const accessTier = getAccessTier(req);
  const previewImageUrl = String(req.body?.previewImageUrl || '');
  const userPhotoImageUrl = String(req.body?.userPhotoImageUrl || '');
  const outfit = req.body?.outfit && typeof req.body.outfit === 'object' ? req.body.outfit : null;
  const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

  if (accessTier === 'free') {
    return res.status(403).json({ message: 'Available in Premium', messageKey: 'premium.availableInPremium' });
  }

  if (!previewImageUrl.startsWith('data:image/') || !outfit) {
    return res.status(400).json({ message: 'A preview image and outfit are required.' });
  }

  const saveUsage = canSpendAiCredits(userId, accessTier, 'mini');

  if (saveUsage.canSpend) {
    recordAiUsage({ userId, accessTier, taskType: 'see-on-me-save', modelTier: 'mini' });
  }

  const result = insertSavedLook.run(
    userId,
    previewImageUrl,
    userPhotoImageUrl.startsWith('data:image/') ? userPhotoImageUrl : null,
    JSON.stringify(outfit),
    JSON.stringify(metadata)
  );

  return res.status(201).json({
    id: result.lastInsertRowid,
    userId,
    previewImageUrl,
    userPhotoImageUrl: userPhotoImageUrl.startsWith('data:image/') ? userPhotoImageUrl : '',
    outfit,
    metadata,
    createdAt: new Date().toISOString()
  });
});

router.get('/see-on-me/saved', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const looks = listSavedLooks.all(userId).map((look) => ({
    id: look.id,
    userId: look.userId,
    previewImageUrl: look.previewImageUrl,
    userPhotoImageUrl: look.userPhotoImageUrl || '',
    outfit: parseJsonResponse(look.outfitJson) || {},
    metadata: parseJsonResponse(look.metadataJson || '{}') || {},
    createdAt: look.createdAt
  }));

  return res.json(looks);
});

export default router;
