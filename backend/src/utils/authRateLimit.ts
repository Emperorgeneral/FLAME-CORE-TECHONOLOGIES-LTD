import { createClient } from 'redis';
import { logger } from './logger.js';

/**
 * Redis-backed rate limiting for authentication routes.
 * Tracks login failures and registration attempts per IP address.
 * Fails gracefully if Redis is unavailable.
 */

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

let redisAvailable = false;
let redisWarningShown = false;

redis.on('error', (err) => {
  if (!redisWarningShown) {
    logger.warn('Redis unavailable, rate limiting disabled (will retry silently)', err.message);
    redisWarningShown = true;
  }
});

redis.on('connect', () => {
  redisAvailable = true;
  logger.info('✅ Redis connected');
  redisWarningShown = false;
});

redis.connect().catch((err) => {
  if (!redisWarningShown) {
    logger.warn('Redis connect failed, rate limiting disabled', err.message);
    redisWarningShown = true;
  }
});

/**
 * Check if login attempt is allowed (max 10 failed attempts per hour per IP)
 * Returns: { allowed: boolean, remaining: number, retryAfter: number }
 */
export async function checkLoginRateLimit(ip: string) {
  try {
    const key = `auth:login:${ip}`;
    const maxAttempts = 10;
    const windowSeconds = 3600; // 1 hour

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, maxAttempts - current);
    const allowed = current <= maxAttempts;

    return {
      allowed,
      remaining,
      retryAfter: allowed ? 0 : ttl,
    };
  } catch (err) {
    logger.error('checkLoginRateLimit error', err);
    // Fail open: allow the request if Redis is unavailable
    return { allowed: true, remaining: 10, retryAfter: 0 };
  }
}

/**
 * Check if registration attempt is allowed (max 5 attempts per hour per IP)
 * Returns: { allowed: boolean, remaining: number, retryAfter: number }
 */
export async function checkRegisterRateLimit(ip: string) {
  try {
    const key = `auth:register:${ip}`;
    const maxAttempts = 5;
    const windowSeconds = 3600; // 1 hour

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, maxAttempts - current);
    const allowed = current <= maxAttempts;

    return {
      allowed,
      remaining,
      retryAfter: allowed ? 0 : ttl,
    };
  } catch (err) {
    logger.error('checkRegisterRateLimit error', err);
    // Fail open: allow the request if Redis is unavailable
    return { allowed: true, remaining: 5, retryAfter: 0 };
  }
}

/**
 * Increment failed login counter for an email address
 * (tracks failed attempts per user, not just per IP)
 */
export async function recordFailedLogin(email: string) {
  try {
    const key = `auth:failed_login:${email}`;
    const windowSeconds = 3600; // 1 hour

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
  } catch (err) {
    logger.error('recordFailedLogin error', err);
  }
}

/**
 * Clear failed login counter after successful login
 */
export async function clearFailedLogins(email: string) {
  try {
    const key = `auth:failed_login:${email}`;
    await redis.del(key);
  } catch (err) {
    logger.error('clearFailedLogins error', err);
  }
}

export async function closeRedis() {
  try {
    await redis.quit();
  } catch (err) {
    logger.error('redis close error', err);
  }
}
