/**
 * Service Definition Registry
 *
 * Maps service types to their configuration schemas, environment variables,
 * and platform-specific settings.
 */

export interface ServiceSetting {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  required: boolean;
  defaultValue?: string | number | boolean;
  options?: { label: string; value: string }[];
  envVarName?: string;
}

export interface ServiceDefinition {
  category: string;
  icon: string;
  label: string;
  description: string;
  settings: ServiceSetting[];
  environmentVariables: { name: string; description: string }[];
  ports: { internal: number; external: number; protocol: 'http' | 'tcp' | 'udp' }[];
  healthCheck?: {
    endpoint: string;
    interval: number;
    timeout: number;
  };
}

const definitions: Record<string, ServiceDefinition> = {
  // Application services
  'nodejs-app': {
    category: 'app',
    icon: 'nodejs',
    label: 'Node.js App',
    description: 'Deploy a Node.js application from GitHub',
    settings: [
      { key: 'repo_url', label: 'Repository URL', description: 'GitHub repository URL', type: 'string', required: true },
      { key: 'branch', label: 'Branch', description: 'Git branch to deploy', type: 'string', required: false, defaultValue: 'main' },
      { key: 'build_command', label: 'Build Command', description: 'Command to run before starting', type: 'string', required: false },
      { key: 'start_command', label: 'Start Command', description: 'Command to start the app', type: 'string', required: true, defaultValue: 'npm start' },
      { key: 'node_version', label: 'Node.js Version', description: 'Node.js version to use', type: 'string', required: false, defaultValue: '20' },
    ],
    environmentVariables: [
      { name: 'NODE_ENV', description: 'Environment (production/development)' },
      { name: 'PORT', description: 'Port number (set by platform)' },
    ],
    ports: [{ internal: 3000, external: 80, protocol: 'http' }],
    healthCheck: { endpoint: '/', interval: 30, timeout: 10 },
  },

  'python-app': {
    category: 'app',
    icon: 'python',
    label: 'Python App',
    description: 'Deploy a Python application from GitHub',
    settings: [
      { key: 'repo_url', label: 'Repository URL', description: 'GitHub repository URL', type: 'string', required: true },
      { key: 'branch', label: 'Branch', description: 'Git branch to deploy', type: 'string', required: false, defaultValue: 'main' },
      { key: 'python_version', label: 'Python Version', description: 'Python version to use', type: 'string', required: false, defaultValue: '3.11' },
      { key: 'start_command', label: 'Start Command', description: 'Command to start the app', type: 'string', required: true },
    ],
    environmentVariables: [
      { name: 'PYTHON_ENV', description: 'Environment (production/development)' },
      { name: 'PORT', description: 'Port number (set by platform)' },
    ],
    ports: [{ internal: 5000, external: 80, protocol: 'http' }],
  },

  'docker-image': {
    category: 'app',
    icon: 'docker',
    label: 'Docker Image',
    description: 'Deploy from a Docker image',
    settings: [
      { key: 'docker_image', label: 'Docker Image', description: 'Image name:tag', type: 'string', required: true },
      { key: 'registry_url', label: 'Registry URL', description: 'Docker registry URL (optional)', type: 'string', required: false },
      { key: 'registry_username', label: 'Registry Username', description: 'Username for private registry', type: 'string', required: false },
      { key: 'registry_password', label: 'Registry Password', description: 'Password for private registry', type: 'secret', required: false },
      { key: 'internal_port', label: 'Internal Port', description: 'Port exposed by container', type: 'number', required: true, defaultValue: 3000 },
    ],
    environmentVariables: [],
    ports: [{ internal: 3000, external: 80, protocol: 'http' }],
  },

  // Database services
  'postgresql': {
    category: 'database',
    icon: 'postgres',
    label: 'PostgreSQL',
    description: 'PostgreSQL relational database',
    settings: [
      { key: 'postgres_version', label: 'Version', description: 'PostgreSQL version', type: 'select', required: true, options: [
        { label: '16', value: '16' },
        { label: '15', value: '15' },
        { label: '14', value: '14' },
      ], defaultValue: '16' },
      { key: 'db_name', label: 'Database Name', description: 'Initial database to create', type: 'string', required: true, defaultValue: 'appdb' },
      { key: 'root_password', label: 'Root Password', description: 'Password for postgres user', type: 'secret', required: true },
    ],
    environmentVariables: [
      { name: 'DATABASE_URL', description: 'Connection string (set by platform)' },
    ],
    ports: [{ internal: 5432, external: 5432, protocol: 'tcp' }],
    healthCheck: { endpoint: '', interval: 30, timeout: 10 },
  },

  'mysql': {
    category: 'database',
    icon: 'mysql',
    label: 'MySQL',
    description: 'MySQL relational database',
    settings: [
      { key: 'mysql_version', label: 'Version', description: 'MySQL version', type: 'select', required: true, options: [
        { label: '8.0', value: '8.0' },
        { label: '5.7', value: '5.7' },
      ], defaultValue: '8.0' },
      { key: 'db_name', label: 'Database Name', description: 'Initial database to create', type: 'string', required: true, defaultValue: 'appdb' },
      { key: 'root_password', label: 'Root Password', description: 'Password for root user', type: 'secret', required: true },
    ],
    environmentVariables: [
      { name: 'DATABASE_URL', description: 'Connection string (set by platform)' },
    ],
    ports: [{ internal: 3306, external: 3306, protocol: 'tcp' }],
  },

  'redis': {
    category: 'database',
    icon: 'redis',
    label: 'Redis',
    description: 'Redis in-memory data store',
    settings: [
      { key: 'redis_version', label: 'Version', description: 'Redis version', type: 'string', required: false, defaultValue: 'latest' },
      { key: 'requirepass', label: 'Password', description: 'Redis password (optional)', type: 'secret', required: false },
      { key: 'maxmemory_policy', label: 'Memory Policy', description: 'Eviction policy', type: 'select', required: false, options: [
        { label: 'noeviction', value: 'noeviction' },
        { label: 'allkeys-lru', value: 'allkeys-lru' },
        { label: 'volatile-lru', value: 'volatile-lru' },
      ], defaultValue: 'noeviction' },
    ],
    environmentVariables: [
      { name: 'REDIS_URL', description: 'Connection string (set by platform)' },
    ],
    ports: [{ internal: 6379, external: 6379, protocol: 'tcp' }],
  },

  'mongodb': {
    category: 'database',
    icon: 'mongodb',
    label: 'MongoDB',
    description: 'MongoDB NoSQL database',
    settings: [
      { key: 'mongo_version', label: 'Version', description: 'MongoDB version', type: 'string', required: false, defaultValue: 'latest' },
      { key: 'root_username', label: 'Root Username', description: 'Admin username', type: 'string', required: true, defaultValue: 'admin' },
      { key: 'root_password', label: 'Root Password', description: 'Admin password', type: 'secret', required: true },
    ],
    environmentVariables: [
      { name: 'MONGODB_URL', description: 'Connection string (set by platform)' },
    ],
    ports: [{ internal: 27017, external: 27017, protocol: 'tcp' }],
  },
};

export const serviceDefinitionRegistry = {
  /**
   * Get definition for a service type
   */
  get(category: string): ServiceDefinition | undefined {
    return definitions[category];
  },

  /**
   * Get definition based on create payload (infer type from body.category or service_type)
   */
  forCreatePayload(body: any): ServiceDefinition {
    const category = body.category || body.service_type;
    const def = definitions[category];
    if (!def) {
      throw new Error(`unknown service type: ${category}`);
    }
    return def;
  },

  /**
   * List all available service definitions
   */
  listAll(): ServiceDefinition[] {
    return Object.values(definitions);
  },

  /**
   * Get definitions by category (app, database, addon, etc.)
   */
  byCategory(category: string): ServiceDefinition[] {
    return Object.values(definitions).filter((def) => def.category === category);
  },
};
