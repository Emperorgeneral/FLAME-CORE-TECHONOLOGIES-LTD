import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { dockerEngine } from '../engine/dockerEngine.js';

/**
 * Attached Service Manager — Railway-style service mesh for Flame Core.
 *
 * When a user deploys an app, they can "attach" infrastructure services:
 *  - PostgreSQL, MySQL, Redis, MongoDB, SQLite volumes, Kafka
 *
 * Each attached service:
 *  1. Runs in its own Docker container on the same VPS
 *  2. Gets a private internal hostname: <service>-<short_id>.flame.internal
 *  3. Gets auto-generated secure credentials
 *  4. Gets a connection token (for external access from dev machines)
 *  5. Auto-injects connection env vars into the parent deployment
 *
 * Security:
 *  - All credentials encrypted at rest (AES-256-GCM)
 *  - Internal hostnames only routable on Docker bridge network
 *  - Connection tokens are revocable & regeneratable
 *  - Each project gets an isolated Docker network
 *
 * Reference variables (like Railway's ${{Postgres.DATABASE_URL}}):
 *  - Resolved at deploy time by the deployment engine
 *  - Stored as `${{service_name.VAR_NAME}}` in env vars
 *  - The engine replaces them with real values before injecting into containers
 */

export type AttachedServiceType = 'postgres' | 'mysql' | 'redis' | 'mongodb' | 'sqlite' | 'kafka';

export interface AttachedService {
  id: string;
  project_id: string;
  team_id: string;
  service_type: AttachedServiceType;
  service_name: string;         // user-friendly name, e.g. "Primary DB"
  version: string;              // e.g. "17", "8.4", "7.4"
  container_id: string | null;
  container_name: string;       // flame-svc-<short_id>
  internal_host: string;        // <name>-<id>.flame.internal
  internal_port: number;
  status: 'provisioning' | 'running' | 'stopped' | 'failed';
  // Credentials (encrypted at rest)
  credentials_encrypted: string;
  // Connection token for external access
  connection_token: string | null;
  connection_token_hash: string | null;
  // Reference variable prefix (used in ${{prefix.VAR}})
  ref_prefix: string;
  created_at: Date;
  updated_at: Date;
}

interface ServiceCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
  connection_url: string;
  // Public proxy (optional, for external dev access)
  public_proxy_url?: string;
}

// Docker images per service type
const SERVICE_IMAGES: Record<AttachedServiceType, { image: string; defaultPort: number; versions: string[] }> = {
  postgres: { image: 'postgres', defaultPort: 5432, versions: ['17', '16', '15', '14'] },
  mysql:    { image: 'mysql',    defaultPort: 3306, versions: ['8.4', '8.0', '5.7'] },
  redis:    { image: 'redis',    defaultPort: 6379, versions: ['7.4', '7.2', '6.2'] },
  mongodb:  { image: 'mongo',    defaultPort: 27017, versions: ['7.0', '6.0', '5.0'] },
  sqlite:   { image: '',         defaultPort: 0,    versions: ['3'] },    // volume-only
  kafka:    { image: 'bitnami/kafka', defaultPort: 9092, versions: ['3.8', '3.7'] },
};

export const attachedServiceManager = {
  /**
   * Provision and start a new attached service for a project.
   */
  async provision(args: {
    projectId: string;
    teamId: string;
    serviceType: AttachedServiceType;
    serviceName: string;
    version?: string;
    userId: string;
  }): Promise<AttachedService> {
    const { projectId, teamId, serviceType, serviceName, userId } = args;
    const config = SERVICE_IMAGES[serviceType];
    if (!config) throw new Error(`Unknown service type: ${serviceType}`);

    const id = uuidv4();
    const shortId = id.split('-')[0];
    const version = args.version ?? config.versions[0];
    const slug = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const containerName = `flame-svc-${shortId}`;
    const internalHost = `${slug}-${shortId}.flame.internal`;
    const internalPort = config.defaultPort;
    const refPrefix = slug.replace(/-/g, '_');

    // Generate secure credentials
    const password = crypto.randomBytes(24).toString('base64url');
    const username = serviceType === 'redis' ? '' : `flame_${shortId.slice(0, 8)}`;
    const database = serviceType === 'redis' ? '' : `flame_${projectId.split('-')[0]}`;

    const credentials: ServiceCredentials = {
      host: internalHost,
      port: internalPort,
      username,
      password,
      database,
      connection_url: buildConnectionUrl(serviceType, internalHost, internalPort, username, password, database),
    };

    // Generate connection token for external access
    const connectionToken = `fct_${crypto.randomBytes(32).toString('hex')}`;
    const connectionTokenHash = crypto.createHash('sha256').update(connectionToken).digest('hex');

    // Encrypt credentials
    const credentialsEncrypted = encrypt(JSON.stringify(credentials));

    // SQLite is volume-only, no container needed
    if (serviceType === 'sqlite') {
      const row = await query(
        `INSERT INTO attached_services
          (id, project_id, team_id, service_type, service_name, version,
           container_name, internal_host, internal_port, status,
           credentials_encrypted, connection_token, connection_token_hash, ref_prefix)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'running',$10,$11,$12,$13)
         RETURNING *`,
        [id, projectId, teamId, serviceType, serviceName, version,
         containerName, internalHost, 0, credentialsEncrypted,
         encrypt(connectionToken), connectionTokenHash, refPrefix]
      );
      return row.rows[0];
    }

    // Build environment for the container
    const envVars = buildContainerEnv(serviceType, username, password, database);

    // Start the container
    logger.info('provisioning attached service', { type: serviceType, container: containerName, version });

    const result = await dockerEngine.startContainer(
      `${config.image}:${version}`,
      containerName,
      internalPort,
      envVars,
      [],
      { memoryMb: 256, cpus: 0.25, restartPolicy: 'unless-stopped', restartRetries: 3 }
    );

    const status = result.success ? 'running' : 'failed';

    // Store in database
    const row = await query(
      `INSERT INTO attached_services
        (id, project_id, team_id, service_type, service_name, version,
         container_id, container_name, internal_host, internal_port, status,
         credentials_encrypted, connection_token, connection_token_hash, ref_prefix)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [id, projectId, teamId, serviceType, serviceName, version,
       result.containerId ?? null, containerName, internalHost, internalPort, status,
       credentialsEncrypted, encrypt(connectionToken), connectionTokenHash, refPrefix]
    );

    // Auto-inject reference variables into the project
    await this.injectReferenceVars(projectId, refPrefix, credentials);

    // Audit
    await query(
      `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'user', 'service.provisioned', 'attached_service', $3, $4)`,
      [teamId, userId, id, JSON.stringify({
        type: serviceType, name: serviceName, version, container: containerName,
      })]
    );

    logger.info('attached service provisioned', { id, type: serviceType, status });

    return {
      ...row.rows[0],
      // Return the raw token ONLY on first creation (never stored unencrypted)
      connection_token: connectionToken,
    };
  },

  /**
   * Inject reference variables into the project's environment.
   * These are the auto-generated env vars that the app uses to connect.
   */
  async injectReferenceVars(projectId: string, prefix: string, creds: ServiceCredentials): Promise<void> {
    const vars: Record<string, string> = {
      [`${prefix.toUpperCase()}_HOST`]: creds.host,
      [`${prefix.toUpperCase()}_PORT`]: String(creds.port),
      [`${prefix.toUpperCase()}_URL`]: creds.connection_url,
    };

    if (creds.username) vars[`${prefix.toUpperCase()}_USER`] = creds.username;
    if (creds.password) vars[`${prefix.toUpperCase()}_PASSWORD`] = creds.password;
    if (creds.database) vars[`${prefix.toUpperCase()}_DATABASE`] = creds.database;

    // Standard aliases
    if (creds.connection_url.startsWith('postgres')) {
      vars['DATABASE_URL'] = creds.connection_url;
      vars['PGHOST'] = creds.host;
      vars['PGPORT'] = String(creds.port);
      vars['PGUSER'] = creds.username;
      vars['PGPASSWORD'] = creds.password;
      vars['PGDATABASE'] = creds.database!;
    } else if (creds.connection_url.startsWith('redis')) {
      vars['REDIS_URL'] = creds.connection_url;
    } else if (creds.connection_url.startsWith('mongodb')) {
      vars['MONGO_URL'] = creds.connection_url;
    } else if (creds.connection_url.startsWith('mysql')) {
      vars['MYSQL_URL'] = creds.connection_url;
    }

    for (const [key, value] of Object.entries(vars)) {
      await query(
        `INSERT INTO environment_variables (project_id, key, value_encrypted, is_secret, scope, created_by)
         VALUES ($1, $2, $3, true, 'all', NULL)
         ON CONFLICT (project_id, key, scope) DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, updated_at = now()`,
        [projectId, key, encrypt(value)]
      );
    }

    logger.info('reference variables injected', { project: projectId, prefix, count: Object.keys(vars).length });
  },

  /**
   * List attached services for a project.
   */
  async listForProject(projectId: string): Promise<AttachedService[]> {
    const r = await query(
      `SELECT * FROM attached_services WHERE project_id = $1 ORDER BY created_at`,
      [projectId]
    );
    // Never return raw tokens — they're only shown on creation
    return r.rows.map((row) => ({ ...row, connection_token: null }));
  },

  /**
   * Get decrypted credentials for an attached service.
   */
  async getCredentials(serviceId: string, teamId: string): Promise<ServiceCredentials | null> {
    const r = await query(
      `SELECT credentials_encrypted FROM attached_services WHERE id = $1 AND team_id = $2`,
      [serviceId, teamId]
    );
    if (!r.rows[0]) return null;
    return JSON.parse(decrypt(r.rows[0].credentials_encrypted));
  },

  /**
   * Regenerate the connection token. Old token is immediately invalidated.
   */
  async regenerateToken(serviceId: string, teamId: string): Promise<string> {
    const newToken = `fct_${crypto.randomBytes(32).toString('hex')}`;
    const newHash = crypto.createHash('sha256').update(newToken).digest('hex');

    await query(
      `UPDATE attached_services
          SET connection_token = $2, connection_token_hash = $3, updated_at = now()
        WHERE id = $1 AND team_id = $4`,
      [serviceId, encrypt(newToken), newHash, teamId]
    );

    logger.info('connection token regenerated', { service: serviceId });
    return newToken;
  },

  /**
   * Revoke the connection token (disable external access).
   */
  async revokeToken(serviceId: string, teamId: string): Promise<void> {
    await query(
      `UPDATE attached_services
          SET connection_token = NULL, connection_token_hash = NULL, updated_at = now()
        WHERE id = $1 AND team_id = $2`,
      [serviceId, teamId]
    );
    logger.info('connection token revoked', { service: serviceId });
  },

  /**
   * Validate a connection token. Returns the service if valid.
   */
  async validateToken(token: string): Promise<AttachedService | null> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const r = await query(
      `SELECT * FROM attached_services WHERE connection_token_hash = $1 AND status = 'running'`,
      [hash]
    );
    return r.rows[0] ?? null;
  },

  /**
   * Stop an attached service.
   */
  async stop(serviceId: string, teamId: string): Promise<void> {
    const svc = await query(`SELECT container_name FROM attached_services WHERE id = $1 AND team_id = $2`, [serviceId, teamId]);
    if (!svc.rows[0]) return;

    await dockerEngine.stopContainer(svc.rows[0].container_name);
    await query(`UPDATE attached_services SET status = 'stopped', updated_at = now() WHERE id = $1`, [serviceId]);
    logger.info('attached service stopped', { service: serviceId });
  },

  /**
   * Start a stopped attached service.
   */
  async start(serviceId: string, teamId: string): Promise<void> {
    const svc = await query(`SELECT * FROM attached_services WHERE id = $1 AND team_id = $2`, [serviceId, teamId]);
    if (!svc.rows[0]) return;

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync(`docker start ${svc.rows[0].container_name}`);
      await query(`UPDATE attached_services SET status = 'running', updated_at = now() WHERE id = $1`, [serviceId]);
      logger.info('attached service started', { service: serviceId });
    } catch (err: any) {
      logger.error('attached service start failed', { service: serviceId, error: err.message });
    }
  },

  /**
   * Delete an attached service permanently.
   */
  async destroy(serviceId: string, teamId: string, userId: string): Promise<void> {
    const svc = await query(`SELECT * FROM attached_services WHERE id = $1 AND team_id = $2`, [serviceId, teamId]);
    if (!svc.rows[0]) return;

    // Stop + remove container
    await dockerEngine.removeContainer(svc.rows[0].container_name);

    // Remove injected env vars
    const prefix = svc.rows[0].ref_prefix.toUpperCase();
    await query(
      `DELETE FROM environment_variables
        WHERE project_id = $1 AND (key LIKE $2 OR key IN ('DATABASE_URL','REDIS_URL','MONGO_URL','MYSQL_URL','PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'))`,
      [svc.rows[0].project_id, `${prefix}%`]
    );

    // Delete record
    await query(`DELETE FROM attached_services WHERE id = $1`, [serviceId]);

    // Audit
    await query(
      `INSERT INTO audit_logs (team_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'user', 'service.destroyed', 'attached_service', $3, $4)`,
      [teamId, userId, serviceId, JSON.stringify({ type: svc.rows[0].service_type, name: svc.rows[0].service_name })]
    );

    logger.info('attached service destroyed', { service: serviceId });
  },

  /**
   * Resolve reference variables in a string.
   * Replaces ${{prefix.VAR}} with actual values from attached services.
   */
  async resolveReferences(projectId: string, input: string): Promise<string> {
    const services = await this.listForProject(projectId);
    let resolved = input;

    for (const svc of services) {
      const creds = JSON.parse(decrypt(svc.credentials_encrypted)) as ServiceCredentials;
      const prefix = svc.ref_prefix;

      resolved = resolved.replace(new RegExp(`\\$\\{\\{${prefix}\\.HOST\\}\\}`, 'gi'), creds.host);
      resolved = resolved.replace(new RegExp(`\\$\\{\\{${prefix}\\.PORT\\}\\}`, 'gi'), String(creds.port));
      resolved = resolved.replace(new RegExp(`\\$\\{\\{${prefix}\\.URL\\}\\}`, 'gi'), creds.connection_url);
      resolved = resolved.replace(new RegExp(`\\$\\{\\{${prefix}\\.USERNAME\\}\\}`, 'gi'), creds.username);
      resolved = resolved.replace(new RegExp(`\\$\\{\\{${prefix}\\.PASSWORD\\}\\}`, 'gi'), creds.password);
      if (creds.database) {
        resolved = resolved.replace(new RegExp(`\\$\\{\\{${prefix}\\.DATABASE\\}\\}`, 'gi'), creds.database);
      }
    }

    return resolved;
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildConnectionUrl(
  type: AttachedServiceType,
  host: string, port: number,
  username: string, password: string, database: string
): string {
  switch (type) {
    case 'postgres':
      return `postgresql://${username}:${password}@${host}:${port}/${database}`;
    case 'mysql':
      return `mysql://${username}:${password}@${host}:${port}/${database}`;
    case 'redis':
      return password ? `redis://:${password}@${host}:${port}` : `redis://${host}:${port}`;
    case 'mongodb':
      return `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=admin`;
    case 'kafka':
      return `kafka://${host}:${port}`;
    case 'sqlite':
      return `file:/data/${database}.db`;
    default:
      return `${type}://${host}:${port}`;
  }
}

function buildContainerEnv(
  type: AttachedServiceType,
  username: string, password: string, database: string
): Record<string, string> {
  switch (type) {
    case 'postgres':
      return { POSTGRES_USER: username, POSTGRES_PASSWORD: password, POSTGRES_DB: database };
    case 'mysql':
      return { MYSQL_ROOT_PASSWORD: password, MYSQL_USER: username, MYSQL_PASSWORD: password, MYSQL_DATABASE: database };
    case 'redis':
      return password ? { REDIS_PASSWORD: password } : {};
    case 'mongodb':
      return { MONGO_INITDB_ROOT_USERNAME: username, MONGO_INITDB_ROOT_PASSWORD: password, MONGO_INITDB_DATABASE: database };
    case 'kafka':
      return {
        KAFKA_CFG_NODE_ID: '0',
        KAFKA_CFG_PROCESS_ROLES: 'controller,broker',
        KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: '0@localhost:9093',
        KAFKA_CFG_LISTENERS: 'PLAINTEXT://:9092,CONTROLLER://:9093',
        ALLOW_PLAINTEXT_LISTENER: 'yes',
      };
    default:
      return {};
  }
}
