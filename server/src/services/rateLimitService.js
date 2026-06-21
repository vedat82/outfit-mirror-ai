const buckets = new Map();

function getClientIp(req) {
  const forwardedFor = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown-ip';
}

function getRateLimitKey(req, scope) {
  const userId = String(req.get('x-user-id') || req.body?.userId || req.query?.userId || 'anonymous').trim().slice(0, 120);
  return `${scope}:${getClientIp(req)}:${userId || 'anonymous'}`;
}

function getIpRateLimitKey(req, scope) {
  return `${scope}:${getClientIp(req)}`;
}

function cleanup(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function hasAdminBypass(req) {
  const configuredToken = String(process.env.SEE_ON_ME_ADMIN_BYPASS_TOKEN || process.env.ADMIN_BYPASS_TOKEN || '').trim();
  return Boolean(configuredToken && String(req.get('x-admin-bypass') || '').trim() === configuredToken);
}

export function createRateLimiter({ scope, windowMs, maxRequests, message = 'messages.tooManyRequests' }) {
  return function rateLimiter(req, res, next) {
    if (hasAdminBypass(req)) {
      return next();
    }

    const now = Date.now();
    cleanup(now);

    const key = getRateLimitKey(req, scope);
    const existingBucket = buckets.get(key);
    const bucket = existingBucket && existingBucket.resetAt > now
      ? existingBucket
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));
    res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

    if (bucket.count > maxRequests) {
      console.warn('[rate-limit] rejection', { scope, retryAfterSeconds });
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message,
        messageKey: message
      });
    }

    return next();
  };
}

export function createIpRateLimiter({ scope, windowMs, maxRequests, message = 'messages.tooManyRequests' }) {
  return function ipRateLimiter(req, res, next) {
    if (hasAdminBypass(req)) {
      return next();
    }

    const now = Date.now();
    cleanup(now);

    const key = getIpRateLimitKey(req, scope);
    const existingBucket = buckets.get(key);
    const bucket = existingBucket && existingBucket.resetAt > now
      ? existingBucket
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));
    res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

    if (bucket.count > maxRequests) {
      console.warn('[rate-limit] ip rejection', { scope, retryAfterSeconds });
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message,
        messageKey: message,
        retryAfterSeconds
      });
    }

    return next();
  };
}
