import { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { storageService } from '../services/storageService.js';
import { volumeService } from '../services/volumeService.js';
import { storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';

async function isMember(teamId: string, userId: string) {
  const r = await query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
  return r.rowCount! > 0;
}

/**
 * Persistent storage routes.
 *
 * - Project-scoped volumes
 * - Quota-checked upload ticket creation
 * - Raw upload completion endpoint
 * - Object listing and signed/private downloads
 */
export async function registerStorageRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/v1/teams/') && request.url.includes('/storage')) {
      await request.jwtVerify();
    }
  });

  // Public local-storage asset route (used when provider is local and visibility=public)
  fastify.get<{ Params: { '*': string } }>('/storage/*', async (request, reply) => {
    const rawKey = (request.params as any)['*'];
    const key = String(rawKey ?? '').replace(/\.{2,}/g, '').replace(/^\/+/, '');
    const objectRes = await query(
      `SELECT * FROM storage_objects WHERE key = $1 AND visibility = 'public' AND status = 'ready'`,
      [key]
    );
    const object = objectRes.rows[0];
    if (!object) return reply.status(404).send({ error: 'not found' });

    const body = await storage.get(key);
    await query(
      `UPDATE storage_objects SET bandwidth_bytes = bandwidth_bytes + $2, download_count = download_count + 1 WHERE id = $1`,
      [object.id, object.size_bytes]
    );
    await storageService.bumpBandwidthUsage(object.team_id, object.size_bytes);
    reply.header('Content-Type', object.content_type);
    reply.header('Content-Length', String(object.size_bytes));
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(body);
  });

  // Ensure/list default persistent volumes for a project
  fastify.get<{ Params: { teamId: string; projectId: string } }>('/api/v1/teams/:teamId/projects/:projectId/storage/volumes', async (request, reply) => {
    const { teamId, projectId } = request.params;
    const userId = (request.user as any).sub;
    if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });
    await volumeService.ensureDefaults(teamId, projectId);
    const volumes = await volumeService.listForProject(projectId);
    return reply.send(volumes);
  });

  // Create an upload ticket (checks plan quota first)
  fastify.post<{ Params: { teamId: string; projectId: string } }>('/api/v1/teams/:teamId/projects/:projectId/storage/upload-ticket', async (request, reply) => {
    const { teamId, projectId } = request.params;
    const userId = (request.user as any).sub;
    if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

    const body = request.body as any;
    if (!body?.original_name || !body?.content_type || !body?.size_bytes) {
      return reply.status(400).send({ error: 'original_name, content_type and size_bytes are required' });
    }

    try {
      const ticket = await storageService.createUploadTicket({
        teamId,
        projectId,
        userId,
        originalName: body.original_name,
        contentType: body.content_type,
        sizeBytes: Number(body.size_bytes),
        visibility: body.visibility ?? 'private',
        folder: body.folder ?? '',
      });
      return reply.status(201).send(ticket);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Raw upload body endpoint using signed ticket.
  // Client sends binary body with matching content-type.
  fastify.put<{ Params: { token: string } }>('/api/v1/storage/upload/:token', async (request, reply) => {
    try {
      const raw = request.body as Buffer | string;
      const body = Buffer.isBuffer(raw) ? raw : Buffer.from((raw as string) ?? '');
      const contentType = String(request.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim();
      const object = await storageService.completeUpload(request.params.token, {
        body,
        contentType,
        sizeBytes: body.byteLength,
      });
      return reply.status(201).send({
        id: object?.id,
        key: object?.key,
        visibility: object?.visibility,
        url: object?.cdn_url || object?.object_url,
      });
    } catch (err: any) {
      logger.error('storage upload failed', err);
      return reply.status(400).send({ error: err.message });
    }
  });

  // List project objects
  fastify.get<{ Params: { teamId: string; projectId: string } }>('/api/v1/teams/:teamId/projects/:projectId/storage/objects', async (request, reply) => {
    const { teamId, projectId } = request.params;
    const userId = (request.user as any).sub;
    if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });
    const objects = await storageService.listProjectObjects(projectId);
    return reply.send(objects);
  });

  // Create signed/private download URL for an object
  fastify.post<{ Params: { teamId: string; projectId: string; objectId: string } }>('/api/v1/teams/:teamId/projects/:projectId/storage/objects/:objectId/download-url', async (request, reply) => {
    const { teamId, projectId, objectId } = request.params;
    const userId = (request.user as any).sub;
    if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

    const object = await storageService.getObject(objectId);
    if (!object || object.project_id !== projectId || object.team_id !== teamId) {
      return reply.status(404).send({ error: 'object not found' });
    }
    const url = await storageService.signedDownloadUrl(objectId, teamId);
    return reply.send({ url });
  });

  // Resolve a private signed download token
  fastify.get<{ Params: { token: string } }>('/api/v1/storage/download/:token', async (request, reply) => {
    try {
      const object = await storageService.resolveDownload(request.params.token);
      const body = await storage.get(object.key);
      reply.header('Content-Type', object.content_type);
      reply.header('Content-Length', String(object.size_bytes));
      if (object.visibility === 'private') reply.header('Cache-Control', 'private, max-age=0');
      return reply.send(body);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
