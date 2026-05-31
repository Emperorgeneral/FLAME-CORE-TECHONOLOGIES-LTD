import { FastifyInstance } from 'fastify';
import { userService } from '../services/userService.js';
import { logger } from '../utils/logger.js';
import { checkRegisterRateLimit, checkLoginRateLimit, recordFailedLogin, clearFailedLogins } from '../utils/authRateLimit.js';

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

      const token = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role, team_ids: [teamId] },
        { expiresIn: '7d' }
      );

      return reply.status(201).send({
        user: publicUser(user),
        team_id: teamId,
        token,
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
      if (user.status === 'suspended') return reply.status(403).send({ error: 'account suspended' });

      // Clear failed login counter on successful login
      await clearFailedLogins(email);

      const teams = await userService.teamsForUser(user.id);
      const token = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role, team_ids: teams.map((t) => t.id) },
        { expiresIn: '7d' }
      );

      return reply.send({
        user: publicUser(user),
        teams: teams.map((t) => ({ id: t.id, slug: t.slug, name: t.name, role: t.member_role })),
        token,
      });
    } catch (err) {
      logger.error('login', err);
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
  };
}
