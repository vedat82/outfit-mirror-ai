import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAppearanceProfileForSeeOnMe } from './seeOnMePayload.js';

test('See On Me request omits stored appearance photos from profile payload', () => {
  const sanitizedProfile = sanitizeAppearanceProfileForSeeOnMe({
    gender: 'male',
    bodyType: 'athletic',
    height: 'medium',
    skinTone: 'medium',
    photos: [
      { id: 'photo-1', imageUrl: 'data:image/jpeg;base64,very-large-photo' }
    ]
  });

  assert.deepEqual(sanitizedProfile, {
    gender: 'male',
    bodyType: 'athletic',
    height: 'medium',
    skinTone: 'medium'
  });
});
