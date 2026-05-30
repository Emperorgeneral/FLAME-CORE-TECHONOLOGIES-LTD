import { FastifyInstance } from 'fastify';
import { serviceManager } from '../services/serviceManager.js';
import { serviceDefinitionRegistry } from '../services/serviceDefinitionRegistry.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/**
 * Unified Service API.
 *
 * Everything on the platform is a Service: apps, databases, Docker images,
 * templates, empty projects. All share the same CRUD + lifecycle endpoints.
 *
 * Project → [Service, Service, Service]
 * Each service has its own deployments, env vars, logs, domains, metrics.
 */
export async function registerServiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    if (request.url.includes('/services') && !request.url.includes('/connect/')) {
      await request.jwtVerify();
    }
  });

  // ─── Create a service ────────────────────────────────────────────────
  fastify.post<{ Params: { teamId: string; projectId: string } }>(
    '/api/v1/teams/:teamId/projects/:projectId/services',
    async (request, reply) => {
      const { teamId, projectId } = request.params;
      const userId = (request.user as any).sub;
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

      const body = request.body as any;
      if (!body?.name || !body?.category) {
        return reply.status(400).send({ error: 'name and category are required' });
      }

      const definition = serviceDefinitionRegistry.forCreatePayload(body);
      const allowedKeys = new Set(definition.settings.map((s) => s.key));
      const baseKeys = new Set([
        'name','category','icon','source_provider','repo_url','repo_owner','repo_name','default_branch','autodeploy_enabled',
        'docker_image','docker_registry_url','docker_registry_user','db_engine','db_version','framework','build_command',
        'start_command','install_command','root_directory','dockerfile_path','region','internal_port','is_public','memory_mb','cpu_millicores',
      ]);
      const submittedSettings = Object.keys(body).filter((key) => key.includes('_') || key.endsWith('command') || key.endsWith('path'));
      const invalidSettings = submittedSettings.filter((key) => !baseKeys.has(key) && !allowedKeys.has(key) && !['service_type', 'service_name'].includes(key));
      if (invalidSettings.length) {
        return reply.status(400).send({ error: 'settings_not_allowed_for_service_type', invalid_settings: invalidSettings });
      }

      try {
        const svc = await serviceManager.create({
          projectId, teamId, userId,
          name: body.name,
          category: body.category,
          icon: body.icon,
          // git_repo
          sourceProvider: body.source_provider,
          repoUrl: body.repo_url,
          defaultBranch: body.default_branch,
          autodeployEnabled: body.autodeploy_enabled,
          // docker
          dockerImage: body.docker_image,
          // database
          dbEngine: body.db_engine,
          dbVersion: body.db_version,
          // build
          framework: body.framework,
          buildCommand: body.build_command,
          startCommand: body.start_command,
          installCommand: body.install_command,
          rootDirectory: body.root_directory,
          dockerfilePath: body.dockerfile_path,
          // runtime
          region: body.region,
          internalPort: body.internal_port,
          isPublic: body.is_public,
          memoryMb: body.memory_mb,
          cpuMillicores: body.cpu_millicores,
          networkMode: body.network_mode,
          networkAliases: body.network_aliases,
          httpProxyEnabled: body.http_proxy_enabled,
          httpProxyPath: body.http_proxy_path,
          httpProxyTargetPort: body.http_proxy_target_port,
          httpsProxyEnabled: body.https_proxy_enabled,
          proxyHeaders: body.proxy_headers,
          preDeployCommand: body.pre_deploy_command,
          healthCheckPath: body.health_check_path,
          cronSchedule: body.cron_schedule,
          restartPolicy: body.restart_policy,
          restartRetries: body.restart_retries,
          replicas: body.replicas,
        });

        return reply.status(201).send(sanitize(svc));
      } catch (err: any) {
        logger.error('create service', err);
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // ─── List services in a project ──────────────────────────────────────
  fastify.get<{ Params: { teamId: string; projectId: string }; Querystring: { include_deleted?: string } }>(
    '/api/v1/teams/:teamId/projects/:projectId/services',
    async (request, reply) => {
      const { teamId, projectId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const includeDeleted = (request.query as any)?.include_deleted === 'true';
      const rows = includeDeleted
        ? await serviceManager.listHistoricalForProject(projectId)
        : await serviceManager.listForProject(projectId);
      return reply.send(rows.map(sanitize));
    }
  );

  // ─── List all services for a team ────────────────────────────────────
  fastify.get<{ Params: { teamId: string } }>(
    '/api/v1/teams/:teamId/services',
    async (request, reply) => {
      const { teamId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      return reply.send((await serviceManager.listForTeam(teamId)).map(sanitize));
    }
  );

  // ─── Get a service ───────────────────────────────────────────────────
  fastify.get<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const svc = await serviceManager.get(serviceId);
      if (!svc || svc.team_id !== teamId) return reply.status(404).send({ error: 'not found' });
      return reply.send(sanitize(svc));
    }
  );

  // ─── Dynamic UI definition for a service type ───────────────────────
  fastify.get<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/definition',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const svc = await serviceManager.get(serviceId);
      if (!svc || svc.team_id !== teamId) return reply.status(404).send({ error: 'not found' });
      const def = serviceDefinitionRegistry.get(svc.category);
      return reply.send(def);
    }
  );

  // ─── Historical deployments stay visible even after removal/cancel ───
  fastify.get<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/deployment-history',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const svc = await serviceManager.get(serviceId);
      if (!svc || svc.team_id !== teamId) return reply.status(404).send({ error: 'not found' });
      return reply.send(await serviceManager.deploymentHistory(serviceId));
    }
  );

  fastify.get<{ Params: { teamId: string; serviceId: string }; Querystring: { stream?: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/log-events',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const svc = await serviceManager.get(serviceId);
      if (!svc || svc.team_id !== teamId) return reply.status(404).send({ error: 'not found' });
      return reply.send(await serviceManager.logs(serviceId, request.query.stream));
    }
  );

  // ─── Update a service ────────────────────────────────────────────────
  fastify.patch<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const svc = await serviceManager.get(serviceId);
      if (!svc || svc.team_id !== teamId) return reply.status(404).send({ error: 'not found' });
      const definition = serviceDefinitionRegistry.get(svc.category);
      if (!definition) return reply.status(400).send({ error: 'unknown service type' });
      const baseKeys = new Set(['name','icon','memory_mb','cpu_millicores','status']);
      const allowedKeys = new Set([...definition.settings.map((s: any) => s.key), ...baseKeys]);
      const invalid = Object.keys(request.body as any).filter((key) => !allowedKeys.has(key));
      if (invalid.length) return reply.status(400).send({ error: 'settings_not_allowed_for_service_type', invalid_settings: invalid });
      const updated = await serviceManager.update(serviceId, request.body as any);
      return reply.send(sanitize(updated));
    }
  );

  // ─── Lifecycle: start / stop / restart ───────────────────────────────
  fastify.post<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/start',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      await serviceManager.start(serviceId);
      return reply.send({ ok: true });
    }
  );

  fastify.post<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/stop',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      await serviceManager.stop(serviceId);
      return reply.send({ ok: true });
    }
  );

  fastify.post<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/restart',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      await serviceManager.restart(serviceId);
      return reply.send({ ok: true });
    }
  );

  // ─── Destroy ─────────────────────────────────────────────────────────
  fastify.delete<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      const userId = (request.user as any).sub;
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });
      await serviceManager.destroy(serviceId, userId);
      return reply.status(204).send();
    }
  );

  // ─── Database credentials ────────────────────────────────────────────
  fastify.get<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/credentials',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const creds = await serviceManager.getCredentials(serviceId);
      if (!creds) return reply.status(404).send({ error: 'no credentials (not a database service)' });

      await query(
        `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'user', 'service.credentials_revealed', 'service', $3, '{}')`,
        [teamId, (request.user as any).sub, serviceId]
      );

      return reply.send(creds);
    }
  );

  // ─── Connection token management ─────────────────────────────────────
  fastify.post<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/token/regenerate',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const token = await serviceManager.regenerateToken(serviceId);
      return reply.send({ connection_token: token, _note: 'Save this token — it will not be shown again.' });
    }
  );

  fastify.post<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/token/revoke',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      await serviceManager.revokeToken(serviceId);
      return reply.send({ ok: true });
    }
  );

  // ─── Environment variables (per-service) ─────────────────────────────
  fastify.get<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/env',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      const r = await query(
        `SELECT id, key, is_secret, scope, created_at FROM environment_variables WHERE service_id = $1 ORDER BY key`,
        [serviceId]
      );
      return reply.send(r.rows);
    }
  );

  fastify.post<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/env',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      const userId = (request.user as any).sub;
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

      const svc = await serviceManager.get(serviceId);
      if (!svc) return reply.status(404).send({ error: 'not found' });

      const { key, value, is_secret, scope } = request.body as any;
      if (!key || value === undefined) return reply.status(400).send({ error: 'key and value required' });

      const { encrypt: enc } = await import('../utils/crypto.js');
      await query(
        `INSERT INTO environment_variables (service_id, project_id, key, value_encrypted, is_secret, scope, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [serviceId, svc.project_id, key, enc(String(value)), !!is_secret, scope ?? 'all', userId]
      );
      return reply.status(201).send({ key, scope: scope ?? 'all' });
    }
  );

  // ─── External connection proxy ───────────────────────────────────────
  fastify.post<{ Params: { token: string } }>(
    '/api/v1/connect/:token',
    async (request, reply) => {
      const { token } = request.params;
      if (!token?.startsWith('fct_')) return reply.status(400).send({ error: 'invalid token' });

      const svc = await serviceManager.validateToken(token);
      if (!svc) return reply.status(401).send({ error: 'invalid or revoked token' });

      const creds = await serviceManager.getCredentials(svc.id);
      if (!creds) return reply.status(500).send({ error: 'credentials unavailable' });

      await query(
        `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, ip_address)
         VALUES ($1, NULL, 'api_key', 'service.external_connect', 'service', $2, $3)`,
        [svc.team_id, svc.id, request.ip]
      );

      return reply.send({
        service_name: svc.name,
        service_category: svc.service_category,
        db_engine: svc.db_engine,
        status: svc.status,
        credentials: creds,
      });
    }
  );
}

function sanitize(svc: any) {
  if (!svc) return null;
  const { credentials_encrypted, connection_token, connection_token_hash, docker_registry_token_encrypted, ...rest } = svc;
  return {
    ...rest,
    has_credentials: !!credentials_encrypted,
    has_connection_token: !!connection_token_hash,
    _connection_token_raw: svc._connection_token_raw ?? undefined,
  };
}

async function isMember(teamId: string, userId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
  return r.rowCount! > 0;
}
