import { Router } from 'express';
import Iyzipay from 'iyzipay';
import { db } from '../db.js';
import { getUserId, requireUserId } from '../services/userService.js';
import { createRateLimiter } from '../services/rateLimitService.js';
import { addBackendBreadcrumb, captureBackendError } from '../services/monitoringService.js';
import { getPlanById, pricingConfig } from '../config/pricing.js';
import { AppleIapVerificationError, verifyApplePurchase } from '../services/appleIapVerificationService.js';

const router = Router();
const initiatePaymentRateLimit = createRateLimiter({
  scope: 'payment-initiate',
  windowMs: Number(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
  maxRequests: Number(process.env.PAYMENT_RATE_LIMIT_MAX_REQUESTS || 5)
});
const allowedPlatforms = new Set(['ios', 'android', 'web']);
const paymentSources = {
  ios: 'iap',
  android: 'iyzico',
  web: 'iyzico'
};

const insertPaymentSession = db.prepare(`
  INSERT INTO payment_sessions (user_id, platform, payment_source, token, conversation_id, plan, amount, currency, status, payment_page_url, raw_result)
  VALUES (@userId, @platform, @paymentSource, @token, @conversationId, @plan, @amount, @currency, @status, @paymentPageUrl, @rawResult)
`);

const updatePaymentSession = db.prepare(`
  UPDATE payment_sessions
  SET status = @status,
      raw_result = @rawResult,
      updated_at = CURRENT_TIMESTAMP
  WHERE token = @token
`);

const insertPaymentRecord = db.prepare(`
  INSERT INTO payment_records (user_id, platform, payment_source, token, conversation_id, plan, amount, currency, status, raw_result)
  VALUES (@userId, @platform, @paymentSource, @token, @conversationId, @plan, @amount, @currency, @status, @rawResult)
`);

const getPaymentSessionByToken = db.prepare(`
  SELECT id, user_id as userId, platform, payment_source as paymentSource, token, conversation_id as conversationId, plan, amount, currency, status
  FROM payment_sessions
  WHERE token = ?
`);

const upsertPremiumAccess = db.prepare(`
  INSERT INTO user_access (user_id, is_premium, premium_plan, premium_source, platform, premium_started_at, subscription_started_at, updated_at)
  VALUES (?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    is_premium = 1,
    premium_plan = excluded.premium_plan,
    premium_source = excluded.premium_source,
    platform = excluded.platform,
    premium_started_at = COALESCE(user_access.premium_started_at, CURRENT_TIMESTAMP),
    subscription_started_at = COALESCE(user_access.subscription_started_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
`);

const getAccess = db.prepare(`
  SELECT
    is_premium as isPremium,
    premium_plan as premiumPlan,
    premium_source as premiumSource,
    platform,
    premium_started_at as premiumStartedAt,
    subscription_started_at as subscriptionStartedAt
  FROM user_access
  WHERE user_id = ?
`);

const resetAccess = db.prepare(`
  INSERT INTO user_access (user_id, is_premium, premium_plan, premium_source, premium_started_at, updated_at)
  VALUES (?, 0, NULL, NULL, NULL, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    is_premium = 0,
    premium_plan = NULL,
    premium_source = NULL,
    platform = NULL,
    premium_started_at = NULL,
    subscription_started_at = NULL,
    updated_at = CURRENT_TIMESTAMP
`);

function normalizePlatform(value) {
  const platform = String(value || 'web').trim().toLowerCase();
  return allowedPlatforms.has(platform) ? platform : 'web';
}

function getIyzipayClient() {
  const apiKey = process.env.IYZIPAY_API_KEY;
  const secretKey = process.env.IYZIPAY_SECRET_KEY;
  const uri = process.env.IYZIPAY_URI || 'https://sandbox-api.iyzipay.com';

  if (!apiKey || !secretKey) {
    return null;
  }

  return new Iyzipay({ apiKey, secretKey, uri });
}

function callIyzipay(method, payload) {
  return new Promise((resolve, reject) => {
    method(payload, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
}

function getCallbackUrl() {
  const explicitCallbackUrl = process.env.IYZICO_CALLBACK_URL;

  if (explicitCallbackUrl) {
    return explicitCallbackUrl;
  }

  const backendUrl = (process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, '');
  return `${backendUrl}/payment/callback`;
}

function makeConversationId(userId) {
  const safeUser = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'user';
  return `dop-${safeUser}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeBuyer(req, userId) {
  const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const buyerId = userId.slice(0, 64);

  return {
    id: buyerId,
    name: 'Daily',
    surname: 'User',
    identityNumber: '11111111111',
    email: `${buyerId.replace(/[^a-zA-Z0-9]/g, '') || 'user'}@daily-outfit.local`,
    gsmNumber: '+905350000000',
    registrationAddress: 'Istanbul',
    city: 'Istanbul',
    country: 'Turkey',
    zipCode: '34000',
    ip
  };
}

function makePaymentMetadata(userId, platform, plan) {
  return {
    buyerId: userId,
    platform,
    planId: plan.id,
    paymentSource: paymentSources[platform] || 'iyzico'
  };
}

function makeAddress() {
  return {
    contactName: 'Daily User',
    city: 'Istanbul',
    country: 'Turkey',
    address: 'Istanbul',
    zipCode: '34000'
  };
}

function sendPaymentReturn(res, status, token = '') {
  const url = new URL(getFrontendUrl());
  url.pathname = '/payment-success';
  url.searchParams.set('payment', status);

  if (token) {
    url.searchParams.set('token', token);
  }

  return res.redirect(url.toString());
}

router.get('/status', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const access = getAccess.get(userId);
  return res.json({
    isPremium: Boolean(access?.isPremium),
    premiumPlan: access?.premiumPlan || null,
    premiumSource: access?.premiumSource || null,
    platform: access?.platform || null,
    premiumStartedAt: access?.premiumStartedAt || null,
    subscriptionStartedAt: access?.subscriptionStartedAt || null
  });
});

router.post('/reset', (req, res) => {
  const canResetAccess = process.env.ALLOW_PAYMENT_RESET === 'true' && process.env.APP_ENVIRONMENT !== 'production';

  if (!canResetAccess) {
    return res.status(404).json({ message: 'Not found' });
  }

  const userId = requireUserId(req, res);
  if (!userId) return;

  resetAccess.run(userId);
  return res.json({ isPremium: false });
});

router.post('/initiate', initiatePaymentRateLimit, async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const iyzipay = getIyzipayClient();

  if (!iyzipay) {
    return res.status(500).json({
      message: 'iyzico sandbox credentials are missing. Set IYZIPAY_API_KEY and IYZIPAY_SECRET_KEY on the backend.'
    });
  }

  const conversationId = makeConversationId(userId);
  const platform = normalizePlatform(req.body?.platform);
  const selectedPlan = getPlanById(req.body?.planId);
  const paymentSource = paymentSources[platform] || 'iyzico';
  addBackendBreadcrumb(req, 'payment', 'initiate:start', { platform, paymentSource, planId: selectedPlan.id });

  if (platform === 'ios') {
    return res.status(400).json({
      message: 'iOS purchases must be completed with Apple In-App Purchase.'
    });
  }

  const locale = req.body?.locale === 'en' ? Iyzipay.LOCALE.EN : Iyzipay.LOCALE.TR;
  const callbackUrl = getCallbackUrl();
  const buyer = makeBuyer(req, userId);
  const address = makeAddress();
  const paymentMetadata = makePaymentMetadata(userId, platform, selectedPlan);

  const request = {
    locale,
    conversationId,
    price: selectedPlan.amount,
    paidPrice: selectedPlan.amount,
    currency: Iyzipay.CURRENCY.TRY,
    basketId: conversationId,
    paymentGroup: Iyzipay.PAYMENT_GROUP.SUBSCRIPTION,
    paymentSource: JSON.stringify(paymentMetadata),
    callbackUrl,
    enabledInstallments: [1],
    buyer,
    billingAddress: address,
    shippingAddress: address,
    basketItems: [
      {
        id: selectedPlan.id,
        name: selectedPlan.id === pricingConfig.plans.yearly.id ? 'Daily Outfit Planner Yearly Premium' : 'Daily Outfit Planner Monthly Premium',
        category1: 'Subscription',
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price: selectedPlan.amount
      }
    ]
  };

  try {
    const result = await callIyzipay(iyzipay.checkoutFormInitialize.create.bind(iyzipay.checkoutFormInitialize), request);

    if (result.status !== 'success' || !result.paymentPageUrl || !result.token) {
      return res.status(502).json({
        message: result.errorMessage || 'iyzico payment session could not be created.'
      });
    }

    insertPaymentSession.run({
      userId,
      platform,
      paymentSource,
      token: result.token,
      conversationId,
      plan: selectedPlan.id,
      amount: selectedPlan.amount,
      currency: pricingConfig.currency,
      status: 'initialized',
      paymentPageUrl: result.paymentPageUrl,
      rawResult: JSON.stringify({ result, metadata: paymentMetadata })
    });

    return res.json({
      paymentPageUrl: result.paymentPageUrl,
      token: result.token
    });
  } catch (error) {
    captureBackendError(error, req, {
      area: 'payment-initiate',
      platform,
      paymentSource
    });
    return res.status(502).json({
      message: error.message || 'iyzico payment session could not be created.'
    });
  }
});

async function handleCallback(req, res) {
  const token = String(req.body?.token || req.query?.token || '').trim();

  if (!token) {
    return sendPaymentReturn(res, 'failure');
  }

  const session = getPaymentSessionByToken.get(token);

  if (!session) {
    return sendPaymentReturn(res, 'failure', token);
  }

  const iyzipay = getIyzipayClient();

  if (!iyzipay) {
    return sendPaymentReturn(res, 'failure', token);
  }

  try {
    const result = await callIyzipay(iyzipay.checkoutForm.retrieve.bind(iyzipay.checkoutForm), {
      locale: Iyzipay.LOCALE.TR,
      conversationId: session.conversationId,
      token
    });
    const isSuccessfulPayment = result.status === 'success' && result.paymentStatus === 'SUCCESS';

    updatePaymentSession.run({
      token,
      status: isSuccessfulPayment ? 'paid' : 'failed',
      rawResult: JSON.stringify(result)
    });
    insertPaymentRecord.run({
      userId: session.userId,
      platform: session.platform || 'web',
      paymentSource: session.paymentSource || 'iyzico',
      token,
      conversationId: session.conversationId,
      plan: session.plan,
      amount: session.amount,
      currency: session.currency,
      status: isSuccessfulPayment ? 'paid' : 'failed',
      rawResult: JSON.stringify(result)
    });

    if (isSuccessfulPayment) {
      upsertPremiumAccess.run(session.userId, session.plan, session.paymentSource || 'iyzico', session.platform || 'web');
      return sendPaymentReturn(res, 'success', token);
    }

    return sendPaymentReturn(res, 'failure', token);
  } catch (error) {
    captureBackendError(error, req, {
      area: 'payment-callback',
      tokenPresent: Boolean(token),
      platform: session.platform || 'web',
      paymentSource: session.paymentSource || 'iyzico'
    });
    updatePaymentSession.run({
      token,
      status: 'failed',
      rawResult: JSON.stringify({ message: error.message })
    });
    insertPaymentRecord.run({
      userId: session.userId,
      platform: session.platform || 'web',
      paymentSource: session.paymentSource || 'iyzico',
      token,
      conversationId: session.conversationId,
      plan: session.plan,
      amount: session.amount,
      currency: session.currency,
      status: 'failed',
      rawResult: JSON.stringify({ message: error.message })
    });
    return sendPaymentReturn(res, 'failure', token);
  }
}

router.post('/callback', handleCallback);
router.get('/callback', handleCallback);

router.post('/apple/verify', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const verification = await verifyApplePurchase(req.body);
    const verificationSummary = {
      environment: verification.environment,
      productId: verification.productIdentifier,
      transactionId: verification.transactionId,
      originalTransactionId: verification.metadata?.originalTransactionId || null,
      expiresDate: verification.expiresAt,
      verificationMode: verification.verificationMode,
      isPremiumActive: true
    };

    insertPaymentRecord.run({
      userId,
      platform: 'ios',
      paymentSource: 'iap',
      token: verification.transactionId,
      conversationId: `apple-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: verification.plan.id,
      amount: verification.plan.amount,
      currency: pricingConfig.currency,
      status: 'paid',
      rawResult: JSON.stringify({
        transactionId: verification.transactionId,
        productIdentifier: verification.productIdentifier,
        environment: verification.environment,
        verificationMode: verification.verificationMode,
        expiresAt: verification.expiresAt,
        verified: true,
        metadata: verification.metadata
      })
    });

    upsertPremiumAccess.run(userId, verification.plan.id, 'iap', 'ios');
    console.info('[payment/apple/verify] success', {
      userId,
      plan: verification.plan.id,
      ...verificationSummary
    });

    return res.json({
      isPremium: true,
      isPremiumActive: true,
      premiumPlan: verification.plan.id,
      premiumSource: 'iap',
      platform: 'ios',
      verifiedBy: verification.verificationMode,
      verification: verificationSummary
    });
  } catch (error) {
    const selectedPlan = getPlanById(req.body?.planId);
    const status = error instanceof AppleIapVerificationError ? error.status : 500;

    insertPaymentRecord.run({
      userId,
      platform: 'ios',
      paymentSource: 'iap',
      token: String(req.body?.transactionId || '').trim() || null,
      conversationId: `apple-failed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: selectedPlan.id,
      amount: selectedPlan.amount,
      currency: pricingConfig.currency,
      status: 'failed',
      rawResult: JSON.stringify({
        transactionId: req.body?.transactionId || null,
        productIdentifier: req.body?.productIdentifier || null,
        environment: req.body?.environment || null,
        hasReceipt: Boolean(req.body?.receipt),
        hasJwsRepresentation: Boolean(req.body?.jwsRepresentation),
        code: error.code || 'apple_verification_failed',
        message: error.message,
        details: error.details || {}
      })
    });

    captureBackendError(error, req, {
      area: 'apple-iap-verify',
      status,
      code: error.code || 'apple_verification_failed',
      hasReceipt: Boolean(req.body?.receipt),
      hasJwsRepresentation: Boolean(req.body?.jwsRepresentation),
      hasTransactionId: Boolean(req.body?.transactionId),
      productIdentifier: req.body?.productIdentifier || null
    });

    return res.status(status).json({
      message: error.publicMessage || 'messages.applePurchaseFailed',
      code: error.code || 'apple_verification_failed'
    });
  }
});

export default router;
