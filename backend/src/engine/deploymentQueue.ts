import { createClient } from 'redis';
import { Queue, Worker } from 'bullmq';
import { promises as fs } from 'fs';
import { config } from '../config/env.js';
import { logger, createContextLogger } from '../utils/logger.js';
import { deploymentService } from '../services/deploymentService.js';
import { volumeService } from '../services/volumeService.js';
import { query } from '../db/pool.js';
import { gitEngine } from './gitEngine.js';
import { dockerEngine } from './dockerEngine.js';
import { nginxEngine } from './nginxEngine.js';
import { decrypt } from '../utils/crypto.js';
import type { DeploymentJobPayload, RegionCode } from '../types/index.js';

/**
 * Deployment pipeline — runs end-to-end inside a BullMQ worker.
 *
 * Region-aware: the worker only picks up jobs whose `region` matches
 * the node's REGION_CODE env var. In multi-region setups each region
 * runs its own worker pool against a shared Redis. Today it's all `los1`.
 */
const redisClient = createClient({ url: config.redis.url });
redisClient.on('error', (e) => logger.error('redis', e));
redisClient.on('connect', () => logger.info('redis connected'));

export const deploymentQueue = new Queue<DeploymentJobPayload>('deployments', {
  connection: redisClient as any,
});

export async function initializeDeploymentWorker() {
  const localRegion = (process.env.REGION_CODE ?? 'los1') as RegionCode;

  const worker = new Worker<DeploymentJobPayload>(
    'deployments',
    async (job) => {
      if (job.data.region !== localRegion) {
        // Not for this node — re-queue with a small delay. In a real
        // multi-region setup, region-specific queues would prevent this.
        throw new Error(`region mismatch: ${job.data.region} ≠ ${localRegion}`);
      }
      await runPipeline(job.data);
    },
    { connection: redisClient as any, concurrency: 2 }
  );

  worker.on('completed', (job) => logger.info('job completed', { id: job.id }));
  worker.on('failed',    (job, err) => logger.error('job failed', { id: job?.id, err: err.message }));

  logger.info(`deployment worker ready (region=${localRegion})`);
  return worker;
}

async function runPipeline(d: DeploymentJobPayload) {
  const dep = await deploymentService.get(d.deployment_id);
  if (!dep) return;

  try {
    // 1. Clone
    await deploymentService.setStatus(d.deployment_id, 'cloning');
    await deploymentService.appendBuildLog(d.deployment_id, '→ cloning repository');
    const repoPath = `${config.deployment.basePath}/${d.deployment_id}`;
    const clone = await gitEngine.cloneRepository(d.repo_url, repoPath, d.branch);
    if (!clone.success) return fail(d.deployment_id, `clone failed: ${clone.error}`);
    await deploymentService.appendBuildLog(d.deployment_id, '✓ cloned');

    // 2. Framework detection
    const framework = await gitEngine.detectFramework(repoPath);
    await deploymentService.appendBuildLog(d.deployment_id, `✓ framework: ${framework}`);

    // 3. Build
    await deploymentService.setStatus(d.deployment_id, 'building');
    let dockerfilePath = `${repoPath}/Dockerfile`;
    try { await fs.access(dockerfilePath); }
    catch { dockerfilePath = await generateDockerfile(repoPath, framework ?? 'nodejs'); }

    const imageName = `flame-${d.deployment_id}`;
    const build = await dockerEngine.buildImage(dockerfilePath, imageName);
    if (!build.success) return fail(d.deployment_id, `build failed: ${build.error}`);
    await deploymentService.appendBuildLog(d.deployment_id, '✓ image built');

    // 4. Env vars — real AES-256-GCM decryption at runtime (never stored plaintext)
    const envRes = await query(
      `SELECT key, value_encrypted, is_secret FROM environment_variables WHERE project_id = $1`,
      [d.project_id]
    );
    const envDict: Record<string, string> = {};
    const log = createContextLogger({ deployment_id: d.deployment_id, project_id: d.project_id });

    for (const row of envRes.rows) {
      try {
        envDict[row.key] = decrypt(row.value_encrypted);
      } catch (e) {
        log.warn({ key: row.key }, 'failed to decrypt env var — using as-is (legacy data?)');
        // Fallback for old base64 rows during migration
        try {
          envDict[row.key] = Buffer.from(row.value_encrypted, 'base64').toString('utf8');
        } catch {
          envDict[row.key] = '';
        }
      }
    }
    log.info({ count: Object.keys(envDict).length }, 'env vars loaded for container');

    // 4b. Persistent volumes + plan resource limits
    await volumeService.ensureDefaults(d.team_id, d.project_id);
    const mounts = await volumeService.mountsForProject(d.project_id);
    const planRes = await query(
      `SELECT p.ram_mb, p.vcpu FROM teams t JOIN plans p ON p.id = t.plan_id WHERE t.id = $1`,
      [d.team_id]
    );
    const ramMb = Number(planRes.rows[0]?.ram_mb ?? 512);
    const cpuRaw = String(planRes.rows[0]?.vcpu ?? '0.5');
    const cpus = parseFloat(cpuRaw) || 0.5;

    // 5. Provision container
    await deploymentService.setStatus(d.deployment_id, 'provisioning');
    const start = await dockerEngine.startContainer(
      imageName,
      `flame-${d.deployment_id}`,
      dep.internal_port!,
      envDict,
      mounts,
      { memoryMb: ramMb, cpus }
    );
    if (!start.success) return fail(d.deployment_id, `start failed: ${start.error}`);
    await deploymentService.setContainer(d.deployment_id, start.containerId!, `${imageName}:latest`);
    await deploymentService.appendBuildLog(d.deployment_id, `✓ container: ${start.containerId}`);

    // 6. Nginx + SSL
    const nginxRes = await nginxEngine.createSiteConfig(dep.deployment_url!, dep.internal_port!, d.deployment_id);
    if (!nginxRes.success) return fail(d.deployment_id, `nginx failed: ${nginxRes.error}`);
    await deploymentService.appendBuildLog(d.deployment_id, '✓ nginx configured');

    const ssl = await nginxEngine.enableSSL(dep.deployment_url!);
    if (!ssl.success) {
      await deploymentService.appendBuildLog(d.deployment_id, `⚠ ssl deferred: ${ssl.error}`);
    } else {
      await deploymentService.appendBuildLog(d.deployment_id, '✓ ssl active');
    }

    // 7. Done
    await deploymentService.setStatus(d.deployment_id, 'ready');
    logger.info('deployment ready', { id: d.deployment_id, url: dep.deployment_url });
  } catch (err: any) {
    await fail(d.deployment_id, err?.message ?? 'unknown error');
  }
}

async function fail(id: string, msg: string) {
  logger.error('deployment failed', { id, msg });
  await deploymentService.appendBuildLog(id, `✗ ${msg}`);
  await deploymentService.setStatus(id, 'failed', { error: msg });
}

async function generateDockerfile(repoPath: string, framework: string): Promise<string> {
  const file = `${repoPath}/Dockerfile.generated`;
  const tpl = dockerfileFor(framework);
  await fs.writeFile(file, tpl);
  return file;
}

function dockerfileFor(framework: string): string {
  switch (framework) {
    case 'nextjs':
      return `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nEXPOSE 3000\nCMD ["npm","start"]\n`;
    case 'python': case 'flask': case 'django': case 'fastapi':
      return `FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["python","app.py"]\n`;
    case 'go':
      return `FROM golang:1.22-alpine AS b\nWORKDIR /src\nCOPY . .\nRUN go build -o /app .\nFROM alpine\nCOPY --from=b /app /app\nEXPOSE 8080\nCMD ["/app"]\n`;
    case 'static':
      return `FROM nginx:alpine\nCOPY . /usr/share/nginx/html/\nEXPOSE 80\n`;
    default:
      return `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["npm","start"]\n`;
  }
}

export async function enqueueDeployment(payload: DeploymentJobPayload) {
  return deploymentQueue.add('process', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export async function closeRedis() {
  await redisClient.quit();
}
