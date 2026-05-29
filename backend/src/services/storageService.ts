import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import { storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { generateSecureToken, hashToken } from '../utils/crypto.js';
import type { StorageObject, StorageVisibility } from '../types/index.js';

const PUBLIC_MIME_ALLOWLIST = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'video/mp4', 'video/webm',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/zip',
]);

/**
 * Persistent file/object service.
 *
 * Features:
 *  - per-team/project key isolation
 *  - quota enforcement before upload
 *  - MIME + file size validation
 *  - signed upload tickets
 *  - private/public object visibility
 *  - usage accounting (bytes, object count, bandwidth)
 *  - hooks for malware scan + media processing queues
 */
export const storageService = {
  objectPrefix(teamId: string, projectId: string) {
    return `uploads/${teamId}/${projectId}`;
  },

  buildObjectKey(teamId: string, projectId: string, fileName: string, folder = '') {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = [this.objectPrefix(teamId, projectId), folder.replace(/^\/+|\/+$/g, ''), `${Date.now()}-${safe}`]
      .filter(Boolean)
      .join('/');
    return path;
  },

  async planLimits(teamId: string) {
    const res = await query(
      `SELECT p.storage_gb, p.bandwidth_gb, p.max_upload_mb, p.max_object_count
         FROM teams t
         JOIN plans p ON p.id = t.plan_id
        WHERE t.id = $1`,
      [teamId]
    );
    return res.rows[0] ?? { storage_gb: 1, bandwidth_gb: 1, max_upload_mb: 10, max_object_count: 100 };
  },

  async currentUsage(teamId: string) {
    const monthRes = await query(
      `SELECT COALESCE(storage_bytes,0)::bigint AS storage_bytes,
              COALESCE(bandwidth_bytes,0)::bigint AS bandwidth_bytes
         FROM usage_counters
        WHERE team_id = $1
          AND period_month = date_trunc('month', now())::date`,
      [teamId]
    );
    const objectRes = await query(
      `SELECT COUNT(*)::int AS n FROM storage_objects WHERE team_id = $1 AND status IN ('pending','ready')`,
      [teamId]
    );
    return {
      storageBytes: Number(monthRes.rows[0]?.storage_bytes ?? 0),
      bandwidthBytes: Number(monthRes.rows[0]?.bandwidth_bytes ?? 0),
      objectCount: Number(objectRes.rows[0]?.n ?? 0),
    };
  },

  validateUpload(args: { contentType: string; sizeBytes: number; limits: { max_upload_mb: number } }) {
    if (!PUBLIC_MIME_ALLOWLIST.has(args.contentType)) {
      throw new Error(`unsupported content type: ${args.contentType}`);
    }
    const maxSizeBytes = args.limits.max_upload_mb * 1024 * 1024;
    if (args.sizeBytes > maxSizeBytes) {
      throw new Error(`file exceeds maximum upload size of ${args.limits.max_upload_mb} MB`);
    }
  },

  async assertQuota(teamId: string, incomingBytes: number) {
    const limits = await this.planLimits(teamId);
    const usage = await this.currentUsage(teamId);
    const storageLimit = Number(limits.storage_gb) * 1024 * 1024 * 1024;
    const objectLimit = Number(limits.max_object_count);

    if (usage.storageBytes + incomingBytes > storageLimit) {
      throw new Error('storage quota exceeded');
    }
    if (usage.objectCount + 1 > objectLimit) {
      throw new Error('object count quota exceeded');
    }
    return { limits, usage };
  },

  async createUploadTicket(args: {
    teamId: string;
    projectId: string;
    userId: string;
    originalName: string;
    contentType: string;
    sizeBytes: number;
    visibility?: StorageVisibility;
    folder?: string;
  }) {
    const { limits } = await this.assertQuota(args.teamId, args.sizeBytes);
    this.validateUpload({ contentType: args.contentType, sizeBytes: args.sizeBytes, limits });

    const key = this.buildObjectKey(args.teamId, args.projectId, args.originalName, args.folder);
    const objectId = uuidv4();
    const rawToken = generateSecureToken(24);
    const tokenHash = hashToken(rawToken);

    await query(
      `INSERT INTO storage_objects
       (id, team_id, project_id, key, original_name, content_type, size_bytes, visibility, provider, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)`,
      [
        objectId,
        args.teamId,
        args.projectId,
        key,
        args.originalName,
        args.contentType,
        args.sizeBytes,
        args.visibility ?? 'private',
        storage.kind,
        args.userId,
      ]
    );

    const ticketRes = await query(
      `INSERT INTO upload_tickets (team_id, project_id, object_id, token_hash, key, content_type, max_size_bytes, visibility, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + interval '15 minutes', $9)
       RETURNING id, expires_at`,
      [
        args.teamId,
        args.projectId,
        objectId,
        tokenHash,
        key,
        args.contentType,
        args.sizeBytes,
        args.visibility ?? 'private',
        args.userId,
      ]
    );

    await this.audit(args.teamId, args.userId, 'storage.upload_ticket_created', 'storage_object', objectId, {
      key,
      size_bytes: args.sizeBytes,
      content_type: args.contentType,
    });

    return {
      ticket_id: ticketRes.rows[0].id,
      upload_token: rawToken,
      upload_url: `/api/v1/storage/upload/${rawToken}`,
      object_id: objectId,
      key,
      expires_at: ticketRes.rows[0].expires_at,
    };
  },

  async consumeUploadTicket(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const ticketRes = await query(
      `SELECT * FROM upload_tickets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );
    return ticketRes.rows[0] ?? null;
  },

  async completeUpload(rawToken: string, file: { body: Buffer; contentType: string; sizeBytes: number }) {
    const ticket = await this.consumeUploadTicket(rawToken);
    if (!ticket) throw new Error('invalid or expired upload ticket');
    if (file.sizeBytes > Number(ticket.max_size_bytes)) throw new Error('upload exceeds signed size limit');
    if (file.contentType !== ticket.content_type) throw new Error('content type mismatch');

    const checksum = createHash('sha256').update(file.body).digest('hex');
    const stored = await storage.put(ticket.key, file.body, {
      contentType: file.contentType,
      visibility: ticket.visibility,
      metadata: { project_id: ticket.project_id, team_id: ticket.team_id },
      cacheControl: ticket.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=0',
    });

    const publicUrl = ticket.visibility === 'public' ? storage.publicUrl(ticket.key) : null;

    await query(
      `UPDATE storage_objects
          SET status = 'ready', etag = $2, checksum_sha256 = $3, object_url = $4, cdn_url = $5, metadata = metadata || $6::jsonb
        WHERE id = $1`,
      [
        ticket.object_id,
        stored.etag ?? null,
        checksum,
        publicUrl,
        publicUrl,
        JSON.stringify({ content_type: file.contentType, provider: storage.kind }),
      ]
    );

    await query(`UPDATE upload_tickets SET used_at = now() WHERE id = $1`, [ticket.id]);
    await this.bumpStorageUsage(ticket.team_id, file.sizeBytes);
    await this.queueMediaHooks(ticket.object_id, ticket.team_id, ticket.project_id, ticket.key, file.contentType);

    return this.getObject(ticket.object_id);
  },

  async getObject(objectId: string): Promise<StorageObject | null> {
    const res = await query(`SELECT * FROM storage_objects WHERE id = $1`, [objectId]);
    return res.rows[0] ?? null;
  },

  async listProjectObjects(projectId: string, visibility?: StorageVisibility) {
    const params: any[] = [projectId];
    let where = 'WHERE project_id = $1 AND status IN (\'pending\',\'ready\')';
    if (visibility) {
      params.push(visibility);
      where += ` AND visibility = $${params.length}`;
    }
    const res = await query(
      `SELECT * FROM storage_objects ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    return res.rows;
  },

  async signedDownloadUrl(objectId: string, requesterTeamId: string) {
    const object = await this.getObject(objectId);
    if (!object || object.team_id !== requesterTeamId) throw new Error('object not found');
    if (object.visibility === 'public') return object.cdn_url || storage.publicUrl(object.key);
    const token = generateSecureToken(20);
    const tokenHash = hashToken(token);
    await query(
      `INSERT INTO upload_tickets (team_id, project_id, object_id, token_hash, key, content_type, max_size_bytes, visibility, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'private', now() + interval '10 minutes')`,
      [object.team_id, object.project_id, object.id, tokenHash, object.key, object.content_type, object.size_bytes]
    );
    return `/api/v1/storage/download/${token}`;
  },

  async resolveDownload(rawToken: string) {
    const ticket = await this.consumeUploadTicket(rawToken);
    if (!ticket || !ticket.object_id) throw new Error('invalid or expired download token');
    const object = await this.getObject(ticket.object_id);
    if (!object) throw new Error('object not found');
    await query(`UPDATE upload_tickets SET used_at = now() WHERE id = $1`, [ticket.id]);
    await query(
      `UPDATE storage_objects SET bandwidth_bytes = bandwidth_bytes + $2, download_count = download_count + 1 WHERE id = $1`,
      [object.id, object.size_bytes]
    );
    await this.bumpBandwidthUsage(object.team_id, object.size_bytes);
    return object;
  },

  async bumpStorageUsage(teamId: string, bytes: number) {
    await query(
      `INSERT INTO usage_counters (team_id, period_month, storage_bytes)
       VALUES ($1, date_trunc('month', now())::date, $2)
       ON CONFLICT (team_id, period_month)
       DO UPDATE SET storage_bytes = usage_counters.storage_bytes + EXCLUDED.storage_bytes`,
      [teamId, bytes]
    );
  },

  async bumpBandwidthUsage(teamId: string, bytes: number) {
    await query(
      `INSERT INTO usage_counters (team_id, period_month, bandwidth_bytes)
       VALUES ($1, date_trunc('month', now())::date, $2)
       ON CONFLICT (team_id, period_month)
       DO UPDATE SET bandwidth_bytes = usage_counters.bandwidth_bytes + EXCLUDED.bandwidth_bytes`,
      [teamId, bytes]
    );
  },

  async queueMediaHooks(objectId: string, teamId: string, projectId: string, inputKey: string, contentType: string) {
    const jobs: Array<'thumbnail' | 'optimize' | 'scan'> = ['scan'];
    if (contentType.startsWith('image/')) jobs.push('thumbnail', 'optimize');
    for (const jobType of jobs) {
      await query(
        `INSERT INTO media_jobs (object_id, team_id, project_id, job_type, input_key)
         VALUES ($1,$2,$3,$4,$5)`,
        [objectId, teamId, projectId, jobType, inputKey]
      );
    }
  },

  async storageDashboard() {
    const [byTeam, largestProjects, failedUploads] = await Promise.all([
      query(
        `SELECT t.id AS team_id, t.slug, COUNT(o.id)::int AS object_count,
                COALESCE(SUM(o.size_bytes),0)::bigint AS storage_bytes,
                COALESCE(SUM(o.bandwidth_bytes),0)::bigint AS bandwidth_bytes
           FROM teams t
           LEFT JOIN storage_objects o ON o.team_id = t.id AND o.status IN ('pending','ready')
          GROUP BY t.id, t.slug
          ORDER BY storage_bytes DESC
          LIMIT 100`
      ),
      query(
        `SELECT p.id AS project_id, p.name, t.slug AS team_slug,
                COALESCE(SUM(o.size_bytes),0)::bigint AS storage_bytes
           FROM projects p
           JOIN teams t ON t.id = p.team_id
           LEFT JOIN storage_objects o ON o.project_id = p.id AND o.status IN ('pending','ready')
          GROUP BY p.id, p.name, t.slug
          ORDER BY storage_bytes DESC
          LIMIT 20`
      ),
      query(
        `SELECT id, key, content_type, size_bytes, created_at
           FROM storage_objects
          WHERE status = 'failed'
          ORDER BY created_at DESC LIMIT 50`
      ),
    ]);

    const providerHealth = await storage.health();
    return {
      provider: storage.kind,
      provider_health: providerHealth,
      usage_by_team: byTeam.rows,
      largest_projects: largestProjects.rows,
      failed_uploads: failedUploads.rows,
    };
  },

  async audit(teamId: string, actorId: string | null, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>) {
    await query(
      `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [teamId, actorId, actorId ? 'user' : 'system', action, resourceType, resourceId, JSON.stringify(metadata)]
    );
  },
};
