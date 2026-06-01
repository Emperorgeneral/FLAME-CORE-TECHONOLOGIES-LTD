import { FastifyInstance } from 'fastify';
import { userService } from '../services/userService.js';
import { logger } from '../utils/logger.js';
import { checkRegisterRateLimit, checkLoginRateLimit, recordFailedLogin, clearFailedLogins } from '../utils/authRateLimit.js';
import { signAccessToken, signRefreshToken, generateVerificationToken } from '../utils/tokens.js';
import { emailService } from '../services/emailService.js';
import { query } from '../db/pool.js';
import { createHash } from 'crypto';

export async function registerAuthRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/register', async (request, reply) => {
    try {
      const ip = request.ip;
      const rateLimit = await checkRegisterRateLimit(ip);

      if (!rateLimit.allowed) {
        return reply.status(429).header('retry-after', rateLimit.retryAfter.toString()).send({
          error: 'too many registration attempts',
          retryAfter: rateLimit.retryAfter,
        });
      }

      const body = request.body as any;
      const { email, username, password, full_name, country_code, locale, timezone } = body;

      if (!email || !username || !password) {
        return reply.status(400).send({ error: 'email, username and password are required' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return reply.status(400).send({ error: 'password must be at least 8 characters' });
      }

      const existing = await userService.getByEmail(email);
      if (existing) return reply.status(409).send({ error: 'account already exists' });

      const { user, teamId } = await userService.register({
        email, username, password,
        fullName: full_name, countryCode: country_code, locale, timezone,
      });

      // Generate verification token
      const verificationToken = generateVerificationToken();
      await query(
        `INSERT INTO email_verification_tokens (user_id, email, token) VALUES ($1, $2, $3)`,
        [user.id, email, verificationToken]
      );

      // Send verification email
      const verifyUrl = `${process.env.FRONTEND_URL || 'https://flamecoretechltd.com'}/auth/verify?token=${verificationToken}`;
      await emailService.queue(email, 'verify_email', {
        name: user.full_name || user.username || 'User',
        verify_url: verifyUrl,
      });

      return reply.status(201).send({
        user: publicUser(user),
        team_id: teamId,
        message: 'Registration successful. Please check your email to verify your account.',
        email_verification_required: true,
      });
    } catch (err) {
      logger.error('register', err);
      return reply.status(500).send({ error: 'internal error' });
    }
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    try {
      const ip = request.ip;
      const rateLimit = await checkLoginRateLimit(ip);

      if (!rateLimit.allowed) {
        return reply.status(429).header('retry-after', rateLimit.retryAfter.toString()).send({
          error: 'too many login attempts',
          retryAfter: rateLimit.retryAfter,
        });
      }

      const { email, password } = request.body as any;
      if (!email || !password) return reply.status(400).send({ error: 'email and password required' });

      const user = await userService.verifyCredentials(email, password);
      if (!user) {
        await recordFailedLogin(email);
        return reply.status(401).send({ error: 'invalid credentials' });
      }

      // Check email verification
      if (!user.email_verified) {
        return reply.status(403).send({
          error: 'email not verified',
          message: 'Please verify your email before logging in. Check your inbox for a verification link.',
        });
      }

      if (user.status === 'suspended') return reply.status(403).send({ error: 'account suspended' });

      // Clear failed login counter on successful login
      await clearFailedLogins(email);

      const teams = await userService.teamsForUser(user.id);
      
      // Sign short-lived access token (15 minutes)
      const accessToken = signAccessToken(fastify, user.id, user.email, user.role, teams.map((t) => t.id));
      
      // Sign long-lived refresh token (7 days) and store hash
      const refreshToken = signRefreshToken(fastify, user.id);
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash) VALUES ($1, $2)`,
        [user.id, tokenHash]
      );

      // Set refresh token in HTTP-only cookie
      reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth',
      });

      return reply.send({
        user: publicUser(user),
        teams: teams.map((t) => ({ id: t.id, slug: t.slug, name: t.name, role: t.member_role })),
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900, // 15 minutes in seconds
      });
    } catch (err) {
      logger.error('login', err);
      return reply.status(500).send({ error: 'internal error' });
    }
  });

  // Email verification endpoint
  fastify.post('/api/auth/verify', async (request, reply) => {
    try {
      const { token } = request.body as any;
      if (!token) return reply.status(400).send({ error: 'token is required' });

      // Look up verification token
      const result = await query(
        `SELECT user_id, email, expires_at, is_used FROM email_verification_tokens 
         WHERE token = $1 AND is_used = false`,
        [token]
      );

      if (result.rows.length === 0) {
        return reply.status(400).send({ error: 'invalid or expired verification token' });
      }

      const { user_id, email, expires_at, is_used } = result.rows[0];

      // Check if token expired
      if (new Date(expires_at) < new Date()) {
        return reply.status(400).send({ error: 'verification token has expired' });
      }

      if (is_used) {
        return reply.status(400).send({ error: 'token already used' });
      }

      // Mark email as verified
      await query(
        `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`,
        [user_id]
      );

      // Mark token as used
      await query(
        `UPDATE email_verification_tokens SET is_used = true, verified_at = now() WHERE token = $1`,
        [token]
      );

      // Get user and issue access token
      const user = await userService.getById(user_id);
      if (!user) return reply.status(404).send({ error: 'user not found' });

      const teams = await userService.teamsForUser(user_id);
      const accessToken = signAccessToken(fastify, user_id, email, user.role, teams.map((t) => t.id));
      const refreshToken = signRefreshToken(fastify, user_id);
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash) VALUES ($1, $2)`,
        [user_id, tokenHash]
      );

      reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
      });

      return reply.send({
        user: publicUser(user),
        teams: teams.map((t) => ({ id: t.id, slug: t.slug, name: t.name, role: t.member_role })),
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        message: 'Email verified successfully',
      });
    } catch (err) {
      logger.error('verify', err);
      return reply.status(500).send({ error: 'internal error' });
    }
  });

  // Refresh access token endpoint
  fastify.post('/api/auth/refresh', async (request, reply) => {
    try {
      const refreshToken = request.cookies.refresh_token;
      if (!refreshToken) {
        return reply.status(401).send({ error: 'refresh token missing' });
      }

      // Verify refresh token
      let decoded: any;
      try {
        decoded = fastify.jwt.verify(refreshToken);
      } catch {
        return reply.status(401).send({ error: 'invalid refresh token' });
      }

      if (decoded.type !== 'refresh') {
        return reply.status(401).send({ error: 'invalid token type' });
      }

      const userId = decoded.sub;
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

      // Verify token exists and is not revoked
      const tokenResult = await query(
        `SELECT is_revoked, expires_at FROM refresh_tokens 
         WHERE user_id = $1 AND token_hash = $2 AND is_revoked = false`,
        [userId, tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        return reply.status(401).send({ error: 'refresh token revoked or not found' });
      }

      const { expires_at } = tokenResult.rows[0];
      if (new Date(expires_at) < new Date()) {
        return reply.status(401).send({ error: 'refresh token expired' });
      }

      // Update last_used_at
      await query(
        `UPDATE refresh_tokens SET last_used_at = now() 
         WHERE user_id = $1 AND token_hash = $2`,
        [userId, tokenHash]
      );

      // Get user and generate new access token
      const user = await userService.getById(userId);
      if (!user) return reply.status(404).send({ error: 'user not found' });

      const teams = await userService.teamsForUser(userId);
      const newAccessToken = signAccessToken(fastify, userId, user.email, user.role, teams.map((t) => t.id));

      return reply.send({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 900,
      });
    } catch (err) {
      logger.error('refresh', err);
      return reply.status(500).send({ error: 'internal error' });
    }
  });

  fastify.get('/api/auth/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).sub;
      const user = await userService.getById(userId);
      if (!user) return reply.status(404).send({ error: 'user not found' });
      const teams = await userService.teamsForUser(userId);
      return reply.send({
        user: publicUser(user),
        teams: teams.map((t) => ({ id: t.id, slug: t.slug, name: t.name, role: t.member_role })),
      });
    } catch {
      return reply.status(401).send({ error: 'unauthorized' });
    }
  });

  fastify.patch('/api/auth/preferences', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).sub;
      const updated = await userService.updatePreferences(userId, request.body as any);
      return reply.send({ user: updated ? publicUser(updated) : null });
    } catch (err) {
      logger.error('prefs', err);
      return reply.status(500).send({ error: 'internal error' });
    }
  });
}

function publicUser(u: any) {
  return {
    id: u.id, email: u.email, username: u.username, full_name: u.full_name,
    role: u.role, avatar_url: u.avatar_url,
    country_code: u.country_code,
    preferred_currency: u.preferred_currency,
    preferred_region: u.preferred_region,
    locale: u.locale, timezone: u.timezone,
    email_verified: u.email_verified,
  };
}
