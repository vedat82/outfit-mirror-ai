export const defaultPaymentTimeoutMs = 20000;

export function createPaymentTimeoutError(messageKey = 'messages.applePurchaseTimeout') {
  const error = new Error(messageKey);
  error.code = 'PAYMENT_TIMEOUT';
  return error;
}

export function withPaymentTimeout(operation, timeoutMs = defaultPaymentTimeoutMs, messageKey = 'messages.applePurchaseTimeout') {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(createPaymentTimeoutError(messageKey)), timeoutMs);
  });

  const operationPromise = typeof operation === 'function' ? Promise.resolve().then(operation) : Promise.resolve(operation);

  return Promise.race([operationPromise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function isCurrentPaymentRequest(currentRequestId, requestId) {
  return currentRequestId === requestId;
}

export function isXcodeStoreKitEnvironment(environment) {
  return String(environment || '').toLowerCase().includes('xcode');
}

export function canUsePaymentTestHelpers(env = import.meta.env) {
  return Boolean(env.DEV && String(env.VITE_IAP_DEBUG || '').toLowerCase() === 'true');
}
