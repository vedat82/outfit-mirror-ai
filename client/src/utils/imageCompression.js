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

function getRgbDistance(first, second) {
  return Math.sqrt(
    ((first[0] - second[0]) ** 2) +
    ((first[1] - second[1]) ** 2) +
    ((first[2] - second[2]) ** 2)
  );
}

function samplePixel(data, width, x, y) {
  const index = ((y * width) + x) * 4;
  return [data[index], data[index + 1], data[index + 2]];
}

function cleanupUniformBackground(canvas, fillColor = [248, 250, 252]) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const corners = [
    samplePixel(data, width, 0, 0),
    samplePixel(data, width, width - 1, 0),
    samplePixel(data, width, 0, height - 1),
    samplePixel(data, width, width - 1, height - 1)
  ];
  const averageCorner = corners.reduce((acc, pixel) => [
    acc[0] + pixel[0] / corners.length,
    acc[1] + pixel[1] / corners.length,
    acc[2] + pixel[2] / corners.length
  ], [0, 0, 0]);
  const maxCornerDistance = Math.max(...corners.map((pixel) => getRgbDistance(pixel, averageCorner)));

  if (maxCornerDistance > 52) {
    return false;
  }

  let changedPixels = 0;
  const threshold = 58;

  for (let index = 0; index < data.length; index += 4) {
    const pixel = [data[index], data[index + 1], data[index + 2]];
    if (getRgbDistance(pixel, averageCorner) > threshold) continue;

    data[index] = fillColor[0];
    data[index + 1] = fillColor[1];
    data[index + 2] = fillColor[2];
    data[index + 3] = 255;
    changedPixels += 1;
  }

  if (changedPixels < (width * height * 0.04)) {
    return false;
  }

  context.putImageData(imageData, 0, 0);
  return true;
}

export async function createItemPreviewImages(dataUrl, itemsOrCount, options = {}) {
  const {
    size = 720,
    quality = 0.72,
    mimeType = 'image/jpeg',
    cleanBackground = true
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

    if (cleanBackground) {
      const itemCanvas = document.createElement('canvas');
      const itemContext = itemCanvas.getContext('2d');

      if (itemContext) {
        itemCanvas.width = drawWidth;
        itemCanvas.height = drawHeight;
        itemContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, drawWidth, drawHeight);
        cleanupUniformBackground(itemCanvas);
        context.drawImage(itemCanvas, drawX, drawY);
      } else {
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);
      }
    } else {
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);
    }

    return canvas.toDataURL(mimeType, quality);
  });
}
