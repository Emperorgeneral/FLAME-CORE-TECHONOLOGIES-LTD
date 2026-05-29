import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { dockerEngine } from '../engine/dockerEngine.js';
import { logger } from '../utils/logger.js';

/**
 * Unified Service Manager.
 *
 * Everything on the platform is a Service: apps from GitHub, Docker images,
 * databases, templates, empty projects. They all share the same lifecycle:
 *   create → provision → deploy → run → redeploy → stop → destroy
 *
 * Projects are just containers: Project → [Service, Service, Service]
 * Services communicate over private networking: <slug>-<id>.flame.internal
 */

export type ServiceCategory = 'git_repo' | 'docker' | 'database' | 'template' | 'empty';

const DB_IMAGES: Record<string, { image: string; port: number; versions: string[] }> = {
  postgres:       { image: 'postgres',          port: 5432,  versions: ['17','16','15','14'] },
  mysql:          { image: 'mysql',             port: 3306,  versions: ['8.4','8.0','5.7'] },
  redis:          { image: 'redis',             port: 6379,  versions: ['7.4','7.2','6.2'] },
  mongodb:        { image: 'mongo',             port: 27017, versions: ['7.0','6.0','5.0'] },
  mariadb:        { image: 'mariadb',           port: 3306,  versions: ['11.4','10.11'] },
  rabbitmq:       { image: 'rabbitmq',          port: 5672,  versions: ['4.0','3.13'] },
  elasticsearch:  { image: 'elasticsearch',     port: 9200,  versions: ['8.15','7.17'] },
  minio:          { image: 'minio/minio',       port: 9000,  versions: ['latest'] },
};

export const serviceManager = {
  // ═══════════════════════════════════════════════════════════════════════
  //  CREATE (unified for all categories)
  // ═══════════════════════════════════════════════════════════════════════
  async create(args: {
    projectId: string;
    teamId: string;
    name: string;
    category: ServiceCategory;
    userId: string;
    // git_repo
    sourceProvider?: string;
    repoUrl?: string;
    defaultBranch?: string;
    autodeployEnabled?: boolean;
    // docker
    dockerImage?: string;
    // database
    dbEngine?: string;
    dbVersion?: string;
    // build config
    framework?: string;
    buildCommand?: string;
    startCommand?: string;
    installCommand?: string;
    rootDirectory?: string;
    dockerfilePath?: string;
    // runtime
    region?: string;
    internalPort?: number;
    isPublic?: boolean;
    memoryMb?: number;
    cpuMillicores?: number;
    icon?: string;
    // advanced per-room settings
    networkMode?: 'private' | 'public' | 'custom';
    networkAliases?: string[];
    httpProxyEnabled?: boolean;
    httpProxyPath?: string;
    httpProxyTargetPort?: number;
    httpsProxyEnabled?: boolean;
    proxyHeaders?: Record<string, string>;
    preDeployCommand?: string;
    healthCheckPath?: string;
    cronSchedule?: string;
    restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
    restartRetries?: number;
    replicas?: number;
  }) {
    const id = uuidv4();
    const shortId = id.split('-')[0];
    const slug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const containerName = `flame-${shortId}`;
    const internalHostname = `${slug}-${shortId}.flame.internal`;
    const refPrefix = slug.replace(/-/g, '_');
    const region = args.region ?? 'los1';

    // Parse repo owner/name
    let repoOwner: string | null = null;
    let repoName: string | null = null;
    if (args.repoUrl) {
      const m = args.repoUrl.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
      repoOwner = m?.[1] ?? null;
      repoName = m?.[2] ?? null;
    }

    // Database-specific setup
    let credentialsEncrypted: string | null = null;
    let connectionToken: string | null = null;
    let connectionTokenHash: string | null = null;
    let internalPort = args.internalPort ?? 3000;
    let initialStatus: string = 'inactive';

    if (args.category === 'database' && args.dbEngine) {
      const dbConfig = DB_IMAGES[args.dbEngine];
      if (!dbConfig) throw new Error(`Unknown database engine: ${args.dbEngine}`);

      internalPort = dbConfig.port;
      const password = crypto.randomBytes(24).toString('base64url');
      const username = args.dbEngine === 'redis' ? '' : `flame_${shortId.slice(0, 8)}`;
      const database = ['redis', 'rabbitmq', 'elasticsearch', 'minio'].includes(args.dbEngine) ? '' : `flame_${args.projectId.split('-')[0]}`;

      const creds = {
        host: internalHostname,
        port: internalPort,
        username,
        password,
        database,
        url: this._buildConnectionUrl(args.dbEngine, internalHostname, internalPort, username, password, database),
      };
      credentialsEncrypted = encrypt(JSON.stringify(creds));

      connectionToken = `fct_${crypto.randomBytes(32).toString('hex')}`;
      connectionTokenHash = crypto.createHash('sha256').update(connectionToken).digest('hex');
      initialStatus = 'provisioning';
    }

    const r = await query(
      `INSERT INTO services (
        id, project_id, team_id, name, slug, icon,
        service_category,
        source_provider, repo_url, repo_owner, repo_name, default_branch, autodeploy_enabled,
        docker_image,
        db_engine, db_version, credentials_encrypted, connection_token, connection_token_hash,
        framework, build_command, start_command, install_command, root_directory, dockerfile_path,
        region, internal_port, container_name, internal_hostname,
        is_public, memory_mb, cpu_millicores,
        network_mode, network_aliases, http_proxy_enabled, http_proxy_path, http_proxy_target_port,
        https_proxy_enabled, proxy_headers, pre_deploy_command, health_check_path, cron_schedule,
        restart_policy, restart_retries, replicas,
        ref_prefix, status
       ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
        $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,
        $46,$47
       ) RETURNING *`,
      [
        id, args.projectId, args.teamId, args.name, slug, args.icon ?? null,
        args.category,
        args.sourceProvider ?? null, args.repoUrl ?? null, repoOwner, repoName, args.defaultBranch ?? 'main', args.autodeployEnabled ?? true,
        args.dockerImage ?? null,
        args.dbEngine ?? null, args.dbVersion ?? null, credentialsEncrypted, connectionToken ? encrypt(connectionToken) : null, connectionTokenHash,
        args.framework ?? 'auto', args.buildCommand ?? null, args.startCommand ?? null, args.installCommand ?? null, args.rootDirectory ?? null, args.dockerfilePath ?? null,
        region, internalPort, containerName, internalHostname,
        args.isPublic ?? (args.category !== 'database'), args.memoryMb ?? 512, args.cpuMillicores ?? 500,
        args.networkMode ?? 'private', args.networkAliases ?? [], args.httpProxyEnabled ?? true,
        args.httpProxyPath ?? '/', args.httpProxyTargetPort ?? null, args.httpsProxyEnabled ?? true,
        JSON.stringify(args.proxyHeaders ?? {}), args.preDeployCommand ?? null,
        args.healthCheckPath ?? '/', args.cronSchedule ?? null,
        args.restartPolicy ?? 'unless-stopped', args.restartRetries ?? 3, args.replicas ?? 1,
        refPrefix, initialStatus,
      ]
    );

    const service = r.rows[0];

    // Auto-provision database containers immediately
    if (args.category === 'database' && args.dbEngine) {
      await this._provisionDatabase(service, args.dbEngine, args.dbVersion ?? DB_IMAGES[args.dbEngine].versions[0]);
    }

    // Audit
    await query(
      `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'user', 'service.created', 'service', $3, $4)`,
      [args.teamId, args.userId, id, JSON.stringify({ category: args.category, name: args.name })]
    );

    logger.info('service created', { id, name: args.name, category: args.category, project: args.projectId });

    return {
      ...service,
      // Only return raw connection token on first creation
      _connection_token_raw: connectionToken,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  READ
  // ═══════════════════════════════════════════════════════════════════════
  async get(id: string) {
    const r = await query(`SELECT * FROM services WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  },

  async listForProject(projectId: string) {
    const r = await query(
      `SELECT * FROM services WHERE project_id = $1 ORDER BY
        CASE service_category WHEN 'git_repo' THEN 0 WHEN 'docker' THEN 1 WHEN 'template' THEN 2 WHEN 'database' THEN 3 ELSE 4 END,
        created_at`,
      [projectId]
    );
    return r.rows;
  },

  async listHistoricalForProject(projectId: string) {
    const r = await query(
      `SELECT * FROM services WHERE project_id = $1 ORDER BY deleted_at DESC NULLS LAST, updated_at DESC`,
      [projectId]
    );
    return r.rows;
  },

  async deploymentHistory(serviceId: string) {
    const r = await query(
      `SELECT id, status, trigger, commit_hash, commit_message, branch, image_source,
              deployment_url, duration_ms, created_at, ready_at, error_message
         FROM deployments
        WHERE service_id = $1
        ORDER BY created_at DESC`,
      [serviceId]
    );
    return r.rows;
  },

  async logs(serviceId: string, stream?: string) {
    const params: unknown[] = [serviceId];
    let where = 'WHERE service_id = $1';
    if (stream) {
      params.push(stream);
      where += ` AND stream = $${params.length}`;
    }
    const r = await query(
      `SELECT id, deployment_id, stream, level, message, trace_id, metadata, created_at
         FROM deployment_log_events
        ${where}
        ORDER BY created_at DESC LIMIT 500`,
      params
    );
    return r.rows;
  },

  async appendLog(args: {
    serviceId: string;
    deploymentId?: string | null;
    projectId: string;
    teamId: string;
    stream: 'build' | 'runtime' | 'http' | 'network' | 'system' | 'database' | 'backup' | 'replication';
    level?: 'debug' | 'info' | 'warn' | 'error' | 'ok';
    message: string;
    traceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    await query(
      `INSERT INTO deployment_log_events (deployment_id, service_id, project_id, team_id, stream, level, message, trace_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [args.deploymentId ?? null, args.serviceId, args.projectId, args.teamId, args.stream, args.level ?? 'info', args.message, args.traceId ?? null, JSON.stringify(args.metadata ?? {})]
    );
  },

  async listForTeam(teamId: string) {
    const r = await query(
      `SELECT s.*, p.name AS project_name, p.slug AS project_slug
         FROM services s
         JOIN projects p ON p.id = s.project_id
        WHERE s.team_id = $1
        ORDER BY s.updated_at DESC`,
      [teamId]
    );
    return r.rows;
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  UPDATE
  // ═══════════════════════════════════════════════════════════════════════
  async update(id: string, updates: Record<string, any>) {
    const allowed = [
      'name', 'icon', 'default_branch', 'autodeploy_enabled',
      'docker_image', 'framework', 'build_command', 'start_command', 'install_command',
      'root_directory', 'dockerfile_path', 'region', 'internal_port',
      'is_public', 'memory_mb', 'cpu_millicores', 'status',
      'repo_url', 'source_provider', 'default_branch',
      'network_mode', 'network_aliases',
      'http_proxy_enabled', 'http_proxy_path', 'http_proxy_target_port',
      'https_proxy_enabled', 'proxy_headers',
      'pre_deploy_command', 'health_check_path', 'cron_schedule',
      'restart_policy', 'restart_retries', 'replicas',
    ];
    const fields = Object.keys(updates).filter((k) => allowed.includes(k));
    if (!fields.length) return this.get(id);

    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const vals = fields.map((f) => updates[f]);

    const r = await query(
      `UPDATE services SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...vals]
    );
    return r.rows[0] ?? null;
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  LIFECYCLE (start, stop, restart, destroy)
  // ═══════════════════════════════════════════════════════════════════════
  async start(id: string) {
    const svc = await this.get(id);
    if (!svc) throw new Error('service not found');

    if (svc.container_name) {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      try {
        await promisify(exec)(`docker start ${svc.container_name}`);
      } catch {
        // Container doesn't exist, need re-provision
        logger.warn('container not found, needs re-provision', { service: id });
      }
    }

    await this.update(id, { status: 'running' });
    logger.info('service started', { service: id });
  },

  async stop(id: string) {
    const svc = await this.get(id);
    if (!svc) return;
    if (svc.container_name) await dockerEngine.stopContainer(svc.container_name);
    await this.update(id, { status: 'stopped' });
    logger.info('service stopped', { service: id });
  },

  async restart(id: string) {
    const svc = await this.get(id);
    if (!svc) return;
    if (svc.container_name) {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      try { await promisify(exec)(`docker restart ${svc.container_name}`); } catch { /* */ }
    }
    await this.update(id, { status: 'running' });
    logger.info('service restarted', { service: id });
  },

  async destroy(id: string, userId: string) {
    const svc = await this.get(id);
    if (!svc) return;

    // Remove container
    if (svc.container_name) await dockerEngine.removeContainer(svc.container_name);

    // Soft-delete only. Deployments, historical logs, domains and settings remain
    // queryable for audit/debugging, but the room is hidden from active views.
    await query(
      `UPDATE services
          SET status = 'deleted', deleted_at = now(), archived_snapshot = to_jsonb(services), updated_at = now()
        WHERE id = $1`,
      [id]
    );

    // Audit
    await query(
      `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'user', 'service.destroyed', 'service', $3, $4)`,
      [svc.team_id, userId, id, JSON.stringify({ name: svc.name, category: svc.service_category })]
    );

    logger.info('service destroyed', { service: id, name: svc.name });
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  CREDENTIALS (database services only)
  // ═══════════════════════════════════════════════════════════════════════
  async getCredentials(serviceId: string) {
    const r = await query(`SELECT credentials_encrypted FROM services WHERE id = $1`, [serviceId]);
    if (!r.rows[0]?.credentials_encrypted) return null;
    return JSON.parse(decrypt(r.rows[0].credentials_encrypted));
  },

  async regenerateToken(serviceId: string) {
    const token = `fct_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await query(
      `UPDATE services SET connection_token = $2, connection_token_hash = $3, updated_at = now() WHERE id = $1`,
      [serviceId, encrypt(token), hash]
    );
    return token;
  },

  async revokeToken(serviceId: string) {
    await query(`UPDATE services SET connection_token = NULL, connection_token_hash = NULL, updated_at = now() WHERE id = $1`, [serviceId]);
  },

  async validateToken(token: string) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const r = await query(`SELECT * FROM services WHERE connection_token_hash = $1 AND status = 'running'`, [hash]);
    return r.rows[0] ?? null;
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  REFERENCE VARIABLES
  // ═══════════════════════════════════════════════════════════════════════
  async injectReferenceVars(serviceId: string, projectId: string, refPrefix: string, creds: any) {
    const vars: Record<string, string> = {};
    vars[`${refPrefix.toUpperCase()}_HOST`] = creds.host;
    vars[`${refPrefix.toUpperCase()}_PORT`] = String(creds.port);
    vars[`${refPrefix.toUpperCase()}_URL`] = creds.url;
    if (creds.username) vars[`${refPrefix.toUpperCase()}_USER`] = creds.username;
    if (creds.password) vars[`${refPrefix.toUpperCase()}_PASSWORD`] = creds.password;
    if (creds.database) vars[`${refPrefix.toUpperCase()}_DATABASE`] = creds.database;

    // Standard aliases
    if (creds.url?.startsWith('postgres') || creds.url?.startsWith('mysql')) vars['DATABASE_URL'] = creds.url;
    if (creds.url?.startsWith('redis')) vars['REDIS_URL'] = creds.url;
    if (creds.url?.startsWith('mongodb')) vars['MONGO_URL'] = creds.url;
    if (creds.url?.startsWith('amqp')) vars['RABBITMQ_URL'] = creds.url;

    for (const [key, value] of Object.entries(vars)) {
      await query(
        `INSERT INTO environment_variables (service_id, project_id, key, value_encrypted, is_secret, scope)
         VALUES ($1, $2, $3, $4, true, 'all')
         ON CONFLICT DO NOTHING`,
        [serviceId, projectId, key, encrypt(value)]
      );
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  INTERNAL: Provision a database container
  // ═══════════════════════════════════════════════════════════════════════
  async _provisionDatabase(svc: any, engine: string, version: string) {
    const dbConfig = DB_IMAGES[engine];
    if (!dbConfig) return;

    const creds = JSON.parse(decrypt(svc.credentials_encrypted));
    const envVars = this._buildDbEnv(engine, creds.username, creds.password, creds.database);

    logger.info('provisioning database', { engine, version, container: svc.container_name });

    const result = await dockerEngine.startContainer(
      `${dbConfig.image}:${version}`,
      svc.container_name,
      svc.internal_port,
      envVars,
      [],
      { memoryMb: 256, cpus: 0.25, restartPolicy: svc.restart_policy ?? 'unless-stopped', restartRetries: svc.restart_retries ?? 3 }
    );

    const newStatus = result.success ? 'running' : 'failed';
    await query(
      `UPDATE services SET container_id = $2, status = $3, updated_at = now() WHERE id = $1`,
      [svc.id, result.containerId ?? null, newStatus]
    );

    // Inject reference variables into the project so sibling services can use them
    if (result.success) {
      await this.injectReferenceVars(svc.id, svc.project_id, svc.ref_prefix, creds);
    }
  },

  _buildDbEnv(engine: string, username: string, password: string, database: string): Record<string, string> {
    switch (engine) {
      case 'postgres':      return { POSTGRES_USER: username, POSTGRES_PASSWORD: password, POSTGRES_DB: database };
      case 'mysql':         return { MYSQL_ROOT_PASSWORD: password, MYSQL_USER: username, MYSQL_PASSWORD: password, MYSQL_DATABASE: database };
      case 'mariadb':       return { MARIADB_ROOT_PASSWORD: password, MARIADB_USER: username, MARIADB_PASSWORD: password, MARIADB_DATABASE: database };
      case 'redis':         return password ? { REDIS_PASSWORD: password } : {};
      case 'mongodb':       return { MONGO_INITDB_ROOT_USERNAME: username, MONGO_INITDB_ROOT_PASSWORD: password };
      case 'rabbitmq':      return { RABBITMQ_DEFAULT_USER: username, RABBITMQ_DEFAULT_PASS: password };
      case 'elasticsearch': return { ELASTIC_PASSWORD: password, 'discovery.type': 'single-node', 'xpack.security.enabled': 'true' };
      case 'minio':         return { MINIO_ROOT_USER: username, MINIO_ROOT_PASSWORD: password };
      default:              return {};
    }
  },

  _buildConnectionUrl(engine: string, host: string, port: number, user: string, pass: string, db: string): string {
    switch (engine) {
      case 'postgres':      return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
      case 'mysql':
      case 'mariadb':       return `mysql://${user}:${pass}@${host}:${port}/${db}`;
      case 'redis':         return pass ? `redis://:${pass}@${host}:${port}` : `redis://${host}:${port}`;
      case 'mongodb':       return `mongodb://${user}:${pass}@${host}:${port}/${db}?authSource=admin`;
      case 'rabbitmq':      return `amqp://${user}:${pass}@${host}:${port}`;
      case 'elasticsearch': return `https://${user}:${pass}@${host}:${port}`;
      case 'minio':         return `http://${user}:${pass}@${host}:${port}`;
      default:              return `${engine}://${host}:${port}`;
    }
  },
};
