import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppleIapVerificationError,
  normalizeAppleEnvironment,
  normalizeApplePrivateKey,
  parseAppleTransactionJws,
  verifyApplePurchase
} from './appleIapVerificationService.js';

const monthlyProductId = 'com.vedat.outfitmirrorai.premium.monthly';
const yearlyProductId = 'com.vedat.outfitmirrorai.premium.yearly';

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeJws(payload) {
  return [
    base64UrlJson({ alg: 'ES256', kid: 'Apple_Xcode_Key', typ: 'JWT' }),
    base64UrlJson(payload),
    'local-storekit-signature'
  ].join('.');
}

function makeXcodePayload(overrides = {}) {
  return {
    bundleId: 'com.vedat.outfitmirrorai',
    environment: 'Xcode',
    expiresDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
    originalTransactionId: '0',
    productId: monthlyProductId,
    subscriptionGroupIdentifier: '22129174',
    transactionId: '0',
    type: 'Auto-Renewable Subscription',
    ...overrides
  };
}

function makeSandboxPayload(overrides = {}) {
  return makeXcodePayload({
    environment: 'Sandbox',
    transactionId: 'sandbox-transaction-1',
    originalTransactionId: 'sandbox-original-1',
    ...overrides
  });
}

function makeConfiguredEnv(overrides = {}) {
  return {
    APP_ENVIRONMENT: 'production',
    APPLE_BUNDLE_ID: 'com.vedat.outfitmirrorai',
    APPLE_APP_APPLE_ID: '1234567890',
    APPLE_ISSUER_ID: 'issuer-id',
    APPLE_KEY_ID: 'key-id',
    APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
    ...overrides
  };
}

test('normalizes Apple environments', () => {
  assert.equal(normalizeAppleEnvironment('Xcode'), 'xcode');
  assert.equal(normalizeAppleEnvironment('Sandbox'), 'sandbox');
  assert.equal(normalizeAppleEnvironment('Production'), 'production');
  assert.equal(normalizeAppleEnvironment(''), 'unknown');
});

test('parses StoreKit transaction JWS payload', () => {
  const jws = makeJws(makeXcodePayload());
  const parsed = parseAppleTransactionJws(jws);

  assert.equal(parsed.header.kid, 'Apple_Xcode_Key');
  assert.equal(parsed.payload.productId, monthlyProductId);
});

test('normalizes single-line p8 private key env value into PEM format', () => {
  const normalized = normalizeApplePrivateKey('-----BEGIN PRIVATE KEY----- abcdefghijklmnopqrstuvwxyz -----END PRIVATE KEY-----');

  assert.equal(normalized.startsWith('-----BEGIN PRIVATE KEY-----\n'), true);
  assert.equal(normalized.endsWith('\n-----END PRIVATE KEY-----'), true);
  assert.equal(normalized.includes('abcdefghijklmnopqrstuvwxyz'), true);
});

test('accepts active Xcode StoreKit subscription outside production', async () => {
  const result = await verifyApplePurchase(
    {
      jwsRepresentation: makeJws(makeXcodePayload()),
      transactionId: '0',
      productIdentifier: monthlyProductId,
      environment: 'Xcode',
      planId: 'premium-monthly'
    },
    { env: { APP_ENVIRONMENT: 'development' } }
  );

  assert.equal(result.verified, true);
  assert.equal(result.verificationMode, 'xcode-local-storekit');
  assert.equal(result.plan.id, 'premium-monthly');
  assert.equal(result.productIdentifier, monthlyProductId);
});

test('rejects Xcode StoreKit transactions in production', async () => {
  await assert.rejects(
    verifyApplePurchase(
      {
        jwsRepresentation: makeJws(makeXcodePayload()),
        transactionId: '0',
        productIdentifier: monthlyProductId,
        environment: 'Xcode',
        planId: 'premium-monthly'
      },
      { env: { APP_ENVIRONMENT: 'production' } }
    ),
    (error) => {
      assert.equal(error instanceof AppleIapVerificationError, true);
      assert.equal(error.code, 'xcode_verification_disabled');
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test('rejects product mismatch between plan and transaction', async () => {
  await assert.rejects(
    verifyApplePurchase(
      {
        jwsRepresentation: makeJws(makeXcodePayload({ productId: yearlyProductId })),
        transactionId: '0',
        productIdentifier: yearlyProductId,
        environment: 'Xcode',
        planId: 'premium-monthly'
      },
      { env: { APP_ENVIRONMENT: 'development' } }
    ),
    (error) => {
      assert.equal(error.code, 'product_mismatch');
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test('rejects expired StoreKit subscription', async () => {
  await assert.rejects(
    verifyApplePurchase(
      {
        jwsRepresentation: makeJws(makeXcodePayload({ expiresDate: Date.now() - 1000 })),
        transactionId: '0',
        productIdentifier: monthlyProductId,
        environment: 'Xcode',
        planId: 'premium-monthly'
      },
      { env: { APP_ENVIRONMENT: 'development' } }
    ),
    (error) => {
      assert.equal(error.code, 'subscription_expired');
      assert.equal(error.status, 402);
      return true;
    }
  );
});

test('does not grant sandbox or production Apple purchases without server verification config', async () => {
  await assert.rejects(
    verifyApplePurchase(
      {
        jwsRepresentation: makeJws(makeXcodePayload({ environment: 'Sandbox' })),
        transactionId: '0',
        productIdentifier: monthlyProductId,
        environment: 'Sandbox',
        planId: 'premium-monthly'
      },
      { env: { APP_ENVIRONMENT: 'production', APPLE_BUNDLE_ID: 'com.vedat.outfitmirrorai' } }
    ),
    (error) => {
      assert.equal(error.code, 'apple_verification_not_configured');
      assert.equal(error.status, 501);
      return true;
    }
  );
});

test('verifies sandbox purchase with Apple server API transaction response', async () => {
  const signedTransactionInfo = makeJws(makeSandboxPayload());
  const appleClient = {
    async getTransactionInfo(transactionId) {
      assert.equal(transactionId, 'sandbox-transaction-1');
      return { signedTransactionInfo };
    }
  };

  const result = await verifyApplePurchase(
    {
      jwsRepresentation: signedTransactionInfo,
      transactionId: 'sandbox-transaction-1',
      productIdentifier: monthlyProductId,
      environment: 'Sandbox',
      planId: 'premium-monthly'
    },
    {
      env: makeConfiguredEnv(),
      appleClient
    }
  );

  assert.equal(result.verified, true);
  assert.equal(result.verificationMode, 'app-store-server-api-unverified-jws');
  assert.equal(result.environment, 'sandbox');
  assert.equal(result.plan.id, 'premium-monthly');
  assert.equal(result.metadata.originalTransactionId, 'sandbox-original-1');
});

test('uses APPLE_IAP_ENVIRONMENT when transaction environment is missing', async () => {
  const signedTransactionInfo = makeJws(makeSandboxPayload({ environment: undefined }));
  const appleClient = {
    async getTransactionInfo() {
      return { signedTransactionInfo };
    }
  };

  const result = await verifyApplePurchase(
    {
      jwsRepresentation: signedTransactionInfo,
      transactionId: 'sandbox-transaction-1',
      productIdentifier: monthlyProductId,
      planId: 'premium-monthly'
    },
    {
      env: makeConfiguredEnv({ APPLE_IAP_ENVIRONMENT: 'Sandbox' }),
      appleClient
    }
  );

  assert.equal(result.verified, true);
  assert.equal(result.environment, 'sandbox');
});

test('defaults missing transaction environment to production when app environment is production', async () => {
  const signedTransactionInfo = makeJws(makeSandboxPayload({ environment: undefined }));
  const appleClient = {
    async getTransactionInfo() {
      return { signedTransactionInfo };
    }
  };

  const result = await verifyApplePurchase(
    {
      jwsRepresentation: signedTransactionInfo,
      transactionId: 'sandbox-transaction-1',
      productIdentifier: monthlyProductId,
      planId: 'premium-monthly'
    },
    {
      env: makeConfiguredEnv({ APPLE_IAP_ENVIRONMENT: '' }),
      appleClient
    }
  );

  assert.equal(result.verified, true);
  assert.equal(result.environment, 'production');
});

test('maps Apple server API failures to a stable safe error code', async () => {
  const signedTransactionInfo = makeJws(makeSandboxPayload());
  const appleClient = {
    async getTransactionInfo() {
      const error = new Error('Transaction id not found.');
      error.errorCode = 'TRANSACTION_ID_NOT_FOUND';
      throw error;
    }
  };

  await assert.rejects(
    verifyApplePurchase(
      {
        jwsRepresentation: signedTransactionInfo,
        transactionId: 'sandbox-transaction-1',
        productIdentifier: monthlyProductId,
        environment: 'Sandbox',
        planId: 'premium-monthly'
      },
      {
        env: makeConfiguredEnv(),
        appleClient
      }
    ),
    (error) => {
      assert.equal(error.code, 'apple_transaction_not_found');
      assert.equal(error.status, 502);
      assert.equal(error.publicMessage, 'messages.appleVerificationUnavailable');
      return true;
    }
  );
});
