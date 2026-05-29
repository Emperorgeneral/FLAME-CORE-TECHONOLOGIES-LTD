import { query } from '../db/pool.js';
import { dockerEngine } from './dockerEngine.js';
import { logger, createContextLogger } from '../utils/logger.js';
import { decrypt } from '../utils/crypto.js';

/**
 * Sleep/Wake system for Hobby-tier deployments.
 *
 * - Containers auto-sleep after configurable idle timeout (default 30min)
 * - Wake on incoming request (Nginx proxies a 503 page → API wake endpoint)
 * - Request buffering: Nginx holds the connection for up to 15s while container wakes
 * - Warmup handling: health check before routing traffic
 *
 * Nginx config for sleeping deploys:
 *   error_page 502 @wake;
 *   location @wake {
 *     proxy_pass http://localhost:3001/api/v1/internal/wake/<deployment_id>;
 *     proxy_read_timeout 20s;
 *   }
 */
export const sleepWakeEngine = {
  /** Check all hobby-tier deployments for idle timeout. Called every 5 min. */
  async checkIdleDeployments(): Promise<void> {
    // Find running hobby deployments with no recent activity
    const idleDeployments = await query(
      `SELECT d.id, d.container_id, d.internal_port, d.deployment_url
         FROM deployments d
         JOIN projects p ON p.id = d.project_id
         JOIN teams t ON t.id = d.team_id
         JOIN plans pl ON pl.id = t.plan_id
        WHERE d.status = 'ready'
          AND pl.always_on = false
          AND d.ready_at < now() - interval '30 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM health_checks hc
             WHERE hc.deployment_id = d.id
               AND hc.last_check_at > now() - interval '30 minutes'
               AND hc.current_status = 'healthy'
          )`
    );

    for (const dep of idleDeployments.rows) {
      await this.sleep(dep.id, dep.container_id);
    }

    if (idleDeployments.rowCount! > 0) {
      logger.info(`sleep: put ${idleDeployments.rowCount} idle deployments to sleep`);
    }
  },

  /** Put a deployment to sleep — stop the container, keep the image. */
  async sleep(deploymentId: string, containerId?: string): Promise<void> {
    const containerName = `flame-${deploymentId}`;
    try {
      await dockerEngine.stopContainer(containerId || containerName);
      await query(
        `UPDATE deployments SET status = 'sleeping' WHERE id = $1`,
        [deploymentId]
      );
      logger.info('deployment sleeping', { deployment: deploymentId });

      // Audit
      await query(
        `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
         VALUES ((SELECT team_id FROM deployments WHERE id = $1), NULL, 'system', 'deployment.sleeping', 'deployment', $1, '{}')`,
        [deploymentId]
      );
    } catch (err: any) {
      logger.error('sleep failed', { deployment: deploymentId, error: err.message });
    }
  },

  /**
   * Wake a sleeping deployment — restart the container.
   * Returns true when container is healthy and ready to serve.
   * The caller should hold the incoming request until this resolves.
   */
  async wake(deploymentId: string): Promise<{ ok: boolean; durationMs: number }> {
    const start = Date.now();

    const dep = await query(
      `SELECT * FROM deployments WHERE id = $1`,
      [deploymentId]
    );
    if (!dep.rows[0]) return { ok: false, durationMs: 0 };

    const d = dep.rows[0];
    if (d.status !== 'sleeping') {
      return { ok: d.status === 'ready', durationMs: 0 };
    }

    logger.info('waking deployment', { deployment: deploymentId });

    // Update status
    await query(
      `UPDATE deployments SET status = 'starting' WHERE id = $1`,
      [deploymentId]
    );

    // Start container
    const containerName = `flame-${deploymentId}`;
    const imageName = d.image_tag ?? `flame-${deploymentId}:latest`;

    try {
      // Try to start existing stopped container first
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        await execAsync(`docker start ${containerName}`);
      } catch {
        // Container doesn't exist, need to re-run
        const envRes = await query(
          `SELECT key, value_encrypted FROM environment_variables WHERE project_id = (SELECT project_id FROM deployments WHERE id = $1)`,
          [deploymentId]
        );
        const envDict: Record<string, string> = {};
        const log = createContextLogger({ deployment_id: deploymentId });
        for (const row of envRes.rows) {
          try {
            envDict[row.key] = decrypt(row.value_encrypted);
          } catch {
            // Legacy fallback
            try { envDict[row.key] = Buffer.from(row.value_encrypted, 'base64').toString('utf8'); } catch { envDict[row.key] = ''; }
          }
        }
        log.info({ count: Object.keys(envDict).length }, 'env vars decrypted for wake');

        const result = await dockerEngine.startContainer(
          imageName.split(':')[0],
          containerName,
          d.internal_port,
          envDict
        );
        if (!result.success) {
          await query(`UPDATE deployments SET status = 'failed', error_message = 'Wake failed' WHERE id = $1`, [deploymentId]);
          return { ok: false, durationMs: Date.now() - start };
        }
      }

      // Wait for healthy
      const healthy = await waitForPort(d.internal_port, 15000);

      if (healthy) {
        await query(`UPDATE deployments SET status = 'ready', ready_at = now() WHERE id = $1`, [deploymentId]);
        const durationMs = Date.now() - start;
        logger.info('deployment woken', { deployment: deploymentId, durationMs });

        // Audit
        await query(
          `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
           VALUES ($1, NULL, 'system', 'deployment.woken', 'deployment', $2, $3)`,
          [d.team_id, deploymentId, JSON.stringify({ duration_ms: durationMs })]
        );

        return { ok: true, durationMs };
      } else {
        await query(`UPDATE deployments SET status = 'failed', error_message = 'Wake timeout' WHERE id = $1`, [deploymentId]);
        return { ok: false, durationMs: Date.now() - start };
      }
    } catch (err: any) {
      logger.error('wake failed', { deployment: deploymentId, error: err.message });
      await query(`UPDATE deployments SET status = 'failed' WHERE id = $1`, [deploymentId]);
      return { ok: false, durationMs: Date.now() - start };
    }
  },
};

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2000);
      await fetch(`http://localhost:${port}/`, { signal: controller.signal });
      clearTimeout(t);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}
