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

export async function createItemPreviewImages(dataUrl, count, options = {}) {
  const {
    size = 720,
    quality = 0.72,
    mimeType = 'image/jpeg'
  } = options;
  const itemCount = Math.max(1, Math.min(6, Number(count) || 1));

  if (itemCount === 1) {
    return [await compressImageDataUrl(dataUrl, { maxDimension: size, quality, mimeType })];
  }

  const image = await loadImage(dataUrl);
  const columns = itemCount <= 2 ? itemCount : 2;
  const rows = Math.ceil(itemCount / columns);
  const cellWidth = image.width / columns;
  const cellHeight = image.height / rows;

  return Array.from({ length: itemCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const sourceX = Math.round(column * cellWidth);
    const sourceY = Math.round(row * cellHeight);
    const sourceWidth = Math.round(cellWidth);
    const sourceHeight = Math.round(cellHeight);
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
