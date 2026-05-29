import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import type {
  Deployment, DeploymentStatus, DeploymentTrigger, RegionCode,
} from '../types/index.js';

/**
 * Team- and region-aware deployment service.
 *
 * Notes for future contributors:
 *  - URLs use the global *.flame.app — never country-specific.
 *  - Every deployment is tied to a region from the start; today only `los1`
 *    is live but the schema and dispatch logic are ready for more.
 *  - Internal port allocation is naive (random); a real implementation
 *    should use a per-region port allocator that checks the existing
 *    deployments table for collisions.
 */
export const deploymentService = {
  async create(args: {
    projectId: string;
    teamId: string;
    triggeredBy: string;
    trigger: DeploymentTrigger;
    commitHash: string;
    commitMessage: string;
    commitAuthor: string;
    branch: string;
    region: RegionCode;
    serviceId?: string;
  }): Promise<Deployment> {
    const id = uuidv4();
    const shortId = id.split('-')[0];
    const deploymentUrl = `${shortId}.flame.app`;

    // Real-ish port allocator: avoid collisions with active/ready deployments in this region
    // Production improvement: use a dedicated port range per region + Redis set or external allocator service.
    let internalPort = 3100 + Math.floor(Math.random() * 8000);
    for (let attempt = 0; attempt < 20; attempt++) {
      const existing = await query(
        `SELECT 1 FROM deployments WHERE region = $1 AND internal_port = $2 AND status IN ('queued','cloning','building','provisioning','ready','healthy')`,
        [args.region, internalPort]
      );
      if (existing.rowCount === 0) break;
      internalPort = 3100 + Math.floor(Math.random() * 8000);
    }

    const res = await query(
      `INSERT INTO deployments (
        id, service_id, project_id, team_id, triggered_by, trigger,
        commit_hash, commit_message, commit_author, branch,
        region, internal_port, deployment_url, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'queued')
       RETURNING *`,
      [
        id, args.serviceId ?? null, args.projectId, args.teamId, args.triggeredBy, args.trigger,
        args.commitHash, args.commitMessage, args.commitAuthor, args.branch,
        args.region, internalPort, deploymentUrl,
      ]
    );

    logger.info('deployment created', {
      id, service: args.serviceId, project: args.projectId, region: args.region,
    });
    return res.rows[0];
  },

  async get(id: string): Promise<Deployment | null> {
    const r = await query(`SELECT * FROM deployments WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  },

  async listForProject(projectId: string, limit = 50): Promise<Deployment[]> {
    const r = await query(
      `SELECT * FROM deployments WHERE project_id = $1
        ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    return r.rows;
  },

  async listForTeam(teamId: string, limit = 100): Promise<Deployment[]> {
    const r = await query(
      `SELECT * FROM deployments WHERE team_id = $1
        ORDER BY created_at DESC LIMIT $2`,
      [teamId, limit]
    );
    return r.rows;
  },

  async listForService(serviceId: string, limit = 50): Promise<Deployment[]> {
    const r = await query(
      `SELECT * FROM deployments WHERE service_id = $1
        ORDER BY created_at DESC LIMIT $2`,
      [serviceId, limit]
    );
    return r.rows;
  },

  async setStatus(id: string, status: DeploymentStatus, extra?: { error?: string }) {
    const sets: string[] = ['status = $2'];
    const params: unknown[] = [id, status];

    if (status === 'building' || status === 'cloning') {
      sets.push('started_at = COALESCE(started_at, now())');
    }
    if (status === 'ready') {
      sets.push('ready_at = now()');
      sets.push('duration_ms = EXTRACT(EPOCH FROM (now() - queued_at)) * 1000');
    }
    if (status === 'failed' && extra?.error) {
      sets.push(`error_message = $${params.length + 1}`);
      params.push(extra.error);
    }

    const r = await query(
      `UPDATE deployments SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return r.rows[0] ?? null;
  },

  async appendBuildLog(id: string, chunk: string) {
    await query(
      `UPDATE deployments
          SET build_logs = COALESCE(build_logs,'') || $2
        WHERE id = $1`,
      [id, chunk.endsWith('\n') ? chunk : chunk + '\n']
    );
  },

  async appendRuntimeLog(id: string, chunk: string) {
    await query(
      `UPDATE deployments
          SET runtime_logs = COALESCE(runtime_logs,'') || $2
        WHERE id = $1`,
      [id, chunk.endsWith('\n') ? chunk : chunk + '\n']
    );
  },

  async setContainer(id: string, containerId: string, imageTag: string) {
    await query(
      `UPDATE deployments SET container_id = $2, image_tag = $3 WHERE id = $1`,
      [id, containerId, imageTag]
    );
  },
};
