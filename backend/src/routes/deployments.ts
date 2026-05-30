import { FastifyInstance } from 'fastify';
import { deploymentService } from '../services/deploymentService.js';
import { projectService } from '../services/projectService.js';
import { serviceManager } from '../services/serviceManager.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { deploymentQueue } from '../engine/deploymentQueue.js';

export async function registerDeploymentRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    if (request.url.includes('/deployments') || request.url.endsWith('/deploy')) {
      await request.jwtVerify();
    }
  });

  // Trigger a deployment for a project
  fastify.post<{ Params: { teamId: string; projectId: string } }>(
    '/api/teams/:teamId/projects/:projectId/deploy',
    async (request, reply) => {
      const { teamId, projectId } = request.params;
      const userId = (request.user as any).sub;
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

      const project = await projectService.get(projectId);
      if (!project || project.team_id !== teamId) return reply.status(404).send({ error: 'project not found' });

      const body = request.body as any;
      try {
        const deployment = await deploymentService.create({
          projectId,
          teamId,
          triggeredBy: userId,
          trigger: body?.trigger ?? 'manual',
          commitHash: body?.commit_hash ?? 'HEAD',
          commitMessage: body?.commit_message ?? 'Manual deployment',
          commitAuthor: body?.commit_author ?? '',
          branch: body?.branch ?? project.default_branch,
          region: body?.region ?? project.primary_region,
        });

        // Enqueue to BullMQ: worker picks it up and runs the 10-step pipeline
        await deploymentQueue.add('deploy', {
          deployment_id: deployment.id,
          project_id: projectId,
          team_id: teamId,
          source: 'github',
          repo_url: project.repo_url,
          branch: deployment.branch,
          commit_hash: deployment.commit_hash,
          region: deployment.region,
        });

        logger.info('deployment enqueued', { id: deployment.id, project: projectId });

        return reply.status(202).send({
          ...deployment,
          message: 'deployment queued',
        });
      } catch (err) {
        logger.error('deploy', err);
        return reply.status(500).send({ error: 'internal error' });
      }
    }
  );

  // Trigger a deployment for a SERVICE (service-based flow)
  fastify.post<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/deploy',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      const userId = (request.user as any).sub;
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

      const svc = await serviceManager.get(serviceId);
      if (!svc || svc.team_id !== teamId) return reply.status(404).send({ error: 'service not found' });
      if (svc.status === 'deleted') return reply.status(400).send({ error: 'cannot deploy deleted service' });

      const body = request.body as any;
      try {
        const deployment = await deploymentService.create({
          serviceId,
          projectId: svc.project_id,
          teamId,
          triggeredBy: userId,
          trigger: body?.trigger ?? 'manual',
          commitHash: body?.commit_hash ?? 'HEAD',
          commitMessage: body?.commit_message ?? 'Manual deployment',
          commitAuthor: body?.commit_author ?? '',
          branch: body?.branch ?? svc.default_branch ?? 'main',
          region: svc.region ?? 'los1',
        });

        // Log the deployment event
        await serviceManager.appendLog({
          serviceId,
          deploymentId: deployment.id,
          projectId: svc.project_id,
          teamId,
          stream: 'system',
          level: 'info',
          message: `Deployment triggered manually by user`,
          metadata: { trigger: body?.trigger ?? 'manual', branch: body?.branch ?? 'main' },
        });

        // Enqueue to BullMQ: worker processes the deployment pipeline
        await deploymentQueue.add('deploy', {
          deployment_id: deployment.id,
          project_id: svc.project_id,
          team_id: teamId,
          source: 'github',
          repo_url: svc.repo_url ?? '',
          branch: deployment.branch,
          commit_hash: deployment.commit_hash,
          region: svc.region ?? 'los1',
        });

        logger.info('service deployment enqueued', { id: deployment.id, service: serviceId });

        return reply.status(202).send({
          ...deployment,
          message: 'deployment queued',
        });
      } catch (err: any) {
        logger.error('service deploy', err);
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  // List deployments for a service
  fastify.get<{ Params: { teamId: string; serviceId: string } }>(
    '/api/v1/teams/:teamId/services/:serviceId/deployments',
    async (request, reply) => {
      const { teamId, serviceId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      return reply.send(await deploymentService.listForService(serviceId));
    }
  );

  // List deployments for a project
  fastify.get<{ Params: { teamId: string; projectId: string } }>(
    '/api/teams/:teamId/projects/:projectId/deployments',
    async (request, reply) => {
      const { teamId, projectId } = request.params;
      if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
      return reply.send(await deploymentService.listForProject(projectId));
    }
  );

  // Team-wide deployments (dashboard view)
  fastify.get<{ Params: { teamId: string } }>('/api/teams/:teamId/deployments', async (request, reply) => {
    const { teamId } = request.params;
    if (!await isMember(teamId, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
    return reply.send(await deploymentService.listForTeam(teamId));
  });

  // Get a single deployment
  fastify.get<{ Params: { id: string } }>('/api/deployments/:id', async (request, reply) => {
    const dep = await deploymentService.get(request.params.id);
    if (!dep) return reply.status(404).send({ error: 'not found' });
    if (!await isMember(dep.team_id, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
    return reply.send(dep);
  });

  // Logs
  fastify.get<{ Params: { id: string } }>('/api/deployments/:id/logs', async (request, reply) => {
    const dep = await deploymentService.get(request.params.id);
    if (!dep) return reply.status(404).send({ error: 'not found' });
    if (!await isMember(dep.team_id, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
    return reply.send({
      id: dep.id,
      status: dep.status,
      build_logs: dep.build_logs,
      runtime_logs: dep.runtime_logs,
    });
  });

  // Cancel
  fastify.post<{ Params: { id: string } }>('/api/deployments/:id/cancel', async (request, reply) => {
    const dep = await deploymentService.get(request.params.id);
    if (!dep) return reply.status(404).send({ error: 'not found' });
    if (!await isMember(dep.team_id, (request.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
    if (['ready', 'failed', 'cancelled', 'stopped'].includes(dep.status)) {
      return reply.status(400).send({ error: `cannot cancel deployment in state ${dep.status}` });
    }
    const updated = await deploymentService.setStatus(dep.id, 'cancelled');
    return reply.send(updated);
  });

  // Redeploy — clones a previous deployment as a new one
  fastify.post<{ Params: { id: string } }>('/api/deployments/:id/redeploy', async (request, reply) => {
    const source = await deploymentService.get(request.params.id);
    if (!source) return reply.status(404).send({ error: 'not found' });
    const userId = (request.user as any).sub;
    if (!await isMember(source.team_id, userId)) return reply.status(403).send({ error: 'forbidden' });

    const fresh = await deploymentService.create({
      projectId: source.project_id,
      teamId: source.team_id,
      triggeredBy: userId,
      trigger: 'redeploy',
      commitHash: source.commit_hash,
      commitMessage: source.commit_message,
      commitAuthor: source.commit_author,
      branch: source.branch,
      region: source.region,
    });
    return reply.status(202).send(fresh);
  });
}

async function isMember(teamId: string, userId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
  return r.rowCount! > 0;
}
