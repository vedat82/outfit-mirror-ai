import { addMonitoringBreadcrumb, captureAppError } from '../monitoring/sentry.js';
import { getItemCropRect } from './itemCrop.js';

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

export async function compressImageDataUrlToBudget(dataUrl, options = {}) {
  const {
    maxBytes = 850000,
    maxDimension = 860,
    minDimension = 420,
    quality = 0.64,
    minQuality = 0.42,
    mimeType = 'image/jpeg'
  } = options;
  let currentDimension = maxDimension;
  let currentQuality = quality;
  let compressedDataUrl = await compressImageDataUrl(dataUrl, {
    maxDimension: currentDimension,
    quality: currentQuality,
    mimeType
  });

  while (compressedDataUrl.length > maxBytes && (currentDimension > minDimension || currentQuality > minQuality)) {
    currentDimension = Math.max(minDimension, Math.round(currentDimension * 0.82));
    currentQuality = Math.max(minQuality, Number((currentQuality - 0.08).toFixed(2)));
    compressedDataUrl = await compressImageDataUrl(dataUrl, {
      maxDimension: currentDimension,
      quality: currentQuality,
      mimeType
    });
  }

  return compressedDataUrl;
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

export const aiImageOptimizationOptions = {
  maxDimension: 1024,
  quality: 0.8,
  mimeType: 'image/jpeg'
};

export async function optimizeAiImageDataUrl(dataUrl, options = {}) {
  return compressImageDataUrl(dataUrl, {
    ...aiImageOptimizationOptions,
    ...options
  });
}

export async function optimizeAiImageFile(file, options = {}) {
  return compressImageFile(file, {
    ...aiImageOptimizationOptions,
    ...options
  });
}

export async function createItemPreviewImages(dataUrl, itemsOrCount, options = {}) {
  const {
    size = 720,
    quality = 0.72,
    mimeType = 'image/jpeg'
  } = options;
  const items = Array.isArray(itemsOrCount)
    ? itemsOrCount
    : Array.from({ length: Math.max(1, Math.min(6, Number(itemsOrCount) || 1)) }, () => ({}));
  const itemCount = Math.max(1, Math.min(6, items.length || 1));

  const image = await loadImage(dataUrl);

  return Array.from({ length: itemCount }, (_, index) => {
    const cropRect = getItemCropRect(items[index]?.type, index, itemCount);
    const sourceX = Math.round(cropRect.x * image.width);
    const sourceY = Math.round(cropRect.y * image.height);
    const sourceWidth = Math.max(1, Math.round(cropRect.width * image.width));
    const sourceHeight = Math.max(1, Math.round(cropRect.height * image.height));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) return dataUrl;

    canvas.width = size;
    canvas.height = size;
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, size, size);

    const scale = Math.min(size / sourceWidth, size / sourceHeight);
    const drawWidth = Math.round(sourceWidth * scale);
    const drawHeight = Math.round(sourceHeight * scale);
    const drawX = Math.round((size - drawWidth) / 2);
    const drawY = Math.round((size - drawHeight) / 2);

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);

    return canvas.toDataURL(mimeType, quality);
  });
}
