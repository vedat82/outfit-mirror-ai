import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { pricingConfig, getPlanById } from '../config/pricing.js';
import { addMonitoringBreadcrumb, captureAppError } from '../monitoring/sentry.js';
import { getLocalUserId } from './userIdentity.js';
import { canUsePaymentTestHelpers } from '../utils/paymentFlow.js';
import { canUseAppleSubscriptions, detectPaymentPlatform, isNativeApp } from '../utils/platform.js';
import { resolveAppleRestore } from '../utils/appleRestore.js';

const productIdToPlanId = {
  [pricingConfig.plans.monthly.productIds.ios]: pricingConfig.plans.monthly.id,
  [pricingConfig.plans.yearly.productIds.ios]: pricingConfig.plans.yearly.id
};

function getAppleProductIds() {
  return Object.values(pricingConfig.plans).map((plan) => plan.productIds.ios);
}

function logApplePurchaseDebug(message, data = {}) {
  if (!canUsePaymentTestHelpers()) {
    return;
  }

  console.info(`[apple-iap] ${message}`, {
    ...data,
    productIds: getAppleProductIds()
  });
}

function logApplePurchaseFlow(message, data = {}) {
  console.info(`[apple-iap] ${message}`, {
    platform: detectPaymentPlatform(),
    isNative: Boolean(isNativeApp()),
    canUseAppleBilling: Boolean(canUseAppleSubscriptions()),
    ...data,
    productIds: getAppleProductIds()
  });
}

function getSafeErrorDetails(error) {
  return {
    name: error?.name,
    code: error?.code,
    message: error?.message,
    stack: import.meta.env.DEV ? error?.stack : undefined
  };
}

function getAppAccountToken() {
  const userId = getLocalUserId();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ? userId
    : undefined;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeProduct(product) {
  const planId = productIdToPlanId[product.identifier];
  const plan = getPlanById(planId);

  return {
    planId: plan.id,
    productId: product.identifier,
    title: product.title,
    description: product.description,
    price: product.price,
    priceString: product.priceString,
    currencyCode: product.currencyCode,
    subscriptionPeriod: product.subscriptionPeriod,
    introductoryPrice: product.introductoryPrice,
    rawProduct: product
  };
}

export function isAppleSubscriptionProduct(productId) {
  return Boolean(productIdToPlanId[productId]);
}

export function getPlanIdFromAppleProductId(productId) {
  return productIdToPlanId[productId] || pricingConfig.plans.monthly.id;
}

export function isApplePurchaseCancelled(error) {
  const message = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  return message.includes('cancel');
}

export function isAppleAlreadyPurchased(error) {
  const message = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  return (
    message.includes('already') ||
    message.includes('owned') ||
    message.includes('duplicate') ||
    message.includes('currently subscribed') ||
    message.includes('subscribed to this') ||
    message.includes('active subscription')
  );
}

export function isAppleRestoreEmpty(error) {
  return error?.message === 'messages.appleRestoreEmpty';
}

export function isActiveAppleSubscription(transaction) {
  if (!transaction || !isAppleSubscriptionProduct(transaction.productIdentifier)) {
    return false;
  }

  if (transaction.isActive === true) {
    return true;
  }

  return Boolean(transaction.expirationDate && new Date(transaction.expirationDate).getTime() > Date.now());
}

export async function loadAppleSubscriptionProducts() {
  logApplePurchaseFlow('product load started');
  addMonitoringBreadcrumb('payment', 'apple-products:start', {
    productIds: getAppleProductIds()
  });

  try {
    logApplePurchaseDebug('checking billing support');
    const support = await NativePurchases.isBillingSupported();

    logApplePurchaseDebug('billing support result', support);
    logApplePurchaseFlow('billing support checked', {
      isBillingSupported: support.isBillingSupported
    });

    if (!support.isBillingSupported) {
      throw new Error('messages.appleBillingUnavailable');
    }

    logApplePurchaseDebug('loading products');
    const products = await loadProductsWithRetry();

    logApplePurchaseDebug('products loaded', {
      count: products.length,
      identifiers: products.map((product) => product.identifier)
    });
    logApplePurchaseFlow('product load response received', {
      count: products.length,
      identifiers: products.map((product) => product.identifier)
    });

    const normalizedProducts = products
      .map(normalizeProduct)
      .filter((product) => productIdToPlanId[product.productId]);

    if (normalizedProducts.length === 0) {
      const error = new Error('messages.appleProductsUnavailable');
      error.products = products;
      error.code = 'NO_MATCHING_PRODUCTS';
      throw error;
    }

    addMonitoringBreadcrumb('payment', 'apple-products:success', {
      count: normalizedProducts.length
    });
    logApplePurchaseFlow('product load success', {
      count: normalizedProducts.length,
      identifiers: normalizedProducts.map((product) => product.productId),
      prices: normalizedProducts.map((product) => ({
        productId: product.productId,
        priceString: product.priceString,
        currencyCode: product.currencyCode
      }))
    });

    return normalizedProducts;
  } catch (error) {
    logApplePurchaseDebug('product loading failed', {
      name: error.name,
      message: error.message,
      code: error.code,
      products: error.products
    });
    logApplePurchaseFlow('product load failed', {
      ...getSafeErrorDetails(error),
      returnedIdentifiers: error.products?.map?.((product) => product.identifier) || []
    });
    captureAppError(error, {
      area: 'apple-products',
      productIds: getAppleProductIds()
    });
    throw error.message?.startsWith('messages.') ? error : new Error('messages.appleProductsUnavailable');
  }
}

async function loadProductsWithRetry() {
  const productIdentifiers = getAppleProductIds();
  const retryDelays = [0, 450, 1000];

  for (const [attemptIndex, delay] of retryDelays.entries()) {
    if (delay > 0) {
      await wait(delay);
    }

    const { products } = await NativePurchases.getProducts({
      productIdentifiers,
      productType: PURCHASE_TYPE.SUBS
    });

    logApplePurchaseFlow('product load attempt finished', {
      attempt: attemptIndex + 1,
      count: products.length,
      identifiers: products.map((product) => product.identifier)
    });
    logApplePurchaseDebug('product load attempt finished', {
      attempt: attemptIndex + 1,
      count: products.length,
      identifiers: products.map((product) => product.identifier)
    });

    if (products.length > 0) {
      return products;
    }
  }

  const individualProducts = [];

  for (const productIdentifier of productIdentifiers) {
    try {
      logApplePurchaseFlow('single product fallback started', {
        productIdentifier
      });
      const { product } = await NativePurchases.getProduct({
        productIdentifier,
        productType: PURCHASE_TYPE.SUBS
      });

      if (product) {
        individualProducts.push(product);
        logApplePurchaseFlow('single product fallback success', {
          productIdentifier,
          returnedIdentifier: product.identifier
        });
      }
    } catch (error) {
      logApplePurchaseFlow('single product fallback failed', {
        productIdentifier,
        ...getSafeErrorDetails(error)
      });
      logApplePurchaseDebug('single product load failed', {
        productIdentifier,
        message: error.message,
        code: error.code
      });
    }
  }

  logApplePurchaseDebug('single product fallback finished', {
    count: individualProducts.length,
    identifiers: individualProducts.map((product) => product.identifier)
  });
  logApplePurchaseFlow('single product fallback finished', {
    count: individualProducts.length,
    identifiers: individualProducts.map((product) => product.identifier)
  });

  return individualProducts;
}

export async function purchaseAppleSubscription(planId) {
  const plan = getPlanById(planId);
  const productIdentifier = plan.productIds.ios;

  addMonitoringBreadcrumb('payment', 'apple-purchase:start', {
    planId: plan.id,
    productIdentifier
  });

  try {
    logApplePurchaseFlow('purchase started', {
      planId: plan.id,
      productIdentifier
    });

    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: getAppAccountToken()
    });

    logApplePurchaseFlow('purchase completed', {
      planId: plan.id,
      productIdentifier: transaction.productIdentifier,
      transactionId: transaction.transactionId,
      environment: transaction.environment,
      isActive: transaction.isActive,
      expirationDate: transaction.expirationDate,
      hasJwsRepresentation: Boolean(transaction.jwsRepresentation)
    });

    logApplePurchaseDebug('purchase transaction received', {
      transactionId: transaction.transactionId,
      productIdentifier: transaction.productIdentifier,
      environment: transaction.environment,
      isActive: transaction.isActive,
      expirationDate: transaction.expirationDate,
      hasReceipt: Boolean(transaction.receipt),
      hasJwsRepresentation: Boolean(transaction.jwsRepresentation),
      keys: Object.keys(transaction || {})
    });

    // TODO(backend-validation): send transaction.receipt, transaction.jwsRepresentation,
    // transaction.transactionId, transaction.productIdentifier, and transaction.environment
    // to the backend before granting permanent production entitlement.
    const looksLikeVerifiedStoreKitPurchase =
      isAppleSubscriptionProduct(transaction.productIdentifier) &&
      Boolean(transaction.transactionId);

    if (!isActiveAppleSubscription(transaction) && !looksLikeVerifiedStoreKitPurchase) {
      throw new Error('messages.applePurchasePending');
    }

    return {
      transaction,
      planId: getPlanIdFromAppleProductId(transaction.productIdentifier)
    };
  } catch (error) {
    logApplePurchaseDebug('purchase failed', {
      name: error.name,
      message: error.message,
      code: error.code,
      alreadyPurchased: isAppleAlreadyPurchased(error),
      cancelled: isApplePurchaseCancelled(error)
    });
    captureAppError(error, {
      area: 'apple-purchase',
      planId: plan.id,
      productIdentifier
    });
    throw error;
  }
}

export async function restoreAppleSubscriptions() {
  addMonitoringBreadcrumb('payment', 'apple-restore:start');
  logApplePurchaseFlow('restore started');

  const activePurchase = await resolveAppleRestore({
    queryActiveSubscription: getActiveAppleSubscription,
    syncPurchases: async () => {
      logApplePurchaseFlow('restore StoreKit sync started');
      await NativePurchases.restorePurchases();
      logApplePurchaseFlow('restore StoreKit sync completed');
    },
    isEmptyError: isAppleRestoreEmpty,
    isCancelledError: isApplePurchaseCancelled
  });

  // TODO(backend-validation): send activePurchase receipt/JWS metadata to the backend
  // before granting permanent production entitlement.
  addMonitoringBreadcrumb('payment', 'apple-restore:success', {
    productIdentifier: activePurchase.transaction.productIdentifier
  });
  logApplePurchaseFlow('restore completed', {
    productIdentifier: activePurchase.transaction.productIdentifier,
    transactionId: activePurchase.transaction.transactionId,
    environment: activePurchase.transaction.environment,
    expirationDate: activePurchase.transaction.expirationDate,
    hasJwsRepresentation: Boolean(activePurchase.transaction.jwsRepresentation)
  });

  return activePurchase;
}

export async function getActiveAppleSubscription(reason = 'entitlement-check') {
  let { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
    appAccountToken: getAppAccountToken()
  });
  const activePurchase = purchases.find(isActiveAppleSubscription);

  if (!activePurchase && getAppAccountToken()) {
    logApplePurchaseDebug('entitlement check retrying without app account token', {
      reason,
      firstPassCount: purchases.length
    });
    const fallback = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
      onlyCurrentEntitlements: true
    });
    purchases = fallback.purchases;
  }

  const fallbackActivePurchase = purchases.find(isActiveAppleSubscription);

  logApplePurchaseDebug('active subscription entitlements received', {
    reason,
    count: purchases.length,
    activeProductIdentifier: fallbackActivePurchase?.productIdentifier,
    activeTransactionId: fallbackActivePurchase?.transactionId,
    activeEnvironment: fallbackActivePurchase?.environment,
    activeHasReceipt: Boolean(fallbackActivePurchase?.receipt),
    activeHasJwsRepresentation: Boolean(fallbackActivePurchase?.jwsRepresentation)
  });

  if (!fallbackActivePurchase) {
    throw new Error('messages.appleRestoreEmpty');
  }

  return {
    transaction: fallbackActivePurchase,
    planId: getPlanIdFromAppleProductId(fallbackActivePurchase.productIdentifier)
  };
}
