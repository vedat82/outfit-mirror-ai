export function detectPaymentPlatform(userAgent = navigator.userAgent) {
  const normalizedUserAgent = userAgent.toLowerCase();
  const isIpadOsDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  if (/iphone|ipad|ipod/.test(normalizedUserAgent) || isIpadOsDesktopMode) {
    return 'ios';
  }

  if (/android/.test(normalizedUserAgent)) {
    return 'android';
  }

  return 'web';
}

export function getPaymentSourceForPlatform(platform) {
  return platform === 'ios' ? 'iap' : 'iyzico';
}

export function isNativeApp() {
  return window.Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:';
}

export function canUseAppleSubscriptions() {
  return detectPaymentPlatform() === 'ios' && isNativeApp();
}
