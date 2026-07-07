function clampRect(rect) {
  const x = Math.max(0, Math.min(1, rect.x));
  const y = Math.max(0, Math.min(1, rect.y));
  const width = Math.max(0.08, Math.min(1 - x, rect.width));
  const height = Math.max(0.08, Math.min(1 - y, rect.height));

  return { x, y, width, height };
}

export function getItemCropRect(type = '', index = 0, itemCount = 1) {
  const normalizedType = String(type || '').toLowerCase();

  if (['tshirt', 'shirt', 'long sleeve'].includes(normalizedType)) {
    return clampRect({ x: 0.18, y: 0.08, width: 0.64, height: 0.54 });
  }

  if (normalizedType === 'jacket') {
    return clampRect({ x: 0.1, y: 0.04, width: 0.8, height: 0.64 });
  }

  if (normalizedType === 'pants') {
    return clampRect({ x: 0.2, y: 0.38, width: 0.6, height: 0.52 });
  }

  if (normalizedType === 'shoes') {
    return clampRect({ x: 0.14, y: 0.7, width: 0.72, height: 0.28 });
  }

  const safeCount = Math.max(1, Math.min(6, Number(itemCount) || 1));
  const columns = safeCount <= 2 ? safeCount : 2;
  const rows = Math.ceil(safeCount / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);

  return clampRect({
    x: column / columns,
    y: row / rows,
    width: 1 / columns,
    height: 1 / rows
  });
}

export function normalizeItemCropBox(box) {
  if (!box || typeof box !== 'object') return null;

  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);

  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0.05 || height <= 0.05) return null;

  return clampRect({
    x,
    y,
    width,
    height
  });
}

function expandRect(rect, minWidth, minHeight) {
  const width = Math.min(1, Math.max(rect.width, minWidth));
  const height = Math.min(1, Math.max(rect.height, minHeight));
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const x = Math.max(0, Math.min(1 - width, centerX - width / 2));
  const y = Math.max(0, Math.min(1 - height, centerY - height / 2));

  return clampRect({ x, y, width, height });
}

function getTypeAwareAiCrop(item = {}) {
  const crop = normalizeItemCropBox(item.box);
  if (!crop) return null;

  const type = String(item.type || '').toLowerCase();
  if (type === 'shoes') {
    if (crop.width < 0.34 || crop.height < 0.14) {
      return expandRect(crop, 0.5, 0.22);
    }

    return expandRect(crop, 0.42, 0.18);
  }

  return crop;
}

export function getItemPreviewCropRect(item = {}, index = 0, itemCount = 1) {
  return getTypeAwareAiCrop(item) || getItemCropRect(item.type, index, itemCount);
}
