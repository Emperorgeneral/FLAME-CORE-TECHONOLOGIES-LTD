import { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/**
 * Admin (platform operator) routes.
 *
 * All metrics are currency-aware — we aggregate in USD (the canonical
 * accounting currency) but optionally surface a localised total too.
 */
export async function registerAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/admin')) {
      await request.jwtVerify();
      const userId = (request.user as any).sub;
      const r = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
      if (!r.rows[0] || r.rows[0].role !== 'admin') {
        throw fastify.httpErrors?.forbidden?.('admin only') ?? new Error('forbidden');
      }
    }
  });

  fastify.get('/api/admin/stats', async (_req, reply) => {
    const [users, teams, projects, deps, mrr, regions] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM users WHERE status = 'active'`),
      query(`SELECT COUNT(*)::int AS n FROM teams`),
      query(`SELECT COUNT(*)::int AS n FROM projects WHERE status = 'active'`),
      query(`SELECT COUNT(*)::int AS n FROM deployments WHERE status = 'ready'`),
      query(`SELECT COALESCE(SUM(amount_usd_minor),0)::bigint AS usd_minor
               FROM invoices
              WHERE status = 'paid'
                AND created_at >= date_trunc('month', now())`),
      query(`SELECT code, city, status, capacity_pct FROM regions ORDER BY status DESC, code`),
    ]);

    return reply.send({
      users_active: users.rows[0].n,
      teams: teams.rows[0].n,
      projects_active: projects.rows[0].n,
      deployments_ready: deps.rows[0].n,
      mrr_usd_cents: Number(mrr.rows[0].usd_minor),
      regions: regions.rows,
    });
  });

  fastify.get('/api/admin/users', async (_req, reply) => {
    const r = await query(
      `SELECT id, email, username, full_name, role, status,
              country_code, preferred_currency, preferred_region, last_login_at, created_at
         FROM users ORDER BY created_at DESC LIMIT 200`
    );
    return reply.send(r.rows);
  });

  fastify.get('/api/admin/deployments', async (_req, reply) => {
    const r = await query(
      `SELECT d.id, d.status, d.region, d.deployment_url, d.commit_hash, d.commit_message,
              d.created_at, d.duration_ms,
              p.name AS project_name, p.slug AS project_slug,
              t.slug AS team_slug
         FROM deployments d
         JOIN projects p ON p.id = d.project_id
         JOIN teams t ON t.id = d.team_id
        ORDER BY d.created_at DESC LIMIT 200`
    );
    return reply.send(r.rows);
  });

  fastify.get('/api/admin/revenue', async (_req, reply) => {
    const byCurrency = await query(
      `SELECT currency,
              COUNT(*)::int      AS invoices,
              SUM(amount_minor)::bigint     AS local_minor,
              SUM(amount_usd_minor)::bigint AS usd_minor
         FROM invoices
        WHERE status = 'paid'
        GROUP BY currency
        ORDER BY usd_minor DESC`
    );
    const byProvider = await query(
      `SELECT payment_provider,
              COUNT(*)::int      AS invoices,
              SUM(amount_usd_minor)::bigint AS usd_minor
         FROM invoices
        WHERE status = 'paid' AND payment_provider IS NOT NULL
        GROUP BY payment_provider`
    );
    return reply.send({ by_currency: byCurrency.rows, by_provider: byProvider.rows });
  });

  fastify.post<{ Params: { userId: string }; Body: { status?: string } }>(
    '/api/admin/users/:userId/status',
    async (req, reply) => {
      const { userId } = req.params;
      const { status } = req.body;
      if (!['active', 'suspended', 'pending'].includes(status ?? '')) {
        return reply.status(400).send({ error: 'invalid status' });
      }
      await query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2`, [status, userId]);
      logger.info('admin: user status changed', { userId, status });
      return reply.send({ ok: true });
    }
  );
}
