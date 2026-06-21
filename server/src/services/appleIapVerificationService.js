import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { getPlanById } from '../config/pricing.js';

const defaultBundleId = 'com.vedat.outfitmirrorai';
const productionEnvironments = new Set(['production']);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultAppleCertDir = path.resolve(__dirname, '../../certs/apple');

export class AppleIapVerificationError extends Error {
  constructor(message, { status = 400, code = 'apple_verification_failed', publicMessage = 'messages.applePurchaseFailed', details = {} } = {}) {
    super(message);
    this.name = 'AppleIapVerificationError';
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.details = details;
  }
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeBase64UrlJson(value, label) {
  try {
    return JSON.parse(decodeBase64Url(value));
  } catch {
    throw new AppleIapVerificationError(`Invalid Apple transaction ${label}.`, {
      status: 400,
      code: 'invalid_apple_jws',
      details: { label }
    });
  }
}

export function parseAppleTransactionJws(jwsRepresentation) {
  const parts = String(jwsRepresentation || '').split('.');

  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new AppleIapVerificationError('Apple transaction JWS is missing or malformed.', {
      status: 400,
      code: 'invalid_apple_jws'
    });
  }

  return {
    header: decodeBase64UrlJson(parts[0], 'header'),
    payload: decodeBase64UrlJson(parts[1], 'payload')
  };
}

export function normalizeAppleEnvironment(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized.includes('xcode')) return 'xcode';
  if (normalized.includes('localtesting') || normalized.includes('local_testing') || normalized.includes('local-testing')) return 'local_testing';
  if (normalized.includes('sandbox')) return 'sandbox';
  if (normalized.includes('production')) return 'production';

  return 'unknown';
}

function getAppEnvironment(env) {
  return String(env.APP_ENVIRONMENT || env.NODE_ENV || 'development').trim().toLowerCase();
}

export function getAppleVerificationConfig(env = process.env) {
  const appEnvironment = getAppEnvironment(env);
  const bundleId = String(env.APPLE_BUNDLE_ID || env.IOS_BUNDLE_ID || defaultBundleId).trim();
  const allowXcodeLocal =
    !productionEnvironments.has(appEnvironment) &&
    String(env.ALLOW_XCODE_STOREKIT_VERIFICATION || 'true').toLowerCase() !== 'false';

  return {
    appEnvironment,
    bundleId,
    allowXcodeLocal,
    issuerId: String(env.APPLE_ISSUER_ID || '').trim(),
    keyId: String(env.APPLE_KEY_ID || '').trim(),
    privateKey: normalizeApplePrivateKey(env.APPLE_PRIVATE_KEY),
    appAppleId: String(env.APPLE_APP_APPLE_ID || '').trim(),
    appleEnvironment: normalizeAppleEnvironment(env.APPLE_IAP_ENVIRONMENT),
    rootCaPaths: parseRootCaPaths(env.APPLE_ROOT_CA_PATHS)
  };
}

function hasAppleServerApiConfig(config) {
  return Boolean(config.issuerId && config.keyId && config.privateKey && config.appAppleId && config.bundleId);
}

export function normalizeApplePrivateKey(value) {
  const normalized = String(value || '').trim().replace(/\\n/g, '\n');

  if (!normalized || normalized.includes('\n')) {
    return normalized;
  }

  const match = normalized.match(/-----BEGIN PRIVATE KEY-----\s*(.*?)\s*-----END PRIVATE KEY-----/);

  if (!match) {
    return normalized;
  }

  const keyBody = match[1].replace(/\s+/g, '');
  const wrappedBody = keyBody.match(/.{1,64}/g)?.join('\n') || keyBody;

  return `-----BEGIN PRIVATE KEY-----\n${wrappedBody}\n-----END PRIVATE KEY-----`;
}

function parseRootCaPaths(value) {
  const explicitPaths = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (explicitPaths.length > 0) {
    return explicitPaths;
  }

  if (!fs.existsSync(defaultAppleCertDir)) {
    return [];
  }

  return fs
    .readdirSync(defaultAppleCertDir)
    .filter((fileName) => /\.(cer|crt|pem|der)$/i.test(fileName))
    .map((fileName) => path.join(defaultAppleCertDir, fileName));
}

function loadRootCertificates(rootCaPaths = []) {
  return rootCaPaths
    .map((certPath) => {
      try {
        return fs.readFileSync(path.resolve(certPath));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getPayloadDateMs(value) {
  const numberValue = Number(value);

  if (Number.isFinite(numberValue) && numberValue > 0) {
    return numberValue;
  }

  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function assertPayloadMatchesPurchase({ payload, transactionId, productIdentifier, selectedPlan, config, now }) {
  if (payload.bundleId && payload.bundleId !== config.bundleId) {
    throw new AppleIapVerificationError('Apple transaction bundle does not match this app.', {
      status: 400,
      code: 'bundle_mismatch',
      details: { expectedBundleId: config.bundleId, receivedBundleId: payload.bundleId }
    });
  }

  if (payload.productId && payload.productId !== selectedPlan.productIds.ios) {
    throw new AppleIapVerificationError('Apple transaction product does not match selected plan.', {
      status: 400,
      code: 'product_mismatch',
      details: { expectedProductId: selectedPlan.productIds.ios, receivedProductId: payload.productId }
    });
  }

  if (productIdentifier !== selectedPlan.productIds.ios) {
    throw new AppleIapVerificationError('Apple purchase product does not match selected plan.', {
      status: 400,
      code: 'product_mismatch',
      details: { expectedProductId: selectedPlan.productIds.ios, receivedProductId: productIdentifier }
    });
  }

  if (payload.transactionId && transactionId && String(payload.transactionId) !== transactionId) {
    throw new AppleIapVerificationError('Apple transaction id does not match request.', {
      status: 400,
      code: 'transaction_mismatch'
    });
  }

  const expiresAtMs = getPayloadDateMs(payload.expiresDate || payload.expirationDate);

  if (expiresAtMs && expiresAtMs <= now.getTime()) {
    throw new AppleIapVerificationError('Apple subscription is expired.', {
      status: 402,
      code: 'subscription_expired',
      publicMessage: 'messages.appleSubscriptionExpired',
      details: { expiresAt: new Date(expiresAtMs).toISOString() }
    });
  }

  if (payload.revocationDate || payload.revocationReason) {
    throw new AppleIapVerificationError('Apple subscription was revoked.', {
      status: 402,
      code: 'subscription_revoked',
      publicMessage: 'messages.appleSubscriptionExpired'
    });
  }
}

function getVerificationEnvironment({ requestEnvironment, payloadEnvironment }) {
  const normalizedPayloadEnvironment = normalizeAppleEnvironment(payloadEnvironment);
  const normalizedRequestEnvironment = normalizeAppleEnvironment(requestEnvironment);

  return normalizedPayloadEnvironment !== 'unknown' ? normalizedPayloadEnvironment : normalizedRequestEnvironment;
}

function getAppleLibraryEnvironment(value) {
  const normalized = normalizeAppleEnvironment(value);

  if (normalized === 'production') return Environment.PRODUCTION;
  if (normalized === 'xcode') return Environment.XCODE;
  if (normalized === 'local_testing') return Environment.LOCAL_TESTING;

  return Environment.SANDBOX;
}

function getServerVerificationEnvironment({ requestEnvironment, payloadEnvironment, config }) {
  const normalized = getVerificationEnvironment({ requestEnvironment, payloadEnvironment });

  if (normalized !== 'unknown') {
    return normalized;
  }

  if (config.appleEnvironment !== 'unknown') {
    return config.appleEnvironment;
  }

  return config.appEnvironment === 'production' ? 'production' : 'sandbox';
}

function createAppleApiClient(config, verificationEnvironment) {
  return new AppStoreServerAPIClient(
    config.privateKey,
    config.keyId,
    config.issuerId,
    config.bundleId,
    getAppleLibraryEnvironment(verificationEnvironment)
  );
}

async function decodeAppleSignedTransaction(signedTransactionInfo, config, verificationEnvironment) {
  const rootCertificates = loadRootCertificates(config.rootCaPaths);

  if (rootCertificates.length === 0) {
    return {
      payload: parseAppleTransactionJws(signedTransactionInfo).payload,
      verificationMode: 'app-store-server-api-unverified-jws'
    };
  }

  const appAppleId = verificationEnvironment === 'production' ? Number(config.appAppleId) : undefined;
  const verifier = new SignedDataVerifier(
    rootCertificates,
    true,
    getAppleLibraryEnvironment(verificationEnvironment),
    config.bundleId,
    appAppleId
  );

  const payload = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);

  return {
    payload,
    verificationMode: 'app-store-server-api-signed-jws'
  };
}

function getAppleApiErrorCode(error) {
  const message = `${error?.message || ''} ${error?.errorCode || ''} ${error?.apiError || ''}`.toLowerCase();

  if (message.includes('401') || message.includes('unauthorized') || message.includes('jwt')) return 'apple_auth_failed';
  if (message.includes('not found') || message.includes('transactionidnotfound')) return 'apple_transaction_not_found';
  if (message.includes('timeout') || message.includes('network')) return 'apple_network_failed';

  return 'apple_server_api_failed';
}

async function verifyWithAppleServerApi({ transactionId, productIdentifier, selectedPlan, environment, client, config, now }) {
  const response = await client.getTransactionInfo(transactionId);
  const signedTransactionInfo = response?.signedTransactionInfo;

  if (!signedTransactionInfo) {
    throw new AppleIapVerificationError('Apple transaction response did not include signed transaction info.', {
      status: 502,
      code: 'apple_signed_transaction_missing',
      publicMessage: 'messages.appleVerificationUnavailable'
    });
  }

  const serverPayloadEnvironment = parseAppleTransactionJws(signedTransactionInfo).payload?.environment;
  const verificationEnvironment = getServerVerificationEnvironment({
    requestEnvironment: environment,
    payloadEnvironment: serverPayloadEnvironment,
    config
  });
  const { payload, verificationMode } = await decodeAppleSignedTransaction(signedTransactionInfo, config, verificationEnvironment);

  assertPayloadMatchesPurchase({
    payload,
    transactionId,
    productIdentifier,
    selectedPlan,
    config,
    now
  });

  return {
    payload,
    verificationEnvironment,
    verificationMode
  };
}

export async function verifyApplePurchase({
  receipt = '',
  jwsRepresentation = '',
  transactionId = '',
  productIdentifier = '',
  environment = '',
  planId = ''
} = {}, { env = process.env, now = new Date(), appleClient = null } = {}) {
  const selectedPlan = getPlanById(planId);
  const safeTransactionId = String(transactionId || '').trim();
  const safeProductIdentifier = String(productIdentifier || '').trim();
  const safeReceipt = String(receipt || '').trim();
  const safeJwsRepresentation = String(jwsRepresentation || '').trim();

  if (!safeTransactionId || !safeProductIdentifier) {
    throw new AppleIapVerificationError('Apple purchase transaction data is required.', {
      status: 400,
      code: 'missing_transaction_data'
    });
  }

  if (safeProductIdentifier !== selectedPlan.productIds.ios) {
    throw new AppleIapVerificationError('Apple purchase product does not match selected plan.', {
      status: 400,
      code: 'product_mismatch',
      details: { expectedProductId: selectedPlan.productIds.ios, receivedProductId: safeProductIdentifier }
    });
  }

  const parsedJws = safeJwsRepresentation ? parseAppleTransactionJws(safeJwsRepresentation) : null;
  const payload = parsedJws?.payload || {};
  const verificationEnvironment = getVerificationEnvironment({
    requestEnvironment: environment,
    payloadEnvironment: payload.environment
  });
  const config = getAppleVerificationConfig(env);

  if (verificationEnvironment === 'xcode') {
    if (!config.allowXcodeLocal) {
      throw new AppleIapVerificationError('Xcode StoreKit transactions are not accepted in this environment.', {
        status: 403,
        code: 'xcode_verification_disabled'
      });
    }

    if (!parsedJws) {
      throw new AppleIapVerificationError('Xcode StoreKit transaction JWS is required.', {
        status: 400,
        code: 'missing_apple_jws'
      });
    }

    assertPayloadMatchesPurchase({
      payload,
      transactionId: safeTransactionId,
      productIdentifier: safeProductIdentifier,
      selectedPlan,
      config,
      now
    });

    return {
      verified: true,
      verificationMode: 'xcode-local-storekit',
      environment: verificationEnvironment,
      plan: selectedPlan,
      transactionId: safeTransactionId,
      productIdentifier: safeProductIdentifier,
      expiresAt: payload.expiresDate ? new Date(getPayloadDateMs(payload.expiresDate)).toISOString() : null,
      metadata: {
        hasReceipt: Boolean(safeReceipt),
        hasJwsRepresentation: true,
        appleEnvironment: payload.environment || environment || null,
        appAccountToken: payload.appAccountToken || null,
        originalTransactionId: payload.originalTransactionId || null,
        subscriptionGroupIdentifier: payload.subscriptionGroupIdentifier || null
      }
    };
  }

  if (!safeReceipt && !safeJwsRepresentation) {
    throw new AppleIapVerificationError('Apple receipt or signed transaction is required.', {
      status: 400,
      code: 'missing_apple_receipt'
    });
  }

  if (!hasAppleServerApiConfig(config)) {
    throw new AppleIapVerificationError('Apple receipt verification is not configured on the backend.', {
      status: 501,
      code: 'apple_verification_not_configured',
      publicMessage: 'messages.appleVerificationUnavailable'
    });
  }

  try {
    const serverVerificationEnvironment = getServerVerificationEnvironment({
      requestEnvironment: environment,
      payloadEnvironment: payload.environment,
      config
    });
    const client = appleClient || createAppleApiClient(config, serverVerificationEnvironment);
    const serverVerification = await verifyWithAppleServerApi({
      transactionId: safeTransactionId,
      productIdentifier: safeProductIdentifier,
      selectedPlan,
      environment: serverVerificationEnvironment,
      client,
      config,
      now
    });

    return {
      verified: true,
      verificationMode: serverVerification.verificationMode,
      environment: serverVerification.verificationEnvironment,
      plan: selectedPlan,
      transactionId: safeTransactionId,
      productIdentifier: safeProductIdentifier,
      expiresAt: serverVerification.payload.expiresDate ? new Date(getPayloadDateMs(serverVerification.payload.expiresDate)).toISOString() : null,
      metadata: {
        hasReceipt: Boolean(safeReceipt),
        hasJwsRepresentation: Boolean(safeJwsRepresentation),
        appleEnvironment: serverVerification.payload.environment || serverVerification.verificationEnvironment,
        appAccountToken: serverVerification.payload.appAccountToken || null,
        originalTransactionId: serverVerification.payload.originalTransactionId || null,
        subscriptionGroupIdentifier: serverVerification.payload.subscriptionGroupIdentifier || null
      }
    };
  } catch (error) {
    if (error instanceof AppleIapVerificationError) {
      throw error;
    }

    throw new AppleIapVerificationError('Apple server verification failed.', {
      status: 502,
      code: getAppleApiErrorCode(error),
      publicMessage: 'messages.appleVerificationUnavailable',
      details: {
        message: error.message,
        errorCode: error.errorCode || error.apiError || null,
        transactionId: safeTransactionId,
        productIdentifier: safeProductIdentifier
      }
    });
  }
}
