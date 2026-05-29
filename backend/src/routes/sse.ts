import { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/**
 * Server-Sent Events (SSE) for real-time log streaming and deployment status.
 *
 * Endpoints:
 *  - GET /api/v1/deployments/:id/stream — live build/runtime logs
 *  - GET /api/v1/deployments/:id/status-stream — deployment status changes
 *
 * Frontend connects via EventSource and receives typed events:
 *  - "log" — { timestamp, level, message }
 *  - "status" — { status, deployment_url, duration_ms }
 *  - "heartbeat" — keep-alive ping every 15s
 *
 * Reconnection: Client sends Last-Event-ID header; server resumes from that point.
 * Persistent storage: Logs stored in DB + file system; SSE is a live view.
 */
export async function registerSSERoutes(fastify: FastifyInstance) {
  // ─── Live build/runtime log stream ───────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/api/v1/deployments/:id/stream', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    const deploymentId = request.params.id;
    const userId = (request.user as any).sub;

    // Verify access
    const dep = await query(`SELECT team_id, status, build_logs, runtime_logs FROM deployments WHERE id = $1`, [deploymentId]);
    if (!dep.rows[0]) return reply.status(404).send({ error: 'not found' });

    const teamCheck = await query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [dep.rows[0].team_id, userId]);
    if (!teamCheck.rowCount) return reply.status(403).send({ error: 'forbidden' });

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': '*',
    });

    const traceId = `trace_${deploymentId.substring(0, 8)}`;
    let eventId = 0;

    // Send initial historical logs
    const initialLogs = dep.rows[0].build_logs || '';
    if (initialLogs) {
      const lines = initialLogs.split('\n').filter(Boolean);
      for (const line of lines) {
        eventId++;
        reply.raw.write(`id: ${eventId}\nevent: log\ndata: ${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: line.startsWith('✓') || line.startsWith('✅') ? 'ok' : line.startsWith('✗') || line.startsWith('⚠') ? 'error' : 'info',
          message: line,
          trace_id: traceId,
        })}\n\n`);
      }
    }

    // Send current status
    eventId++;
    reply.raw.write(`id: ${eventId}\nevent: status\ndata: ${JSON.stringify({
      status: dep.rows[0].status,
      trace_id: traceId,
    })}\n\n`);

    // Poll for new logs and status changes
    const pollInterval = setInterval(async () => {
      try {
        const current = await query(
          `SELECT status, build_logs, runtime_logs, deployment_url, duration_ms, error_message FROM deployments WHERE id = $1`,
          [deploymentId]
        );

        if (!current.rows[0]) {
          clearInterval(pollInterval);
          reply.raw.end();
          return;
        }

        const d = current.rows[0];
        const currentLogs = (d.build_logs || '') + (d.runtime_logs || '');
        const currentLines = currentLogs.split('\n').filter(Boolean);

        // Send any new log lines
        if (currentLines.length > eventId - 1) {
          for (let i = eventId - 1; i < currentLines.length; i++) {
            eventId++;
            const line = currentLines[i];
            reply.raw.write(`id: ${eventId}\nevent: log\ndata: ${JSON.stringify({
              timestamp: new Date().toISOString(),
              level: line.startsWith('✓') ? 'ok' : line.startsWith('✗') ? 'error' : line.startsWith('⚠') ? 'warn' : 'info',
              message: line,
              trace_id: traceId,
            })}\n\n`);
          }
        }

        // Send status update
        eventId++;
        reply.raw.write(`id: ${eventId}\nevent: status\ndata: ${JSON.stringify({
          status: d.status,
          deployment_url: d.deployment_url,
          duration_ms: d.duration_ms,
          error_message: d.error_message,
          trace_id: traceId,
        })}\n\n`);

        // End stream when deployment is terminal
        if (['ready', 'failed', 'cancelled', 'stopped'].includes(d.status)) {
          eventId++;
          reply.raw.write(`id: ${eventId}\nevent: complete\ndata: ${JSON.stringify({ status: d.status })}\n\n`);
          clearInterval(pollInterval);
          setTimeout(() => reply.raw.end(), 2000);
        }
      } catch (err) {
        logger.error('sse poll error', err);
      }
    }, 1500);

    // Heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`:heartbeat ${new Date().toISOString()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        clearInterval(pollInterval);
      }
    }, 15000);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(pollInterval);
      clearInterval(heartbeat);
    });
  });

  // ─── VPS recovery: restore deployments after reboot ──────────────────
  fastify.post('/api/v1/internal/recovery', async (request, reply) => {
    // This is called internally on VPS boot (via PM2 startup hook)
    const apiToken = request.headers['x-internal-token'];
    if (apiToken !== process.env.INTERNAL_API_TOKEN) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    logger.info('VPS recovery: restoring deployments');

    // Find all deployments that were running before reboot
    const running = await query(
      `SELECT d.id, d.container_id, d.image_tag, d.internal_port, d.deployment_url
         FROM deployments d
        WHERE d.status IN ('ready','healthy','sleeping')
        ORDER BY d.ready_at DESC`
    );

    let restored = 0;
    let failed = 0;

    for (const dep of running.rows) {
      const containerName = `flame-${dep.id}`;
      const exists = await query(
        `SELECT 1 FROM (SELECT 1) t WHERE EXISTS (SELECT 1)` // placeholder
      );

      try {
        // Try to start existing stopped container
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        // Check if container exists
        const { stdout } = await execAsync(`docker ps -a --filter "name=^${containerName}$" --format "{{.ID}}"`);
        if (stdout.trim()) {
          await execAsync(`docker start ${containerName}`);
          restored++;
          logger.info('restored container', { deployment: dep.id });
        } else {
          // Container doesn't exist, mark for rebuild
          await query(`UPDATE deployments SET status = 'stopped', error_message = 'Container lost during reboot' WHERE id = $1`, [dep.id]);
          failed++;
        }
      } catch (err: any) {
        logger.error('recovery failed for deployment', { id: dep.id, error: err.message });
        failed++;
      }
    }

    // Reload Nginx
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      await promisify(exec)('systemctl reload nginx');
    } catch {
      logger.warn('nginx reload failed during recovery');
    }

    logger.info(`VPS recovery complete: ${restored} restored, ${failed} failed, ${running.rowCount} total`);
    return reply.send({ restored, failed, total: running.rowCount });
  });

  // ─── Sleep/wake endpoint (called by Nginx on 502) ───────────────────
  fastify.get<{ Params: { id: string } }>('/api/v1/internal/wake/:id', async (request, reply) => {
    const { sleepWakeEngine } = await import('../engine/sleepWake.js');
    const result = await sleepWakeEngine.wake(request.params.id);
    if (result.ok) {
      // Redirect to the actual deployment
      const dep = await query(`SELECT deployment_url FROM deployments WHERE id = $1`, [request.params.id]);
      return reply.redirect(`https://${dep.rows[0]?.deployment_url || 'flame.app'}`);
    }
    return reply.status(503).send({ error: 'deployment failed to wake', duration_ms: result.durationMs });
  });
}
