import { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { dockerEngine } from '../engine/dockerEngine.js';
import { emailService } from '../services/emailService.js';
import { storageService } from '../services/storageService.js';
import { logger } from '../utils/logger.js';
import os from 'os';

/**
 * Admin Super Console — internal platform operator dashboard.
 *
 * This is NOT the customer console. This is for Flame Core operators only.
 * All routes require `role = 'admin'`.
 *
 * Provides:
 *  - All deployments across all teams
 *  - All users/teams with suspend/unsuspend
 *  - Container management (restart, stop, delete)
 *  - Runtime logs for any deployment
 *  - Worker health & queue status
 *  - System metrics (CPU/RAM/disk)
 *  - Billing overview
 *  - Security/abuse events
 *  - SSL/domain overview
 *  - SMTP configuration
 *  - Object storage configuration
 */

async function requireAdmin(request: any, reply: any) {
  await request.jwtVerify();
  const userId = (request.user as any).sub;
  const r = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
  if (!r.rows[0] || r.rows[0].role !== 'admin') {
    return reply.status(403).send({ error: 'admin access required' });
  }
}

export async function registerAdminSuperRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/v1/super/')) {
      await requireAdmin(request, reply);
    }
  });

  // ─── System overview ─────────────────────────────────────────────────
  fastify.get('/api/v1/super/system', async (_req, reply) => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = os.uptime();
    const loadAvg = os.loadavg();

    // Disk usage
    let diskInfo = { total: 0, used: 0, free: 0 };
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const { stdout } = await promisify(exec)("df -B1 / | tail -1 | awk '{print $2,$3,$4}'");
      const [total, used, free] = stdout.trim().split(' ').map(Number);
      diskInfo = { total, used, free };
    } catch { /* ignore */ }

    // Docker stats
    let dockerContainers = 0;
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const { stdout } = await promisify(exec)('docker ps --filter "name=flame-" --format "{{.ID}}" | wc -l');
      dockerContainers = parseInt(stdout.trim());
    } catch { /* ignore */ }

    // Database stats
    const [users, teams, projects, deployments, domains] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM users`),
      query(`SELECT COUNT(*)::int AS n FROM teams`),
      query(`SELECT COUNT(*)::int AS n FROM projects WHERE status = 'active'`),
      query(`SELECT COUNT(*)::int AS n FROM deployments WHERE status IN ('ready','healthy','building','queued')`),
      query(`SELECT COUNT(*)::int AS n FROM domains WHERE verified = true`),
    ]);

    return reply.send({
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: cpus.length,
        cpu_model: cpus[0]?.model,
        total_memory_bytes: totalMem,
        free_memory_bytes: freeMem,
        memory_usage_pct: ((totalMem - freeMem) / totalMem * 100).toFixed(1),
        uptime_seconds: uptime,
        load_avg: loadAvg,
        disk: diskInfo,
      },
      docker: {
        running_containers: dockerContainers,
      },
      database: {
        users: users.rows[0].n,
        teams: teams.rows[0].n,
        active_projects: projects.rows[0].n,
        active_deployments: deployments.rows[0].n,
        verified_domains: domains.rows[0].n,
      },
    });
  });

  // ─── All deployments (with full details) ─────────────────────────────
  fastify.get('/api/v1/super/deployments', async (req, reply) => {
    const { status, region, limit = '100' } = req.query as any;
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (status) { params.push(status); where += ` AND d.status = $${params.length}`; }
    if (region) { params.push(region); where += ` AND d.region = $${params.length}`; }

    params.push(parseInt(limit));
    const r = await query(
      `SELECT d.*, p.name AS project_name, p.repo_url, t.slug AS team_slug, u.email AS user_email
         FROM deployments d
         LEFT JOIN projects p ON p.id = d.project_id
         LEFT JOIN teams t ON t.id = d.team_id
         LEFT JOIN users u ON u.id = d.triggered_by
        ${where}
        ORDER BY d.created_at DESC LIMIT $${params.length}`,
      params
    );
    return reply.send(r.rows);
  });

  // ─── All users (with teams) ──────────────────────────────────────────
  fastify.get('/api/v1/super/users', async (_req, reply) => {
    const r = await query(
      `SELECT u.id, u.email, u.username, u.full_name, u.role, u.status,
              u.country_code, u.preferred_currency, u.github_username, u.google_id,
              u.email_verified, u.mfa_enabled, u.last_login_at, u.created_at,
              COALESCE(json_agg(json_build_object('id', t.id, 'slug', t.slug, 'name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]') AS teams
         FROM users u
         LEFT JOIN team_members tm ON tm.user_id = u.id
         LEFT JOIN teams t ON t.id = tm.team_id
        GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`
    );
    return reply.send(r.rows);
  });

  // ─── Container management ────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/api/v1/super/deployments/:id/restart', async (req, reply) => {
    const containerName = `flame-${req.params.id}`;
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      await promisify(exec)(`docker restart ${containerName}`);
      logger.info('admin: container restarted', { deployment: req.params.id, admin: (req.user as any).sub });
      return reply.send({ ok: true, action: 'restarted' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post<{ Params: { id: string } }>('/api/v1/super/deployments/:id/stop', async (req, reply) => {
    const containerName = `flame-${req.params.id}`;
    await dockerEngine.stopContainer(containerName);
    await query(`UPDATE deployments SET status = 'stopped' WHERE id = $1`, [req.params.id]);
    logger.info('admin: container stopped', { deployment: req.params.id });
    return reply.send({ ok: true, action: 'stopped' });
  });

  fastify.delete<{ Params: { id: string } }>('/api/v1/super/deployments/:id', async (req, reply) => {
    const containerName = `flame-${req.params.id}`;
    await dockerEngine.removeContainer(containerName);
    await query(`UPDATE deployments SET status = 'stopped' WHERE id = $1`, [req.params.id]);
    logger.info('admin: container deleted', { deployment: req.params.id });
    return reply.send({ ok: true, action: 'deleted' });
  });

  // ─── Container logs ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/api/v1/super/deployments/:id/logs', async (req, reply) => {
    const containerName = `flame-${req.params.id}`;
    const logs = await dockerEngine.getContainerLogs(containerName);
    return reply.send({ logs });
  });

  // ─── Suspend/unsuspend team ──────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/api/v1/super/teams/:id/suspend', async (req, reply) => {
    const { id } = req.params;
    // Suspend all team members
    await query(`UPDATE users SET status = 'suspended' WHERE id IN (SELECT user_id FROM team_members WHERE team_id = $1)`, [id]);
    // Stop all team deployments
    const deps = await query(`SELECT id FROM deployments WHERE team_id = $1 AND status IN ('ready','healthy','building','queued')`, [id]);
    for (const dep of deps.rows) {
      await dockerEngine.stopContainer(`flame-${dep.id}`);
      await query(`UPDATE deployments SET status = 'stopped' WHERE id = $1`, [dep.id]);
    }
    logger.info('admin: team suspended', { team: id, deployments_stopped: deps.rowCount });
    return reply.send({ ok: true, deployments_stopped: deps.rowCount });
  });

  // ─── Worker & queue health ───────────────────────────────────────────
  fastify.get('/api/v1/super/workers', async (_req, reply) => {
    const pendingJobs = await query(
      `SELECT COUNT(*)::int AS n FROM deployments WHERE status IN ('queued','cloning','building','provisioning')`
    );
    const recentFailed = await query(
      `SELECT COUNT(*)::int AS n FROM deployments WHERE status = 'failed' AND created_at > now() - interval '24 hours'`
    );
    const recentSuccess = await query(
      `SELECT COUNT(*)::int AS n FROM deployments WHERE status = 'ready' AND created_at > now() - interval '24 hours'`
    );
    const avgDuration = await query(
      `SELECT AVG(duration_ms)::int AS avg FROM deployments WHERE status = 'ready' AND duration_ms IS NOT NULL AND created_at > now() - interval '7 days'`
    );

    return reply.send({
      queue: { pending: pendingJobs.rows[0].n },
      last_24h: { successful: recentSuccess.rows[0].n, failed: recentFailed.rows[0].n },
      avg_build_duration_ms: avgDuration.rows[0].avg || 0,
    });
  });

  // ─── Billing overview ────────────────────────────────────────────────
  fastify.get('/api/v1/super/billing', async (_req, reply) => {
    const [mrr, byCurrency, byProvider, overdue] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount_usd_minor),0)::bigint AS usd FROM invoices WHERE status = 'paid' AND created_at >= date_trunc('month', now())`),
      query(`SELECT currency, COUNT(*)::int AS n, SUM(amount_minor)::bigint AS total FROM invoices WHERE status = 'paid' GROUP BY currency`),
      query(`SELECT payment_provider, COUNT(*)::int AS n FROM invoices WHERE status = 'paid' AND payment_provider IS NOT NULL GROUP BY payment_provider`),
      query(`SELECT COUNT(*)::int AS n FROM invoices WHERE status = 'pending' AND due_at < now()`),
    ]);
    return reply.send({
      mrr_usd_cents: Number(mrr.rows[0].usd),
      by_currency: byCurrency.rows,
      by_provider: byProvider.rows,
      overdue_invoices: overdue.rows[0].n,
    });
  });

  // ─── Security & abuse events ─────────────────────────────────────────
  fastify.get('/api/v1/super/security', async (req, reply) => {
    const { limit = '100' } = req.query as any;
    const r = await query(
      `SELECT al.*, u.email AS actor_email
         FROM audit_logs al
         LEFT JOIN users u ON u.id::text = al.actor_id::text
        WHERE al.action IN (
          'auth.login_failed', 'deployment.crash_loop', 'deployment.auto_restarted',
          'rate_limit.hit', 'abuse.detected', 'deployment.sleeping'
        )
        ORDER BY al.created_at DESC LIMIT $1`,
      [parseInt(limit)]
    );
    return reply.send(r.rows);
  });

  // ─── SSL/Domain overview ─────────────────────────────────────────────
  fastify.get('/api/v1/super/domains', async (_req, reply) => {
    const r = await query(
      `SELECT d.domain, d.type, d.verified, d.ssl_status, d.ssl_provider, d.ssl_expires_at,
              t.slug AS team_slug, p.name AS project_name
         FROM domains d
         LEFT JOIN teams t ON t.id = d.team_id
         LEFT JOIN projects p ON p.id = d.project_id
        ORDER BY d.created_at DESC LIMIT 200`
    );
    const expiringSoon = await query(
      `SELECT COUNT(*)::int AS n FROM domains WHERE ssl_expires_at < now() + interval '14 days' AND ssl_status = 'active'`
    );
    return reply.send({ domains: r.rows, ssl_expiring_soon: expiringSoon.rows[0].n });
  });

  // ─── Regions overview ────────────────────────────────────────────────
  fastify.get('/api/v1/super/regions', async (_req, reply) => {
    const r = await query(
      `SELECT r.*, 
              (SELECT COUNT(*)::int FROM deployments d WHERE d.region = r.code AND d.status IN ('ready','healthy')) AS active_deployments
         FROM regions r ORDER BY r.code`
    );
    return reply.send(r.rows);
  });

  // ─── SMTP / Email configuration ─────────────────────────────────────
  fastify.get('/api/v1/super/settings/smtp', async (_req, reply) => {
    const settings = await emailService.getSmtpSettings();
    return reply.send(settings);
  });

  fastify.put('/api/v1/super/settings/smtp', async (req, reply) => {
    const userId = (req.user as any).sub;
    await emailService.updateSmtpSettings(req.body as any, userId);
    return reply.send({ ok: true });
  });

  fastify.post('/api/v1/super/settings/smtp/test', async (_req, reply) => {
    const result = await emailService.testConnection();
    return reply.send(result);
  });

  // ─── Storage dashboard / health ──────────────────────────────────────
  fastify.get('/api/v1/super/storage', async (_req, reply) => {
    const dashboard = await storageService.storageDashboard();
    return reply.send(dashboard);
  });

  fastify.get('/api/v1/super/storage/team/:teamId', async (req, reply) => {
    const { teamId } = req.params as any;
    const usage = await query(
      `SELECT * FROM storage_objects WHERE team_id = $1 AND status IN ('pending','ready') ORDER BY size_bytes DESC LIMIT 200`,
      [teamId]
    );
    return reply.send(usage.rows);
  });

  // ─── Object storage configuration ───────────────────────────────────
  fastify.get('/api/v1/super/settings/storage', async (_req, reply) => {
    const r = await query(`SELECT key, CASE WHEN encrypted THEN '••••••••' ELSE value END AS value FROM platform_settings WHERE key LIKE 'storage.%'`);
    const settings: Record<string, string> = {};
    for (const row of r.rows) settings[row.key.replace('storage.', '')] = row.value;
    return reply.send(settings);
  });

  fastify.put('/api/v1/super/settings/storage', async (req, reply) => {
    const userId = (req.user as any).sub;
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      await query(
        `INSERT INTO platform_settings (key, value, encrypted, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $4, updated_at = now()`,
        [`storage.${key}`, value, key.includes('secret') || key.includes('key'), userId]
      );
    }
    return reply.send({ ok: true });
  });

  // ─── Email outbox ────────────────────────────────────────────────────
  fastify.get('/api/v1/super/emails', async (req, reply) => {
    const { status, limit = '50' } = req.query as any;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    params.push(parseInt(limit));
    const r = await query(
      `SELECT id, to_email, subject, template, status, attempts, error_message, sent_at, created_at
         FROM email_outbox ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return reply.send(r.rows);
  });

  // ─── Metrics (Prometheus-ready) ──────────────────────────────────────
  fastify.get('/api/v1/super/metrics', async (_req, reply) => {
    const [depStats, userStats, queueStats] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS n FROM deployments GROUP BY status`),
      query(`SELECT status, COUNT(*)::int AS n FROM users GROUP BY status`),
      query(`SELECT 
        (SELECT COUNT(*)::int FROM deployments WHERE status IN ('queued','building')) AS in_flight,
        (SELECT COUNT(*)::int FROM deployments WHERE status = 'failed' AND created_at > now() - interval '1 hour') AS failed_1h,
        (SELECT AVG(duration_ms)::int FROM deployments WHERE status = 'ready' AND created_at > now() - interval '1 hour') AS avg_build_ms`),
    ]);

    // Prometheus text format
    const lines: string[] = [
      '# HELP flamecore_deployments_total Total deployments by status',
      '# TYPE flamecore_deployments_total gauge',
    ];
    for (const row of depStats.rows) {
      lines.push(`flamecore_deployments_total{status="${row.status}"} ${row.n}`);
    }
    lines.push('# HELP flamecore_users_total Total users by status');
    lines.push('# TYPE flamecore_users_total gauge');
    for (const row of userStats.rows) {
      lines.push(`flamecore_users_total{status="${row.status}"} ${row.n}`);
    }
    lines.push(`# HELP flamecore_builds_in_flight Current builds in flight`);
    lines.push(`# TYPE flamecore_builds_in_flight gauge`);
    lines.push(`flamecore_builds_in_flight ${queueStats.rows[0].in_flight}`);
    lines.push(`# HELP flamecore_builds_failed_1h Builds failed in last hour`);
    lines.push(`# TYPE flamecore_builds_failed_1h gauge`);
    lines.push(`flamecore_builds_failed_1h ${queueStats.rows[0].failed_1h}`);
    lines.push(`# HELP flamecore_avg_build_ms Average build duration in ms`);
    lines.push(`# TYPE flamecore_avg_build_ms gauge`);
    lines.push(`flamecore_avg_build_ms ${queueStats.rows[0].avg_build_ms || 0}`);

    // System metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    lines.push(`# HELP node_memory_usage_bytes Memory usage`);
    lines.push(`# TYPE node_memory_usage_bytes gauge`);
    lines.push(`node_memory_usage_bytes ${totalMem - freeMem}`);
    lines.push(`# HELP node_cpu_load_avg CPU load average (1min)`);
    lines.push(`# TYPE node_cpu_load_avg gauge`);
    lines.push(`node_cpu_load_avg ${os.loadavg()[0]}`);

    reply.header('Content-Type', 'text/plain; charset=utf-8');
    return reply.send(lines.join('\n') + '\n');
  });
}
