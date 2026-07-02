import assert from 'node:assert/strict';
import test from 'node:test';
import { getItemCropRect } from './itemCrop.js';

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
