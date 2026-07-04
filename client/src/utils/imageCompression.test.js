import assert from 'node:assert/strict';
import test from 'node:test';
import { getItemCropRect, getItemPreviewCropRect, normalizeItemCropBox } from './itemCrop.js';

test('item crop rectangles use different visible areas by clothing type', () => {
  const shirtCrop = getItemCropRect('shirt', 0, 3);
  const pantsCrop = getItemCropRect('pants', 1, 3);
  const shoesCrop = getItemCropRect('shoes', 2, 3);

  assert.ok(shirtCrop.y < pantsCrop.y);
  assert.ok(pantsCrop.y < shoesCrop.y);
  assert.ok(shirtCrop.height > shoesCrop.height);
  assert.notDeepEqual(shirtCrop, pantsCrop);
  assert.notDeepEqual(pantsCrop, shoesCrop);
});

test('outerwear crop is wider than a normal top crop', () => {
  const topCrop = getItemCropRect('tshirt', 0, 2);
  const jacketCrop = getItemCropRect('jacket', 1, 2);

  assert.ok(jacketCrop.width > topCrop.width);
  assert.ok(jacketCrop.x < topCrop.x);
});

test('unknown item crop falls back to distributed cells', () => {
  const firstCrop = getItemCropRect('unknown', 0, 2);
  const secondCrop = getItemCropRect('unknown', 1, 2);

  assert.equal(firstCrop.y, secondCrop.y);
  assert.ok(firstCrop.x < secondCrop.x);
  assert.notDeepEqual(firstCrop, secondCrop);
});

test('item preview crop prefers normalized AI bounding boxes', () => {
  const crop = getItemPreviewCropRect({
    type: 'shirt',
    box: { x: 0.12, y: 0.22, width: 0.3, height: 0.4 }
  }, 0, 2);

  assert.equal(crop.x, 0.12);
  assert.equal(crop.y, 0.22);
  assert.equal(crop.width, 0.3);
  assert.equal(crop.height, 0.4);
});

test('invalid AI bounding boxes fall back to type crop', () => {
  const fallback = getItemCropRect('pants', 0, 2);
  const crop = getItemPreviewCropRect({
    type: 'pants',
    box: { x: 'bad', y: 0.22, width: 0.3, height: 0.4 }
  }, 0, 2);

  assert.deepEqual(crop, fallback);
});

test('normalizes oversized AI bounding boxes into image bounds', () => {
  const crop = normalizeItemCropBox({ x: 0.9, y: 0.92, width: 0.5, height: 0.5 });

  assert.equal(crop.x, 0.9);
  assert.equal(crop.y, 0.92);
  assert.ok(Math.abs(crop.width - 0.1) < 0.000001);
  assert.equal(crop.height, 0.08);
});
