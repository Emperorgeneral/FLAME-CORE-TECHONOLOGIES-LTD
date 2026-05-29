import { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { userService } from '../services/userService.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

/**
 * GitHub + Google OAuth routes — production-grade.
 *
 * Flow (both providers):
 *  1. Frontend opens /api/v1/oauth/{provider}
 *  2. Server redirects to provider with CSRF state cookie
 *  3. Provider redirects back to /callback with code
 *  4. Server exchanges code → access token
 *  5. Fetches user profile + primary email
 *  6. Creates new user + team OR links to existing user
 *  7. Stores provider token encrypted (AES-256-GCM)
 *  8. Issues our JWT and redirects to frontend /auth/callback
 *
 * Account linking:
 *  - If email matches an existing user → link provider to that account
 *  - POST /api/v1/oauth/{provider}/link → link from settings (authenticated)
 *  - DELETE /api/v1/oauth/{provider} → unlink provider
 *
 * Security:
 *  - State parameter prevents CSRF
 *  - All tokens stored via AES-256-GCM (backend/src/utils/crypto.ts)
 *  - Cookies httpOnly + secure + sameSite
 */

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function apiBase(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:3001';
}
function frontendBase(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:5173';
}

export async function registerOAuthRoutes(fastify: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════════════════
  //  GITHUB
  // ═══════════════════════════════════════════════════════════════════════

  // Step 1: redirect user to GitHub
  fastify.get('/api/v1/oauth/github', async (_request, reply) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return reply.status(501).send({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' });

    const state = crypto.randomBytes(20).toString('hex');
    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${apiBase()}/api/v1/oauth/github/callback`,
      scope: 'read:user user:email repo',
      state,
      allow_signup: 'true',
    });

    return reply.redirect(`${GITHUB_AUTH_URL}?${params}`);
  });

  // Step 2: GitHub redirects back
  fastify.get('/api/v1/oauth/github/callback', async (request, reply) => {
    try {
      const { code, state } = request.query as any;
      const cookieState = (request.cookies as any).oauth_state;
      if (!code || !state || state !== cookieState) {
        return reply.redirect(`${frontendBase()}/auth/callback?error=invalid_state`);
      }

      // Exchange code → access token
      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${apiBase()}/api/v1/oauth/github/callback`,
        }),
      });
      const tokenData = await tokenRes.json() as any;

      if (!tokenData.access_token) {
        logger.error('github token exchange failed', tokenData);
        return reply.redirect(`${frontendBase()}/auth/callback?error=token_exchange`);
      }

      // Fetch profile
      const profileRes = await fetch(`${GITHUB_API}/user`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github.v3+json' },
      });
      const ghUser = await profileRes.json() as any;

      // Fetch primary email (may be private)
      let email = ghUser.email;
      if (!email) {
        const emailsRes = await fetch(`${GITHUB_API}/user/emails`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github.v3+json' },
        });
        const emails = await emailsRes.json() as any[];
        if (Array.isArray(emails)) {
          email = emails.find((e: any) => e.primary && e.verified)?.email
              ?? emails.find((e: any) => e.primary)?.email
              ?? emails[0]?.email;
        }
      }

      if (!email) {
        return reply.redirect(`${frontendBase()}/auth/callback?error=no_email`);
      }

      // Find or create user
      const { user, teamId } = await findOrCreateFromOAuth({
        email,
        provider: 'github',
        providerId: String(ghUser.id),
        username: ghUser.login,
        fullName: ghUser.name || ghUser.login,
        avatarUrl: ghUser.avatar_url,
        providerUsername: ghUser.login,
      });

      // Store encrypted token
      await storeOAuthToken(user.id, 'github', tokenData);

      // Audit
      await auditLog(null, user.id, 'auth.oauth_login', 'user', user.id, { provider: 'github' });

      // Issue JWT
      const jwt = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role, team_ids: [teamId] },
        { expiresIn: '7d' }
      );

      return reply.redirect(`${frontendBase()}/auth/callback?token=${jwt}&team=${teamId}`);
    } catch (err) {
      logger.error('github oauth callback', err);
      return reply.redirect(`${frontendBase()}/auth/callback?error=server_error`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  GOOGLE
  // ═══════════════════════════════════════════════════════════════════════

  // Step 1: redirect user to Google
  fastify.get('/api/v1/oauth/google', async (_request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return reply.status(501).send({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });

    const state = crypto.randomBytes(20).toString('hex');
    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${apiBase()}/api/v1/oauth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return reply.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  // Step 2: Google redirects back
  fastify.get('/api/v1/oauth/google/callback', async (request, reply) => {
    try {
      const { code, state } = request.query as any;
      const cookieState = (request.cookies as any).oauth_state;
      if (!code || !state || state !== cookieState) {
        return reply.redirect(`${frontendBase()}/auth/callback?error=invalid_state`);
      }

      // Exchange code → tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID ?? '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          redirect_uri: `${apiBase()}/api/v1/oauth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json() as any;

      if (!tokenData.access_token) {
        logger.error('google token exchange failed', tokenData);
        return reply.redirect(`${frontendBase()}/auth/callback?error=token_exchange`);
      }

      // Fetch profile
      const profileRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const gUser = await profileRes.json() as any;

      if (!gUser.email) {
        return reply.redirect(`${frontendBase()}/auth/callback?error=no_email`);
      }

      // Find or create user
      const { user, teamId } = await findOrCreateFromOAuth({
        email: gUser.email,
        provider: 'google',
        providerId: String(gUser.id),
        username: gUser.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
        fullName: gUser.name || gUser.email.split('@')[0],
        avatarUrl: gUser.picture ?? null,
        providerUsername: null,
      });

      // Store encrypted token
      await storeOAuthToken(user.id, 'google', tokenData);

      // Audit
      await auditLog(null, user.id, 'auth.oauth_login', 'user', user.id, { provider: 'google' });

      // Issue JWT
      const jwt = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role, team_ids: [teamId] },
        { expiresIn: '7d' }
      );

      return reply.redirect(`${frontendBase()}/auth/callback?token=${jwt}&team=${teamId}`);
    } catch (err) {
      logger.error('google oauth callback', err);
      return reply.redirect(`${frontendBase()}/auth/callback?error=server_error`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  ACCOUNT LINKING (authenticated user links a new provider)
  // ═══════════════════════════════════════════════════════════════════════

  // Link GitHub to existing account (triggers same OAuth flow but merges)
  fastify.get('/api/v1/oauth/github/link', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).sub;

      const state = `link_${userId}_${crypto.randomBytes(12).toString('hex')}`;
      reply.setCookie('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });

      const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID ?? '',
        redirect_uri: `${apiBase()}/api/v1/oauth/github/callback`,
        scope: 'read:user user:email repo',
        state,
      });

      return reply.redirect(`${GITHUB_AUTH_URL}?${params}`);
    } catch {
      return reply.status(401).send({ error: 'unauthorized' });
    }
  });

  // Link Google to existing account
  fastify.get('/api/v1/oauth/google/link', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).sub;

      const state = `link_${userId}_${crypto.randomBytes(12).toString('hex')}`;
      reply.setCookie('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });

      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        redirect_uri: `${apiBase()}/api/v1/oauth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'offline',
        prompt: 'consent',
      });

      return reply.redirect(`${GOOGLE_AUTH_URL}?${params}`);
    } catch {
      return reply.status(401).send({ error: 'unauthorized' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  UNLINK / DISCONNECT
  // ═══════════════════════════════════════════════════════════════════════

  fastify.delete<{ Params: { provider: string } }>('/api/v1/oauth/:provider', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).sub;
      const provider = request.params.provider;

      if (!['github', 'google', 'gitlab', 'bitbucket'].includes(provider)) {
        return reply.status(400).send({ error: 'invalid provider' });
      }

      // Prevent unlinking if it's the only auth method (no password set)
      const user = await userService.getById(userId);
      if (!user) return reply.status(404).send({ error: 'user not found' });

      const connectedProviders = await query(
        `SELECT COUNT(*)::int AS n FROM user_oauth_tokens WHERE user_id = $1`,
        [userId]
      );
      const hasPassword = !!user.password_hash;

      if (!hasPassword && connectedProviders.rows[0].n <= 1) {
        return reply.status(400).send({
          error: 'Cannot disconnect your only sign-in method. Set a password first or connect another provider.'
        });
      }

      await query(`DELETE FROM user_oauth_tokens WHERE user_id = $1 AND provider = $2`, [userId, provider]);

      // Clear provider ID on user table
      if (provider === 'github') {
        await query(`UPDATE users SET github_id = NULL, github_username = NULL WHERE id = $1`, [userId]);
      } else if (provider === 'google') {
        await query(`UPDATE users SET google_id = NULL WHERE id = $1`, [userId]);
      }

      await auditLog(null, userId, 'auth.oauth_unlinked', 'user', userId, { provider });
      logger.info('oauth provider unlinked', { userId, provider });

      return reply.send({ ok: true, message: `${provider} disconnected` });
    } catch {
      return reply.status(401).send({ error: 'unauthorized' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  CONNECTED ACCOUNTS LIST
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get('/api/v1/oauth/accounts', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).sub;

      const tokens = await query(
        `SELECT provider, scope, created_at, updated_at FROM user_oauth_tokens WHERE user_id = $1 ORDER BY created_at`,
        [userId]
      );

      const user = await userService.getById(userId);

      return reply.send({
        has_password: !!user?.password_hash,
        providers: tokens.rows.map((t) => ({
          provider: t.provider,
          connected: true,
          scope: t.scope,
          connected_at: t.created_at,
          ...(t.provider === 'github' && user?.github_username ? { username: user.github_username } : {}),
        })),
        available: ['github', 'google'].filter((p) => !tokens.rows.some((t) => t.provider === p)),
      });
    } catch {
      return reply.status(401).send({ error: 'unauthorized' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  GITHUB REPO IMPORT
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get('/api/v1/oauth/github/repos', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).sub;

      const tokenRes = await query(
        `SELECT access_token_encrypted FROM user_oauth_tokens WHERE user_id = $1 AND provider = 'github'`,
        [userId]
      );
      if (!tokenRes.rows[0]) {
        return reply.status(404).send({ error: 'GitHub not connected. Connect GitHub first.', action: 'connect_github' });
      }

      let accessToken: string;
      try {
        accessToken = decrypt(tokenRes.rows[0].access_token_encrypted);
      } catch {
        // Fallback for tokens stored with old base64 encoding
        accessToken = Buffer.from(tokenRes.rows[0].access_token_encrypted, 'base64').toString();
      }

      // Fetch repos (sorted by recently updated)
      const page = ((request.query as any).page ?? '1');
      const reposRes = await fetch(
        `${GITHUB_API}/user/repos?sort=updated&direction=desc&per_page=30&page=${page}&type=all`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!reposRes.ok) {
        if (reposRes.status === 401) {
          // Token expired or revoked
          return reply.status(401).send({ error: 'GitHub token expired. Please reconnect GitHub.', action: 'reconnect_github' });
        }
        return reply.status(502).send({ error: 'GitHub API error' });
      }

      const repos = await reposRes.json() as any[];

      return reply.send(
        repos.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          name: r.name,
          owner: r.owner?.login,
          private: r.private,
          default_branch: r.default_branch,
          language: r.language,
          description: r.description,
          updated_at: r.updated_at,
          clone_url: r.clone_url,
          html_url: r.html_url,
          stargazers_count: r.stargazers_count,
          fork: r.fork,
        }))
      );
    } catch (err) {
      logger.error('github repos', err);
      return reply.status(500).send({ error: 'failed to fetch repos' });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function findOrCreateFromOAuth(args: {
  email: string;
  provider: 'github' | 'google';
  providerId: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  providerUsername: string | null;
}): Promise<{ user: any; teamId: string }> {
  // Check if user exists by email
  let user = await userService.getByEmail(args.email);
  let teamId: string;

  if (user) {
    // Link provider to existing user
    if (args.provider === 'github') {
      await query(
        `UPDATE users SET github_id = $1, github_username = $2, avatar_url = COALESCE(avatar_url, $3), updated_at = now() WHERE id = $4`,
        [args.providerId, args.providerUsername, args.avatarUrl, user.id]
      );
    } else if (args.provider === 'google') {
      await query(
        `UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = now() WHERE id = $3`,
        [args.providerId, args.avatarUrl, user.id]
      );
    }

    const teams = await userService.teamsForUser(user.id);
    teamId = teams[0]?.id;

    if (!teamId) {
      // Edge case: user exists but no team — create personal team
      const result = await userService.register({
        email: args.email,
        username: args.username,
        password: crypto.randomBytes(32).toString('hex'),
        fullName: args.fullName,
      });
      teamId = result.teamId;
    }

    logger.info('oauth: linked to existing user', { userId: user.id, provider: args.provider });
  } else {
    // Create new user + personal team
    // Ensure unique username
    let username = args.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60);
    const existing = await query(`SELECT 1 FROM users WHERE username = $1`, [username]);
    if (existing.rowCount) {
      username = `${username}${crypto.randomBytes(3).toString('hex')}`;
    }

    const result = await userService.register({
      email: args.email,
      username,
      password: crypto.randomBytes(32).toString('hex'), // random; user signs in via OAuth
      fullName: args.fullName,
    });

    user = result.user;
    teamId = result.teamId;

    // Set provider IDs + avatar
    if (args.provider === 'github') {
      await query(
        `UPDATE users SET github_id = $1, github_username = $2, avatar_url = $3, status = 'active', email_verified = true WHERE id = $4`,
        [args.providerId, args.providerUsername, args.avatarUrl, user.id]
      );
    } else if (args.provider === 'google') {
      await query(
        `UPDATE users SET google_id = $1, avatar_url = $2, status = 'active', email_verified = true WHERE id = $3`,
        [args.providerId, args.avatarUrl, user.id]
      );
    }

    logger.info('oauth: created new user', { userId: user.id, provider: args.provider, email: args.email });
  }

  // Refresh user object with updated fields
  user = await userService.getById(user.id);
  return { user, teamId };
}

async function storeOAuthToken(userId: string, provider: string, tokenData: any): Promise<void> {
  await query(
    `INSERT INTO user_oauth_tokens (user_id, provider, access_token_encrypted, refresh_token_encrypted, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       scope = EXCLUDED.scope,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()`,
    [
      userId,
      provider,
      encrypt(tokenData.access_token),
      tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
      tokenData.scope ?? null,
      tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    ]
  );
}

async function auditLog(
  teamId: string | null,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, any>
): Promise<void> {
  await query(
    `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, 'user', $3, $4, $5, $6)`,
    [teamId, actorId, action, resourceType, resourceId, JSON.stringify(metadata)]
  );
}
