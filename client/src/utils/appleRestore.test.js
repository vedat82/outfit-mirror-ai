import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppleRestore } from './appleRestore.js';

const emptyError = () => new Error('messages.appleRestoreEmpty');
const isEmptyError = (error) => error.message === 'messages.appleRestoreEmpty';
const isCancelledError = (error) => error.message.toLowerCase().includes('cancel');

test('uses an existing active entitlement without opening Apple sync', async () => {
  let syncCalls = 0;
  const active = { planId: 'premium-monthly' };

  const result = await resolveAppleRestore({
    queryActiveSubscription: async () => active,
    syncPurchases: async () => { syncCalls += 1; },
    isEmptyError,
    isCancelledError
  });

  assert.equal(result, active);
  assert.equal(syncCalls, 0);
});

test('syncs Apple purchases when no current entitlement is available', async () => {
  let queryCalls = 0;
  let syncCalls = 0;
  const active = { planId: 'premium-yearly' };

  const result = await resolveAppleRestore({
    queryActiveSubscription: async () => {
      queryCalls += 1;
      if (queryCalls === 1) throw emptyError();
      return active;
    },
    syncPurchases: async () => { syncCalls += 1; },
    isEmptyError,
    isCancelledError
  });

  assert.equal(result, active);
  assert.equal(syncCalls, 1);
  assert.equal(queryCalls, 2);
});

test('recovers an active entitlement even when Apple sync reports cancellation', async () => {
  let queryCalls = 0;
  const active = { planId: 'premium-monthly' };

  const result = await resolveAppleRestore({
    queryActiveSubscription: async () => {
      queryCalls += 1;
      if (queryCalls === 1) throw emptyError();
      return active;
    },
    syncPurchases: async () => { throw new Error('Request Canceled'); },
    isEmptyError,
    isCancelledError
  });

  assert.equal(result, active);
  assert.equal(queryCalls, 2);
});

test('preserves a real Apple cancellation when no entitlement can be found', async () => {
  const cancelled = new Error('Request Canceled');

  await assert.rejects(
    resolveAppleRestore({
      queryActiveSubscription: async () => { throw emptyError(); },
      syncPurchases: async () => { throw cancelled; },
      isEmptyError,
      isCancelledError
    }),
    (error) => error === cancelled && error.isUserCancelled === true
  );
});

test('does not hide unexpected entitlement query failures', async () => {
  let syncCalls = 0;
  const queryError = new Error('Store unavailable');

  await assert.rejects(
    resolveAppleRestore({
      queryActiveSubscription: async () => { throw queryError; },
      syncPurchases: async () => { syncCalls += 1; },
      isEmptyError,
      isCancelledError
    }),
    queryError
  );
  assert.equal(syncCalls, 0);
});
