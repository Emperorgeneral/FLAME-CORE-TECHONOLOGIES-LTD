import { promises as fs } from 'fs';
import { join, normalize } from 'path';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import type { PersistentVolume, PersistentVolumeKind } from '../types/index.js';

const VOLUME_BASE = process.env.PERSISTENT_VOLUME_BASE ?? '/var/flame-volumes';
const ALLOWED_MOUNTS: Record<PersistentVolumeKind, string> = {
  uploads: '/data/uploads',
  sqlite: '/data/sqlite',
  cache: '/data/cache',
  generated: '/data/generated',
  backups: '/data/backups',
  custom: '/data/custom',
};

/**
 * Persistent volume service.
 *
 * Volumes live outside containers under:
 *   /var/flame-volumes/<team-id>/<project-id>/<volume-name>/
 *
 * These survive:
 *  - redeploys
 *  - container restarts
 *  - VPS reboot
 */
export const volumeService = {
  basePath(teamId: string, projectId: string) {
    return join(VOLUME_BASE, sanitize(teamId), sanitize(projectId));
  },

  resolveHostPath(teamId: string, projectId: string, volumeName: string) {
    return join(this.basePath(teamId, projectId), sanitize(volumeName));
  },

  async ensureDefaults(teamId: string, projectId: string): Promise<PersistentVolume[]> {
    const defaults: Array<{ name: string; kind: PersistentVolumeKind }> = [
      { name: 'uploads', kind: 'uploads' },
      { name: 'sqlite', kind: 'sqlite' },
      { name: 'cache', kind: 'cache' },
      { name: 'generated', kind: 'generated' },
    ];

    const created: PersistentVolume[] = [];
    for (const item of defaults) {
      const existing = await query(
        `SELECT * FROM persistent_volumes WHERE project_id = $1 AND name = $2`,
        [projectId, item.name]
      );
      if (existing.rows[0]) {
        created.push(existing.rows[0]);
        continue;
      }
      const volume = await this.create({
        teamId,
        projectId,
        name: item.name,
        kind: item.kind,
        mountPath: ALLOWED_MOUNTS[item.kind],
        readOnly: false,
      });
      created.push(volume);
    }
    return created;
  },

  async create(args: {
    teamId: string;
    projectId: string;
    name: string;
    kind: PersistentVolumeKind;
    mountPath?: string;
    readOnly?: boolean;
    quotaBytes?: number | null;
  }): Promise<PersistentVolume> {
    const hostPath = this.resolveHostPath(args.teamId, args.projectId, args.name);
    const mountPath = args.mountPath ?? ALLOWED_MOUNTS[args.kind] ?? '/data/custom';
    const safeMount = normalize(mountPath).startsWith('/data/') ? mountPath : '/data/custom';

    await fs.mkdir(hostPath, { recursive: true, mode: 0o750 });

    const res = await query(
      `INSERT INTO persistent_volumes (team_id, project_id, name, mount_path, host_path, kind, read_only, quota_bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (project_id, name) DO UPDATE SET
         mount_path = EXCLUDED.mount_path,
         host_path = EXCLUDED.host_path,
         read_only = EXCLUDED.read_only,
         quota_bytes = EXCLUDED.quota_bytes,
         updated_at = now()
       RETURNING *`,
      [
        args.teamId,
        args.projectId,
        args.name,
        safeMount,
        hostPath,
        args.kind,
        !!args.readOnly,
        args.quotaBytes ?? null,
      ]
    );

    logger.info('volume ensured', { project: args.projectId, name: args.name, hostPath, mountPath: safeMount });
    return res.rows[0];
  },

  async listForProject(projectId: string): Promise<PersistentVolume[]> {
    const res = await query(
      `SELECT * FROM persistent_volumes WHERE project_id = $1 AND is_active = true ORDER BY name`,
      [projectId]
    );
    return res.rows;
  },

  async updateUsage(projectId: string): Promise<void> {
    const volumes = await this.listForProject(projectId);
    for (const volume of volumes) {
      try {
        const size = await directorySize(volume.host_path);
        await query(`UPDATE persistent_volumes SET used_bytes = $2, updated_at = now() WHERE id = $1`, [volume.id, size]);
      } catch (err) {
        logger.warn('volume usage scan failed', { volume: volume.id, error: (err as Error).message });
      }
    }
  },

  async mountsForProject(projectId: string): Promise<Array<{ hostPath: string; containerPath: string; readOnly: boolean }>> {
    const volumes = await this.listForProject(projectId);
    return volumes.map((v) => ({
      hostPath: v.host_path,
      containerPath: v.mount_path,
      readOnly: v.read_only,
    }));
  },
};

function sanitize(v: string) {
  return v.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function directorySize(path: string): Promise<number> {
  const entries = await fs.readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(p);
    else if (entry.isFile()) total += (await fs.stat(p)).size;
  }
  return total;
}
