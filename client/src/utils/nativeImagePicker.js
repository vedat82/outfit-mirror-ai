import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNativeApp } from './platform.js';
import { compressImageFile, optimizeAiImageDataUrl } from './imageCompression.js';

const debugStorageKey = 'outfitMirrorNativePickerDebug';

export const imageSources = {
  camera: 'camera',
  photos: 'photos'
};

export function isNativeImagePickerCancel(error) {
  const message = String(error?.message || error?.errorMessage || '').toLowerCase();
  return message.includes('cancel');
}

export function saveNativeImagePickerDebug(event) {
  const payload = {
    ...event,
    createdAt: new Date().toISOString(),
    isNative: Boolean(isNativeApp()),
    protocol: window.location.protocol,
    hasCapacitor: Boolean(window.Capacitor),
    platform: window.Capacitor?.getPlatform?.() || 'unknown'
  };

  try {
    window.localStorage.setItem(debugStorageKey, JSON.stringify(payload));
  } catch {
    // Diagnostics should never block the user flow.
  }

  if (import.meta.env.DEV || import.meta.env.VITE_IAP_DEBUG === 'true' || import.meta.env.VITE_API_DEBUG === 'true') {
    console.info('[native-image-picker]', payload);
  }
}

export function getNativeImagePickerDebug() {
  try {
    return JSON.parse(window.localStorage.getItem(debugStorageKey) || 'null');
  } catch {
    return null;
  }
}

function getCameraSource(source) {
  return source === imageSources.camera ? CameraSource.Camera : CameraSource.Photos;
}

export async function pickNativeImageDataUrl({ source = imageSources.photos, maxDimension = 960, quality = 0.68 } = {}) {
  if (!isNativeApp()) {
    saveNativeImagePickerDebug({ source, status: 'skipped-web' });
    return '';
  }

  saveNativeImagePickerDebug({ source, status: 'started' });

  let photo;

  try {
    photo = await Camera.getPhoto({
      quality: Math.round(quality * 100),
      resultType: CameraResultType.DataUrl,
      source: getCameraSource(source),
      allowEditing: false,
      correctOrientation: true,
      saveToGallery: false
    });
  } catch (error) {
    saveNativeImagePickerDebug({
      source,
      status: isNativeImagePickerCancel(error) ? 'cancelled' : 'failed',
      message: error?.message || error?.errorMessage || String(error)
    });
    throw error;
  }

  if (!photo.dataUrl) {
    saveNativeImagePickerDebug({ source, status: 'missing-data-url' });
    throw new Error('messages.actionFailed');
  }

  const compressedDataUrl = await optimizeAiImageDataUrl(photo.dataUrl, { maxDimension, quality });
  saveNativeImagePickerDebug({ source, status: 'success', bytes: compressedDataUrl.length });
  return compressedDataUrl;
}

export async function getImageDataUrlFromFile(file, options = {}) {
  return compressImageFile(file, options);
}
