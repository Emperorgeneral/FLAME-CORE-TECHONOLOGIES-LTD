import { FastifyInstance } from 'fastify';
import { templateManager } from '../services/templateManager.js';
import { serviceManager } from '../services/serviceManager.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/**
 * Template Routes.
 * Handles saving Houses as Templates and deploying Templates into new Houses.
 */
export async function registerTemplateRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/v1/templates')) {
      await request.jwtVerify();
    }
  });

  // ─── List Templates ──────────────────────────────────────────────────
  fastify.get('/api/v1/templates', async (request, reply) => {
    const userId = (request.user as any).sub;
    const templates = await templateManager.list(userId);
    return reply.send(templates);
  });

  // ─── Get Template Details ────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/api/v1/templates/:id', async (request, reply) => {
    const template = await templateManager.get(request.params.id);
    if (!template) return reply.status(404).send({ error: 'not found' });
    return reply.send(template);
  });

  // ─── Save House as Template ──────────────────────────────────────────
  fastify.post<{ Params: { teamId: string; projectId: string } }>(
    '/api/v1/teams/:teamId/projects/:projectId/save-as-template',
    async (request, reply) => {
      const { teamId, projectId } = request.params;
      const userId = (request.user as any).sub;
      
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

      const { name, icon, is_public } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'name is required' });

      try {
        const template = await templateManager.createFromProject(projectId, userId, name, icon || '🏠', !!is_public);
        return reply.status(201).send(template);
      } catch (err: any) {
        logger.error('save as template', err);
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  // ─── Deploy Template (Create new House from Template) ────────────────
  fastify.post<{ Params: { teamId: string } }>(
    '/api/v1/teams/:teamId/deploy-template',
    async (request, reply) => {
      const { teamId } = request.params;
      const userId = (request.user as any).sub;
      
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

      const { template_id, house_name } = request.body as any;
      if (!template_id) return reply.status(400).send({ error: 'template_id is required' });

      try {
        const result = await templateManager.deployTemplate(template_id, teamId, userId, house_name);
        return reply.status(201).send(result);
      } catch (err: any) {
        logger.error('deploy template', err);
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  // ─── Delete Template ─────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/api/v1/templates/:id', async (request, reply) => {
    const userId = (request.user as any).sub;
    await templateManager.delete(request.params.id, userId);
    return reply.status(204).send();
  });
}

async function isMember(teamId: string, userId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
  return r.rowCount! > 0;
}
