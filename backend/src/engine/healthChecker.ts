import { query } from '../db/pool.js';
import { dockerEngine } from './dockerEngine.js';
import { logger } from '../utils/logger.js';

/**
 * Health check engine.
 *
 * - Configurable per-deployment health probes (path, interval, thresholds)
 * - Auto-restarts unhealthy containers (with crash loop protection)
 * - Port validation on startup
 * - Deployment readiness detection
 * - Reports status to DB for frontend display
 */
export const healthChecker = {
  /** Run health checks for all active deployments. Called by a worker interval. */
  async runAll(): Promise<void> {
    const checks = await query(
      `SELECT hc.*, d.container_id, d.internal_port, d.deployment_url, d.status as deploy_status
         FROM health_checks hc
         JOIN deployments d ON d.id = hc.deployment_id
        WHERE d.status IN ('ready','healthy') AND hc.current_status != 'unknown'
           OR (d.status = 'ready' AND hc.last_check_at IS NULL)
        ORDER BY hc.last_check_at ASC NULLS FIRST
        LIMIT 50`
    );

    for (const check of checks.rows) {
      await this.runSingle(check);
    }
  },

  async runSingle(check: any): Promise<void> {
    const start = Date.now();
    let statusCode = 0;
    let healthy = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), check.timeout_ms);

      const res = await fetch(`http://localhost:${check.internal_port}${check.path}`, {
        method: check.method,
        signal: controller.signal,
        headers: { 'User-Agent': 'FlameCore-HealthCheck/1.0' },
      });

      clearTimeout(timeout);
      statusCode = res.status;
      healthy = statusCode >= 200 && statusCode < 400;
    } catch (err: any) {
      // Connection refused, timeout, etc.
      healthy = false;
      statusCode = 0;
    }

    const latency = Date.now() - start;

    if (healthy) {
      await query(
        `UPDATE health_checks SET
           current_status = 'healthy',
           last_check_at = now(),
           last_status_code = $2,
           consecutive_failures = 0
         WHERE id = $1`,
        [check.id, statusCode]
      );
    } else {
      const failures = (check.consecutive_failures || 0) + 1;
      const newStatus = failures >= check.unhealthy_threshold ? 'unhealthy' : 'degraded';

      await query(
        `UPDATE health_checks SET
           current_status = $2,
           last_check_at = now(),
           last_status_code = $3,
           consecutive_failures = $4
         WHERE id = $1`,
        [check.id, newStatus, statusCode, failures]
      );

      if (newStatus === 'unhealthy') {
        logger.warn('deployment unhealthy — attempting restart', {
          deployment: check.deployment_id,
          failures,
          statusCode,
          latency,
        });
        await this.handleUnhealthy(check);
      }
    }
  },

  /** Handle an unhealthy deployment — restart with crash loop protection. */
  async handleUnhealthy(check: any): Promise<void> {
    const containerName = `flame-${check.deployment_id}`;

    // Crash loop protection: check how many restarts in last 10 min
    const recentRestarts = await query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE resource_type = 'deployment' AND resource_id = $1
          AND action = 'deployment.auto_restarted'
          AND created_at > now() - interval '10 minutes'`,
      [check.deployment_id]
    );

    if (recentRestarts.rows[0].n >= 3) {
      logger.error('crash loop detected — suspending deployment', {
        deployment: check.deployment_id,
        restarts: recentRestarts.rows[0].n,
      });

      await query(
        `UPDATE deployments SET status = 'stopped', error_message = 'Crash loop detected — auto-suspended' WHERE id = $1`,
        [check.deployment_id]
      );

      // Audit log
      await query(
        `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
         VALUES ((SELECT team_id FROM deployments WHERE id = $1), NULL, 'system', 'deployment.crash_loop', 'deployment', $1, $2)`,
        [check.deployment_id, JSON.stringify({ consecutive_failures: check.consecutive_failures })]
      );
      return;
    }

    // Restart the container
    try {
      await dockerEngine.stopContainer(containerName);
      const result = await dockerEngine.startContainer(
        `flame-${check.deployment_id}`,
        containerName,
        check.internal_port,
        {} // env vars re-read from DB
      );

      if (result.success) {
        logger.info('deployment auto-restarted', { deployment: check.deployment_id });
        await query(
          `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
           VALUES ((SELECT team_id FROM deployments WHERE id = $1), NULL, 'system', 'deployment.auto_restarted', 'deployment', $1, '{}')`,
          [check.deployment_id]
        );
      }
    } catch (err: any) {
      logger.error('auto-restart failed', { deployment: check.deployment_id, error: err.message });
    }
  },

  /** Create a default health check for a new deployment. */
  async createDefault(deploymentId: string, path = '/', interval = 30): Promise<void> {
    await query(
      `INSERT INTO health_checks (deployment_id, path, interval_seconds, current_status)
       VALUES ($1, $2, $3, 'unknown')
       ON CONFLICT DO NOTHING`,
      [deploymentId, path, interval]
    );
  },

  /** Wait for a deployment to become healthy (startup check). */
  async waitForReady(deploymentId: string, port: number, timeoutMs = 60000): Promise<boolean> {
    const start = Date.now();
    const interval = 2000;

    while (Date.now() - start < timeoutMs) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`http://localhost:${port}/`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'FlameCore-StartupCheck/1.0' },
        });
        clearTimeout(t);
        if (res.status >= 200 && res.status < 500) {
          logger.info('deployment ready', { deployment: deploymentId, latency: Date.now() - start });
          return true;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    logger.warn('deployment startup timeout', { deployment: deploymentId, timeout: timeoutMs });
    return false;
  },
};
