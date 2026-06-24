import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNativeApp } from './platform.js';
import { compressImageDataUrl, compressImageFile } from './imageCompression.js';

export const imageSources = {
  camera: 'camera',
  photos: 'photos'
};

export function isNativeImagePickerCancel(error) {
  const message = String(error?.message || error?.errorMessage || '').toLowerCase();
  return message.includes('cancel');
}

function getCameraSource(source) {
  return source === imageSources.camera ? CameraSource.Camera : CameraSource.Photos;
}

export async function pickNativeImageDataUrl({ source = imageSources.photos, maxDimension = 960, quality = 0.68 } = {}) {
  if (!isNativeApp()) {
    return '';
  }

  const photo = await Camera.getPhoto({
    quality: Math.round(quality * 100),
    resultType: CameraResultType.DataUrl,
    source: getCameraSource(source),
    allowEditing: false,
    correctOrientation: true,
    saveToGallery: false
  });

  if (!photo.dataUrl) {
    throw new Error('messages.actionFailed');
  }

  return compressImageDataUrl(photo.dataUrl, { maxDimension, quality });
}

export async function getImageDataUrlFromFile(file, options = {}) {
  return compressImageFile(file, options);
}
