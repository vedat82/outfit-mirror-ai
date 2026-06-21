import { db } from '../db.js';

const getAccess = db.prepare('SELECT is_premium as isPremium FROM user_access WHERE user_id = ?');

export function getUserId(req) {
  const headerUserId = req.get('x-user-id');
  const bodyUserId = req.body?.userId;
  const queryUserId = req.query?.userId;
  const userId = String(headerUserId || bodyUserId || queryUserId || '').trim();

  if (!userId) {
    return null;
  }

  return userId.slice(0, 120);
}

export function requireUserId(req, res) {
  const userId = getUserId(req);

  if (!userId) {
    res.status(400).json({ message: 'Missing userId. Refresh the app to create a local user identity.' });
    return null;
  }

  return userId;
}

export function getIsPremium(req) {
  const userId = getUserId(req);

  return Boolean(userId && getAccess.get(userId)?.isPremium);
}
