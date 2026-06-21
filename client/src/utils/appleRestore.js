export async function resolveAppleRestore({
  queryActiveSubscription,
  syncPurchases,
  isEmptyError,
  isCancelledError
}) {
  try {
    return await queryActiveSubscription('restore-preflight');
  } catch (error) {
    if (!isEmptyError(error)) {
      throw error;
    }
  }

  try {
    await syncPurchases();
  } catch (syncError) {
    try {
      return await queryActiveSubscription('restore-after-sync-failure');
    } catch {
      if (isCancelledError(syncError)) {
        syncError.isUserCancelled = true;
      }
      throw syncError;
    }
  }

  return queryActiveSubscription('restore-after-sync');
}
