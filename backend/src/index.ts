import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { config } from './config/env.js';
import { initializeDatabase } from './db/init.js';
import { seedDatabase } from './db/seed.js';
import { registerAuthRoutes } from './routes/auth.js';
import { closeRedis } from './utils/authRateLimit.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerDeploymentRoutes } from './routes/deployments.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminEmailRoutes } from './routes/adminEmails.js';
import { registerAdminUserRoutes } from './routes/adminUsers.js';
import { registerOAuthRoutes } from './routes/oauth.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerSSERoutes } from './routes/sse.js';
import { registerAdminSuperRoutes } from './routes/adminSuper.js';
import { registerStorageRoutes } from './routes/storage.js';
import { registerServiceRoutes } from './routes/services.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { emailService } from './services/emailService.js';
import { logger, createRequestLogger } from './utils/logger.js';
import { initializeDeploymentWorker } from './engine/deploymentQueue.js';

/**
 * Flame Core API server — production-hardened.
 *
 * Process roles (via PROCESS_ROLE env):
 *  - api: HTTP server only
 *  - worker: BullMQ consumer only
 *  - all: both (default for development)
 */
async function bootstrap() {
  const processRole = process.env.PROCESS_ROLE ?? 'all';
  const isAPI = processRole === 'api' || processRole === 'all';
  const isWorker = processRole === 'worker' || processRole === 'all';

  // ─── Database ────────────────────────────────────────────────────────
  try {
    await initializeDatabase();
    await seedDatabase();
  } catch (err) {
    logger.error('database init failed', err);
    process.exit(1);
  }

  // ─── Worker ──────────────────────────────────────────────────────────
  if (isWorker) {
    logger.info(`Worker starting (region=${process.env.REGION_CODE ?? 'los1'})`);

    // Email worker: process outbox every 30s
    setInterval(async () => {
      try { await emailService.processQueue(10); } catch (e) { logger.error('email worker', e); }
    }, 30_000);

    // Health check worker: run every 30s
    setInterval(async () => {
      try {
        const { healthChecker } = await import('./engine/healthChecker.js');
        await healthChecker.runAll();
      } catch (e) { logger.error('health worker', e); }
    }, 30_000);

    // Sleep/wake idle check: run every 5min
    setInterval(async () => {
      try {
        const { sleepWakeEngine } = await import('./engine/sleepWake.js');
        await sleepWakeEngine.checkIdleDeployments();
      } catch (e) { logger.error('sleep worker', e); }
    }, 300_000);

    // BullMQ worker: processes deployment queue
    try {
      await initializeDeploymentWorker();
      logger.info('deployment worker initialized');
    } catch (err) {
      logger.error('failed to initialize deployment worker', err);
      process.exit(1);
    }
  }

  // ─── API Server ──────────────────────────────────────────────────────
  if (isAPI) {
    const app = Fastify({
      logger: false, // We use our own Pino instance + pino-http
      trustProxy: true,
      genReqId: () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    });

    // ─── Security: CORS (strict allowlist) ────────────────────────────
    const defaultOrigins = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:5173,http://localhost:3000'
      : ''; // Must be explicitly set via CORS_ORIGINS env var in production
    
    const allowedOrigins = (process.env.CORS_ORIGINS || defaultOrigins)
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    if (allowedOrigins.length === 0) {
      throw new Error('ERROR: CORS_ORIGINS must be set in production environment');
    }

    await app.register(fastifyCors, {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    // ─── Security: Rate Limiting (per-IP + per-route where applied) ───
    await app.register(fastifyRateLimit, {
      global: true,
      max: 300,
      timeWindow: '15 minutes',
      redis: process.env.REDIS_URL ? undefined : undefined, // TODO: pass Redis client for distributed
      skipOnError: true,
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: (_req, context) => ({
        error: 'Too many requests',
        retryAfter: Math.round(Number(context.after) / 1000),
      }),
    });

    // Stricter auth rate limits (applied per-route in auth.ts where needed)
    // TODO: implement per-route rate limits

    await app.register(fastifyJwt, { secret: config.jwt.secret, sign: { expiresIn: config.jwt.expiresIn } });
    await app.register(fastifyCookie);

    // ─── Structured request logging + trace ID ────────────────────────
    app.addHook('onRequest', async (req) => {
      const traceId = (req.id as string) || `trace_${Date.now()}`;
      (req as any).traceId = traceId;
      (req as any).log = createRequestLogger(traceId, {
        method: req.method,
        url: req.url,
        ip: req.ip,
      });
    });

    // ─── Routes ──────────────────────────────────────────────────────
    await registerCatalogRoutes(app);
    await registerAuthRoutes(app);
    await registerOAuthRoutes(app);
    await registerWebhookRoutes(app);
    await registerSSERoutes(app);
    await registerProjectRoutes(app);
    await registerServiceRoutes(app);
    await registerTemplateRoutes(app);
    await registerStorageRoutes(app);
    await registerDeploymentRoutes(app);
    await registerBillingRoutes(app);
    await registerAdminRoutes(app);
    await registerAdminEmailRoutes(app);
    await registerAdminUserRoutes(app);
    await registerAdminSuperRoutes(app);

    // ─── Error handler (safe in production) ──────────────────────────
    app.setErrorHandler((err, req, reply) => {
      const traceId = (req as any).traceId;
      const isProd = config.api.env === 'production';
      logger.error({ err, trace_id: traceId }, 'request error');

      const status = (err as any).statusCode ?? 500;
      const message = (err as any).message ?? (err instanceof Error ? err.message : 'error');
      reply.status(status).send({
        error: isProd && status >= 500 ? 'internal server error' : message,
        ...(traceId ? { trace_id: traceId } : {}),
      });
    });

    // ─── Graceful shutdown ───────────────────────────────────────────
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'shutting down');
      try {
        await app.close();
        await closeRedis();
      } catch (e) {
        logger.error({ err: e }, 'close error');
      }
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // ─── Start ───────────────────────────────────────────────────────
    try {
      // Try ports 3001-3010 in order, write actual port to file for nginx/discovery
      let actualPort = 0;
      const portFile = join('/root/flame-core', 'backend-port.txt');
      const basePort = config.api.port;
      
      for (let i = 0; i < 10; i++) {
        const portToTry = basePort + i;
        try {
          const address = await app.listen({ port: portToTry, host: config.api.host });
          actualPort = portToTry;
          // Write port to file for nginx and other services to discover
          try {
            writeFileSync(portFile, String(actualPort));
            logger.info(`📝 Backend port written to ${portFile}`);
          } catch (e) {
            logger.warn('Could not write port file (non-critical)');
          }
          break;
        } catch (err: any) {
          if (err.code === 'EADDRINUSE' && i < 9) {
            logger.warn(`Port ${portToTry} in use, trying ${portToTry + 1}...`);
            continue;
          }
          throw err;
        }
      }
      
      logger.info(`🔥 Flame Core API listening on http://${config.api.host}:${actualPort}`);
      logger.info({ processRole, env: config.api.env, admin: process.env.ADMIN_EMAIL ?? 'admin@flamecore.app', port: actualPort }, 'startup complete');
    } catch (err) {
      logger.error({ err }, 'listen failed');
      process.exit(1);
    }
  }

  // ─── Start Deployment Worker (real pipeline) ───────────────────────
  if (isWorker) {
    try {
      const worker = await initializeDeploymentWorker();
      logger.info('deployment worker initialized');
      // Keep reference if needed for graceful shutdown later
      (globalThis as any).__flameDeploymentWorker = worker;
    } catch (err) {
      logger.error({ err }, 'failed to start deployment worker');
      // Do not exit — API can still run for management
    }
  }
}

bootstrap();
