import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import type { Project, RegionCode, DeploymentSource, FrameworkType } from '../types/index.js';

/**
 * Team-scoped project service. Projects belong to teams (not individual users)
 * — even single-developer accounts get an auto-created personal team. This
 * keeps the data model identical whether the customer is solo or a 50-seat org.
 */
export const projectService = {
  async create(args: {
    teamId: string;
    name: string;
    description?: string;
    source?: DeploymentSource;
    repoUrl: string;
    defaultBranch?: string;
    framework?: FrameworkType;
    primaryRegion?: RegionCode;
  }): Promise<Project> {
    const id = uuidv4();
    const slug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

    // Extract owner/name from common git host URLs.
    const m = args.repoUrl.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    const repoOwner = m?.[1] ?? '';
    const repoName  = m?.[2] ?? '';

    const r = await query(
      `INSERT INTO projects (
        id, team_id, name, slug, description,
        source, repo_url, repo_owner, repo_name, default_branch,
        framework, primary_region
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        id, args.teamId, args.name, slug, args.description ?? '',
        args.source ?? 'github', args.repoUrl, repoOwner, repoName, args.defaultBranch ?? 'main',
        args.framework ?? 'unknown', args.primaryRegion ?? 'los1',
      ]
    );

    logger.info('project created', { id, team: args.teamId, region: args.primaryRegion ?? 'los1' });
    return r.rows[0];
  },

  async get(id: string): Promise<Project | null> {
    const r = await query(`SELECT * FROM projects WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  },

  async listForTeam(teamId: string): Promise<Project[]> {
    const r = await query(
      `SELECT * FROM projects WHERE team_id = $1 ORDER BY updated_at DESC`,
      [teamId]
    );
    return r.rows;
  },

  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    const allowed: (keyof Project)[] = [
      'name', 'description', 'default_branch', 'framework',
      'build_command', 'start_command', 'install_command',
      'root_directory', 'dockerfile_path', 'primary_region',
      'autodeploy_enabled', 'status',
    ];
    const fields = Object.keys(updates).filter((k) => allowed.includes(k as keyof Project));
    if (fields.length === 0) return this.get(id);

    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const vals = fields.map((f) => updates[f as keyof Project]);

    const r = await query(
      `UPDATE projects SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...vals]
    );
    return r.rows[0] ?? null;
  },
};
