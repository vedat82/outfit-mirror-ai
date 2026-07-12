const APP_STORE_SCREENSHOT_MODE = import.meta.env.VITE_APP_STORE_SCREENSHOT_MODE === 'true';

export function isAppStoreScreenshotMode() {
  return APP_STORE_SCREENSHOT_MODE;
}
