import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureAiDataConsent, hasAiDataConsent, resetAiDataConsent } from './aiDataConsent.js';

function installWindow({ confirmed }) {
  const values = new Map();
  let confirmationCount = 0;
  global.window = {
    confirm(message) {
      confirmationCount += 1;
      assert.match(message, /OpenAI/);
      assert.match(message, /FAL\.ai/);
      return confirmed;
    },
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); }
    }
  };
  return () => confirmationCount;
}

test('AI data consent is stored after the user grants permission', () => {
  const getConfirmationCount = installWindow({ confirmed: true });
  assert.equal(ensureAiDataConsent('en'), true);
  assert.equal(hasAiDataConsent(), true);
  assert.equal(ensureAiDataConsent('en'), true);
  assert.equal(getConfirmationCount(), 1);
  resetAiDataConsent();
  assert.equal(hasAiDataConsent(), false);
});

test('declining AI data consent blocks the request and stores no permission', () => {
  installWindow({ confirmed: false });
  assert.throws(
    () => ensureAiDataConsent('en'),
    (error) => error.code === 'AI_DATA_CONSENT_REQUIRED' && error.message === 'messages.aiDataConsentRequired'
  );
  assert.equal(hasAiDataConsent(), false);
});
