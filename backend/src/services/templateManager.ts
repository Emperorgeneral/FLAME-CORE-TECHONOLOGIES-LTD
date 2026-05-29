import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import { serviceManager } from './serviceManager.js';
import { logger } from '../utils/logger.js';

/**
 * Template Manager.
 * Templates are blueprints for "Houses" (Projects).
 * When a Template is deployed, it creates a new House and populates it with "Rooms" (Services).
 */
export const templateManager = {
  /** Save current House (Project) as a Template */
  async createFromProject(projectId: string, userId: string, name: string, icon: string, isPublic = false) {
    const services = await serviceManager.listForProject(projectId);
    
    // Map services to a config blueprint
    const config = services.map(svc => ({
      name: svc.name,
      category: svc.service_category,
      icon: svc.icon,
      db_engine: svc.db_engine,
      db_version: svc.db_version,
      docker_image: svc.docker_image,
      framework: svc.framework,
      build_command: svc.build_command,
      start_command: svc.start_command,
      source_provider: svc.source_provider,
      repo_url: svc.repo_url,
    }));

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    const r = await query(
      `INSERT INTO templates (name, slug, icon, created_by, config, is_public) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, icon, userId, JSON.stringify(config), isPublic]
    );
    logger.info('template created', { id: r.rows[0].id, name });
    return r.rows[0];
  },

  /** Deploy a Template -> Creates a new House (Project) + Rooms (Services) */
  async deployTemplate(templateId: string, teamId: string, userId: string, customHouseName?: string) {
    const r = await query(`SELECT * FROM templates WHERE id = $1`, [templateId]);
    const template = r.rows[0];
    if (!template) throw new Error('Template not found');

    // 1. Create the House (Project) with a unique name
    const shortId = uuidv4().split('-')[0];
    const houseName = customHouseName || `${template.slug}-${shortId}`;
    const houseSlug = houseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    
    const projectRes = await query(
      `INSERT INTO projects (team_id, name, slug, description) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [teamId, houseName, houseSlug, `Deployed from template: ${template.name}`]
    );
    const project = projectRes.rows[0];

    // 2. Instantiate Rooms (Services) from config
    const config = JSON.parse(template.config);
    const createdServices = [];
    
    for (const svcConfig of config) {
      const svc = await serviceManager.create({
        projectId: project.id,
        teamId,
        userId,
        name: svcConfig.name,
        category: svcConfig.category,
        icon: svcConfig.icon,
        dbEngine: svcConfig.db_engine,
        dbVersion: svcConfig.db_version,
        dockerImage: svcConfig.docker_image,
        framework: svcConfig.framework,
        buildCommand: svcConfig.build_command,
        startCommand: svcConfig.start_command,
        sourceProvider: svcConfig.source_provider,
        repoUrl: svcConfig.repo_url,
      });
      createdServices.push(svc);
    }

    logger.info('template deployed', { templateId, projectId: project.id, servicesCount: createdServices.length });
    return { project, services: createdServices };
  },

  /** List available templates */
  async list(userId: string) {
    const r = await query(
      `SELECT * FROM templates WHERE created_by = $1 OR is_public = true ORDER BY created_at DESC`,
      [userId]
    );
    return r.rows;
  },

  /** Get a single template */
  async get(id: string) {
    const r = await query(`SELECT * FROM templates WHERE id = $1`, [id]);
    return r.rows[0] || null;
  },

  /** Delete a template */
  async delete(id: string, userId: string) {
    await query(`DELETE FROM templates WHERE id = $1 AND created_by = $2`, [id, userId]);
  }
};
