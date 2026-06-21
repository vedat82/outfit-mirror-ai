import assert from 'node:assert/strict';
import test from 'node:test';
import { canUsePaymentTestHelpers, createPaymentTimeoutError, defaultPaymentTimeoutMs, isCurrentPaymentRequest, isXcodeStoreKitEnvironment, withPaymentTimeout } from './paymentFlow.js';

test('default payment timeout is short enough to avoid stuck loading states', () => {
  assert.equal(defaultPaymentTimeoutMs, 20000);
});

test('withPaymentTimeout resolves when operation finishes before timeout', async () => {
  const result = await withPaymentTimeout(Promise.resolve('ok'), 50);
  assert.equal(result, 'ok');
});

test('withPaymentTimeout starts lazy operations and resolves their result', async () => {
  let started = false;
  const result = await withPaymentTimeout(() => {
    started = true;
    return Promise.resolve('lazy-ok');
  }, 50);

  assert.equal(started, true);
  assert.equal(result, 'lazy-ok');
});

test('withPaymentTimeout rejects with stable message key when operation hangs', async () => {
  await assert.rejects(
    () => withPaymentTimeout(new Promise(() => {}), 5),
    (error) => {
      assert.equal(error.message, 'messages.applePurchaseTimeout');
      assert.equal(error.code, 'PAYMENT_TIMEOUT');
      return true;
    }
  );
});

test('createPaymentTimeoutError supports custom message keys', () => {
  const error = createPaymentTimeoutError('messages.customTimeout');
  assert.equal(error.message, 'messages.customTimeout');
  assert.equal(error.code, 'PAYMENT_TIMEOUT');
});

test('isCurrentPaymentRequest rejects stale payment callbacks', () => {
  assert.equal(isCurrentPaymentRequest(2, 2), true);
  assert.equal(isCurrentPaymentRequest(3, 2), false);
});

test('isXcodeStoreKitEnvironment detects local StoreKit transactions', () => {
  assert.equal(isXcodeStoreKitEnvironment('Xcode'), true);
  assert.equal(isXcodeStoreKitEnvironment('xcode-local'), true);
  assert.equal(isXcodeStoreKitEnvironment('Sandbox'), false);
  assert.equal(isXcodeStoreKitEnvironment('Production'), false);
});

test('payment test helpers require local dev and explicit debug flag', () => {
  assert.equal(canUsePaymentTestHelpers({ DEV: true, VITE_IAP_DEBUG: 'true' }), true);
  assert.equal(canUsePaymentTestHelpers({ DEV: true, VITE_IAP_DEBUG: 'false' }), false);
  assert.equal(canUsePaymentTestHelpers({ DEV: false, VITE_IAP_DEBUG: 'true' }), false);
});
