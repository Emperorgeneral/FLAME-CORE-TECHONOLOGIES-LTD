import dotenv from 'dotenv';

dotenv.config();

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://flame:password@localhost:5432/flamecore',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    name: process.env.DATABASE_NAME || 'flamecore',
    user: process.env.DATABASE_USER || 'flame',
    password: process.env.DATABASE_PASSWORD || 'password',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  api: {
    port: parseInt(process.env.API_PORT || '3001'),
    host: process.env.API_HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: '7d',
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
  },
  deployment: {
    basePath: process.env.DEPLOYMENT_BASE_PATH || '/var/deployments/flame',
    nginxSitesEnabled: process.env.NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled',
    nginxSitesAvailable: process.env.NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
