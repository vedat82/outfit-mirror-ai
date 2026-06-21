import { addMonitoringBreadcrumb, captureAppError } from '../monitoring/sentry.js';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded.'));
    image.src = dataUrl;
  });
}

export async function compressImageDataUrl(dataUrl, options = {}) {
  const {
    maxDimension = 1200,
    quality = 0.72,
    mimeType = 'image/jpeg'
  } = options;
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    return dataUrl;
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL(mimeType, quality);
}

export async function compressImageFile(file, options = {}) {
  const {
    maxDimension = 1280,
    quality = 0.78,
    mimeType = 'image/jpeg'
  } = options;
  let originalDataUrl = '';

  try {
    originalDataUrl = await readFileAsDataUrl(file);
  } catch (error) {
    captureAppError(error, {
      area: 'image-read',
      fileType: file.type,
      fileSize: file.size
    });
    throw error;
  }
  addMonitoringBreadcrumb('image', 'compress:start', {
    type: file.type,
    size: file.size,
    maxDimension
  });

  try {
    const compressedDataUrl = await compressImageDataUrl(originalDataUrl, { maxDimension, quality, mimeType });
    addMonitoringBreadcrumb('image', 'compress:success', {
      originalBytes: originalDataUrl.length,
      compressedBytes: compressedDataUrl.length
    });
    return compressedDataUrl;
  } catch (error) {
    captureAppError(error, {
      area: 'image-compression',
      fileType: file.type,
      fileSize: file.size
    });
    return originalDataUrl;
  }
}
