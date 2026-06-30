import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const infoPlist = fs.readFileSync(new URL('../../ios/App/App/Info.plist', import.meta.url), 'utf8');

test('iOS declares permissions required by photo upload flows', () => {
  assert.match(infoPlist, /<key>NSCameraUsageDescription<\/key>/);
  assert.match(infoPlist, /<key>NSPhotoLibraryUsageDescription<\/key>/);
  assert.match(infoPlist, /<key>NSPhotoLibraryAddUsageDescription<\/key>/);
});

test('iOS does not declare unused sensitive permissions', () => {
  const unusedPermissionKeys = [
    'NSMicrophoneUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
    'NSContactsUsageDescription',
    'NSCalendarsUsageDescription',
    'NSUserTrackingUsageDescription'
  ];

  for (const permissionKey of unusedPermissionKeys) {
    assert.doesNotMatch(infoPlist, new RegExp(`<key>${permissionKey}<\\/key>`));
  }
});
