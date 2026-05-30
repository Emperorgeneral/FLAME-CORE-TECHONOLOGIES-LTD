import { FastifyInstance } from 'fastify';
import { query } from '../db/pool.js';
import { deploymentService } from '../services/deploymentService.js';
import { logger } from '../utils/logger.js';
import { deploymentQueue } from '../engine/deploymentQueue.js';
import crypto from 'crypto';

/**
 * GitHub webhooks for auto-deploy.
 *
 * Setup:
 *  1. User connects GitHub repo in dashboard
 *  2. We create a webhook on the repo pointing to /api/v1/webhooks/github
 *  3. On push/PR, GitHub calls us
 *  4. We verify signature, then trigger a deployment
 *
 * Security: HMAC-SHA256 signature verification using the project's webhook_secret.
 */
export async function registerWebhookRoutes(fastify: FastifyInstance) {
  // GitHub webhook endpoint (public, but verified via signature)
  fastify.post('/api/v1/webhooks/github', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string;
    const event = request.headers['x-github-event'] as string;
    const deliveryId = request.headers['x-github-delivery'] as string;

    const rawBody = JSON.stringify(request.body);

    try {
      const payload = request.body as any;

      // Extract repo info
      const repoFullName = payload.repository?.full_name;
      const repoUrl = payload.repository?.clone_url;
      if (!repoFullName) {
        return reply.status(400).send({ error: 'invalid payload' });
      }

      // Find project by repo URL
      const projectRes = await query(
        `SELECT id, team_id, autodeploy_enabled, webhook_secret, default_branch
           FROM projects
          WHERE repo_url = $1 OR repo_url = $2`,
        [repoUrl, `https://github.com/${repoFullName}.git`]
      );

      if (!projectRes.rows[0]) {
        logger.info('webhook: no project found for repo', { repo: repoFullName });
        return reply.status(200).send({ ignored: true });
      }

      const project = projectRes.rows[0];

      // Verify signature
      if (project.webhook_secret) {
        const expectedSig = 'sha256=' + crypto
          .createHmac('sha256', project.webhook_secret)
          .update(rawBody)
          .digest('hex');

        if (signature !== expectedSig) {
          logger.warn('webhook: invalid signature', { repo: repoFullName, deliveryId });
          return reply.status(401).send({ error: 'invalid signature' });
        }
      }

      // Handle push events
      if (event === 'push') {
        if (!project.autodeploy_enabled) {
          return reply.send({ ignored: 'autodeploy disabled' });
        }

        const branch = payload.ref?.replace('refs/heads/', '');
        const commit = payload.after;
        const commitMsg = payload.head_commit?.message ?? '';
        const author = payload.head_commit?.author?.name ?? '';

        // Only deploy default branch (main/master) unless configured otherwise
        if (branch !== project.default_branch) {
          logger.info('webhook: ignoring non-default branch', { branch, default: project.default_branch });
          return reply.send({ ignored: 'not default branch' });
        }

        // Create deployment
        const deployment = await deploymentService.create({
          projectId: project.id,
          teamId: project.team_id,
          triggeredBy: 'system', // GitHub webhook
          trigger: 'git_push',
          commitHash: commit,
          commitMessage: commitMsg,
          commitAuthor: author,
          branch,
          region: 'los1', // TODO: get from project
        });

        logger.info('webhook: deployment queued', {
          project: project.id,
          deployment: deployment.id,
          commit: commit.substring(0, 7),
        });

        // Enqueue to BullMQ: worker runs the deployment pipeline
        await deploymentQueue.add('deploy', {
          deployment_id: deployment.id,
          project_id: project.id,
          team_id: project.team_id,
          source: 'github',
          repo_url: repoUrl ?? `https://github.com/${repoFullName}.git`,
          branch,
          commit_hash: commit,
          region: 'los1',
        });

        return reply.send({ deployed: true, deployment_id: deployment.id });
      }

      // Handle pull_request events (for preview deployments)
      if (event === 'pull_request') {
        const action = payload.action;
        const prNumber = payload.number;
        const prBranch = payload.pull_request?.head?.ref;
        const prBase = payload.pull_request?.base?.ref;
        const prTitle = payload.pull_request?.title;

        if (['opened', 'synchronize', 'reopened'].includes(action)) {
          // Create preview deployment
          const commit = payload.pull_request?.head?.sha;
          
          // Check if preview deployments are enabled for this project
          const planRes = await query(
            `SELECT p.preview_environments FROM plans p
             JOIN teams t ON t.plan_id = p.id
             JOIN projects pr ON pr.team_id = t.id
             WHERE pr.id = $1`,
            [project.id]
          );

          if (!planRes.rows[0]?.preview_environments) {
            return reply.send({ ignored: 'preview deployments not enabled for plan' });
          }

          const deployment = await deploymentService.create({
            projectId: project.id,
            teamId: project.team_id,
            triggeredBy: 'system',
            trigger: 'git_push',
            commitHash: commit,
            commitMessage: `PR #${prNumber}: ${prTitle}`,
            commitAuthor: payload.pull_request?.user?.login ?? '',
            branch: prBranch,
            region: 'los1',
          });

          // Store preview deployment metadata
          await query(
            `INSERT INTO preview_deployments
              (deployment_id, project_id, team_id, pr_number, pr_title, branch, commit_hash, preview_url, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
             ON CONFLICT DO NOTHING`,
            [
              deployment.id,
              project.id,
              project.team_id,
              prNumber,
              prTitle,
              prBranch,
              commit,
              `pr-${prNumber}-${project.id.slice(0, 8)}.flame.app`,
            ]
          );

          logger.info('webhook: preview deployment created', {
            pr: prNumber,
            deployment: deployment.id,
          });

          // Enqueue preview deployment to BullMQ
          await deploymentQueue.add('deploy', {
            deployment_id: deployment.id,
            project_id: project.id,
            team_id: project.team_id,
            source: 'github',
            repo_url: repoUrl ?? `https://github.com/${repoFullName}.git`,
            branch: prBranch,
            commit_hash: commit,
            region: 'los1',
          });

          // TODO: post comment to PR with preview URL once deployment is ready
          // await postGitHubComment(prNumber, `Preview: https://pr-${prNumber}-...`)

          return reply.send({ preview: true, deployment_id: deployment.id });
        }

        if (['closed'].includes(action)) {
          // Mark preview as closed, schedule cleanup
          await query(
            `UPDATE preview_deployments
                SET status = 'closed', closed_at = now()
              WHERE project_id = $1 AND pr_number = $2 AND status = 'active'`,
            [project.id, prNumber]
          );

          logger.info('webhook: preview closed', { pr: prNumber });
          return reply.send({ closed: true });
        }
      }

      return reply.send({ ignored: true, event });
    } catch (err) {
      logger.error('webhook error', err);
      return reply.status(500).send({ error: 'webhook processing failed' });
    }
  });

  // Manual webhook test endpoint (for debugging)
  fastify.post('/api/v1/webhooks/test', async (request, reply) => {
    await request.jwtVerify();
    logger.info('test webhook received', { body: request.body });
    return reply.send({ received: true, body: request.body });
  });
}
