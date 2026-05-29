import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config/env.js';
import { initializeDatabase } from './db/init.js';
import { seedDatabase } from './db/seed.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerDeploymentRoutes } from './routes/deployments.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerAdminRoutes } from './routes/admin.js';
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

    // ─── Security: Helmet (headers) ───────────────────────────────────
    await app.register(fastifyHelmet, {
      contentSecurityPolicy: false, // Relaxed for API; tighten if serving HTML
      crossOriginEmbedderPolicy: false,
    });

    // ─── Security: CORS (strict allowlist) ────────────────────────────
    const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

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
        retryAfter: Math.round(context.after / 1000),
      }),
    });

    // Stricter auth rate limits (applied per-route in auth.ts where needed)
    app.setRateLimit = app.setRateLimit || {}; // placeholder for future per-route

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
    await registerAdminSuperRoutes(app);

    // ─── Error handler (safe in production) ──────────────────────────
    app.setErrorHandler((err, req, reply) => {
      const traceId = (req as any).traceId;
      const isProd = config.api.env === 'production';
      logger.error({ err, trace_id: traceId }, 'request error');

      const status = err.statusCode ?? 500;
      reply.status(status).send({
        error: isProd && status >= 500 ? 'internal server error' : (err.message || 'error'),
        ...(traceId ? { trace_id: traceId } : {}),
      });
    });

    // ─── Graceful shutdown ───────────────────────────────────────────
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'shutting down');
      try {
        await app.close();
      } catch (e) {
        logger.error({ err: e }, 'close error');
      }
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // ─── Start ───────────────────────────────────────────────────────
    try {
      await app.listen({ port: config.api.port, host: config.api.host });
      logger.info(`🔥 Flame Core API listening on http://${config.api.host}:${config.api.port}`);
      logger.info({ processRole, env: config.api.env, admin: process.env.ADMIN_EMAIL ?? 'admin@flamecore.app' }, 'startup complete');
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
