import { FastifyInstance } from 'fastify';
import { projectService } from '../services/projectService.js';
import { volumeService } from '../services/volumeService.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { encrypt, decrypt } from '../utils/crypto.js';

/**
 * Project routes — all team-scoped. The team_id is taken from the URL
 * (so the same user can switch contexts cleanly) and verified against
 * the authenticated user's memberships.
 */
export async function registerProjectRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/teams/')) {
      await request.jwtVerify();
    }
  });

  // Create project
  fastify.post<{ Params: { teamId: string } }>('/api/teams/:teamId/projects', async (request, reply) => {
    const { teamId } = request.params;
    if (!await isMember(teamId, (request.user as any).sub)) {
      return reply.status(403).send({ error: 'forbidden' });
    }

    const body = request.body as any;
    if (!body?.name || !body?.repo_url) {
      return reply.status(400).send({ error: 'name and repo_url are required' });
    }

    try {
      const project = await projectService.create({
        teamId,
        name: body.name,
        description: body.description,
        source: body.source ?? 'github',
        repoUrl: body.repo_url,
        defaultBranch: body.default_branch ?? 'main',
        framework: body.framework ?? 'unknown',
        primaryRegion: body.primary_region ?? 'los1',
      });
      await volumeService.ensureDefaults(teamId, project.id);
      return reply.status(201).send(project);
    } catch (err) {
      logger.error('create project', err);
      return reply.status(500).send({ error: 'internal error' });
    }
  });

  // List projects
  fastify.get<{ Params: { teamId: string } }>('/api/teams/:teamId/projects', async (request, reply) => {
    const { teamId } = request.params;
    if (!await isMember(teamId, (request.user as any).sub)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    return reply.send(await projectService.listForTeam(teamId));
  });

  // Get project
  fastify.get<{ Params: { teamId: string; projectId: string } }>('/api/teams/:teamId/projects/:projectId', async (request, reply) => {
    const { teamId, projectId } = request.params;
    if (!await isMember(teamId, (request.user as any).sub)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const project = await projectService.get(projectId);
    if (!project || project.team_id !== teamId) return reply.status(404).send({ error: 'not found' });
    return reply.send(project);
  });

  // Update project
  fastify.patch<{ Params: { teamId: string; projectId: string } }>('/api/teams/:teamId/projects/:projectId', async (request, reply) => {
    const { teamId, projectId } = request.params;
    if (!await isMember(teamId, (request.user as any).sub)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const project = await projectService.get(projectId);
    if (!project || project.team_id !== teamId) return reply.status(404).send({ error: 'not found' });
    const updated = await projectService.update(projectId, request.body as any);
    return reply.send(updated);
  });

  // ─── Environment variables (scoped per project) ────────────────────────
  fastify.get<{ Params: { teamId: string; projectId: string } }>('/api/teams/:teamId/projects/:projectId/env', async (request, reply) => {
    const { teamId, projectId } = request.params;
    if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });

    const r = await query(
      `SELECT id, key, is_secret, scope, created_at FROM environment_variables WHERE project_id = $1 ORDER BY key`,
      [projectId]
    );

    // Never return plaintext secrets. UI shows masked values.
    const safe = r.rows.map((row: any) => ({
      ...row,
      value: row.is_secret ? '••••••••' : undefined,
    }));
    return reply.send(safe);
  });

  fastify.post<{ Params: { teamId: string; projectId: string } }>('/api/teams/:teamId/projects/:projectId/env', async (request, reply) => {
    const { teamId, projectId } = request.params;
    const userId = (request.user as any).sub;
    if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

    const { key, value, is_secret, scope } = request.body as any;
    if (!key || value === undefined) return reply.status(400).send({ error: 'key and value required' });

    // Real AES-256-GCM encryption (production safe)
    const value_encrypted = encrypt(String(value));

    await query(
      `INSERT INTO environment_variables (project_id, key, value_encrypted, is_secret, scope, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (project_id, key, scope) DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, updated_at = now()`,
      [projectId, key, value_encrypted, !!is_secret, scope ?? 'all', userId]
    );

    // Audit log (never log the value)
    logger.info({ team_id: teamId, project_id: projectId, key, is_secret: !!is_secret }, 'env var set');

    return reply.status(201).send({ key, scope: scope ?? 'all', is_secret: !!is_secret });
  });

  fastify.delete<{ Params: { teamId: string; projectId: string; key: string } }>('/api/teams/:teamId/projects/:projectId/env/:key', async (request, reply) => {
    const { teamId, projectId, key } = request.params;
    if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
    await query(`DELETE FROM environment_variables WHERE project_id = $1 AND key = $2`, [projectId, key]);
    return reply.status(204).send();
  });
}

async function isMember(teamId: string, userId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
  return r.rowCount! > 0;
}
