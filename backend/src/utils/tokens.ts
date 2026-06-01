/**
 * Token management: access tokens (short-lived) and refresh tokens (long-lived)
 */

import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access token (15 minutes) — short-lived, used for API requests
 */
export function signAccessToken(fastify: FastifyInstance, userId: string, email: string, role: string, teamIds: string[]) {
  return fastify.jwt.sign(
    { sub: userId, email, role, team_ids: teamIds, type: 'access' },
    { expiresIn: '15m' }
  );
}

/**
 * Generate refresh token (7 days) — long-lived, used to get new access tokens
 * Stored in HTTP-only cookie for security
 */
export function signRefreshToken(fastify: FastifyInstance, userId: string) {
  return fastify.jwt.sign(
    { sub: userId, type: 'refresh' },
    { expiresIn: '7d' }
  );
}

/**
 * Generate verification token for email confirmation
 * Token is one-time use, stored in database, 24-hour expiration
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate password reset token
 * Token is one-time use, stored in database, 1-hour expiration
 */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}
