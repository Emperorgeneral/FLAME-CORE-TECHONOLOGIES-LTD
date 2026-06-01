/**
 * PM2 Ecosystem Configuration for Flame Core
 *
 * Run: pm2 start ecosystem.config.js
 * Logs: pm2 logs
 * Monitor: pm2 monit
 * Restart: pm2 restart all
 *
 * Architecture:
 *  - api: Fastify API server (handles HTTP requests)
 *  - worker: BullMQ deployment worker (processes builds)
 *  - builder: (future) separate builder process for heavy builds
 *
 * All processes run on the same VPS for MVP. For scale, move 'worker'
 * and 'builder' to dedicated builder VPS instances.
 */

module.exports = {
  apps: [
    {
      name: 'flame-core-backend',
      script: './dist/index.js',
      cwd: '/root/flame-core/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'api',
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        API_PORT: process.env.API_PORT || '3002',
        JWT_SECRET: process.env.JWT_SECRET,
      },
      // Resource limits
      max_memory_restart: '512M',
      // Restart policy
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      log_file: '/root/flame-core/logs/api-combined.log',
      out_file: '/root/flame-core/logs/api-out.log',
      error_file: '/root/flame-core/logs/api-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'flame-core-worker',
      script: './dist/index.js',
      cwd: '/root/flame-core/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'worker',
        REGION_CODE: process.env.REGION_CODE || 'los1',
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        JWT_SECRET: process.env.JWT_SECRET,
      },
      // Higher memory for builds
      max_memory_restart: '2G',
      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '30s',
      // Logging
      log_file: '/root/flame-core/logs/worker-combined.log',
      out_file: '/root/flame-core/logs/worker-out.log',
      error_file: '/root/flame-core/logs/worker-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 30000, // allow builds to finish gracefully
    },
    // Future: separate builder process
    // {
    //   name: 'flame-builder',
    //   script: './dist/index.js',
    //   env: { PROCESS_ROLE: 'builder', REGION_CODE: 'los1' },
    //   instances: 2,
    //   max_memory_restart: '4G',
    // },
  ],

  deploy: {
    production: {
      user: 'root',
      host: ['vmi3227630'],
      ref: 'origin/main',
      repo: 'https://github.com/Emperorgeneral/FLAME-CORE-TECHONOLOGIES-LTD.git',
      path: '/root/flame-core',
      'post-deploy': 'git pull origin main && npm install && cd backend && npm install && npm run build && cd .. && npm run build && pm2 start ecosystem.config.js',
      'pre-setup': 'mkdir -p /root/flame-core/logs',
    },
  },
};
