/**
 * Admin Email Management Routes
 * 
 * Endpoints:
 * - GET  /api/admin/emails - List all emails sent
 * - GET  /api/admin/emails/:id - View email details
 * - POST /api/admin/emails/send - Send custom email to user
 * - GET  /api/admin/emails/templates - List email templates
 * - POST /api/admin/emails/templates - Create/update template
 * - DELETE /api/admin/emails/:id - Delete email record
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export async function registerAdminEmailRoutes(fastify: FastifyInstance) {
  // Middleware: Admin-only access (already applied globally via admin.ts)

  /**
   * GET /api/admin/emails
   * List all emails with pagination & filtering
   */
  fastify.get<{ Querystring: { page?: string; status?: string; recipient?: string } }>(
    '/api/admin/emails',
    async (request: FastifyRequest<{ Querystring: { page?: string; status?: string; recipient?: string } }>, reply: FastifyReply) => {
      try {
        await request.jwtVerify();

        const page = parseInt(request.query.page ?? '1');
        const status = request.query.status; // 'pending', 'sent', 'failed'
        const recipient = request.query.recipient;

        const limit = 50;
        const offset = (page - 1) * limit;

        let sql = 'SELECT * FROM email_outbox WHERE 1=1';
        const params: any[] = [];

        if (status) {
          sql += ` AND status = $${params.length + 1}`;
          params.push(status);
        }
        if (recipient) {
          sql += ` AND recipient ILIKE $${params.length + 1}`;
          params.push(`%${recipient}%`);
        }

        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await query(sql, params);
        const countResult = await query(
          'SELECT COUNT(*) as total FROM email_outbox WHERE ' +
          (status ? `status = $1 AND` : '') +
          (recipient ? `recipient ILIKE $${status ? 2 : 1}` : '1=1'),
          status && recipient ? [status, `%${recipient}%`] : status ? [status] : recipient ? [`%${recipient}%`] : []
        );

        return reply.send({
          emails: result.rows,
          total: parseInt(countResult.rows[0].total),
          page,
          pages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
        });
      } catch (err) {
        logger.error('Error fetching emails:', err);
        return reply.status(500).send({ error: 'Failed to fetch emails' });
      }
    }
  );

  /**
   * GET /api/admin/emails/:id
   * View single email details & delivery logs
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/admin/emails/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await request.jwtVerify();

        const result = await query(
          'SELECT * FROM email_outbox WHERE id = $1',
          [request.params.id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Email not found' });
        }

        return reply.send(result.rows[0]);
      } catch (err) {
        logger.error('Error fetching email:', err);
        return reply.status(500).send({ error: 'Failed to fetch email' });
      }
    }
  );

  /**
   * POST /api/admin/emails/send
   * Send custom email to user
   */
  fastify.post<{ Body: { recipient: string; template: string; subject: string; body: string } }>(
    '/api/admin/emails/send',
    async (request: FastifyRequest<{ Body: { recipient: string; template: string; subject: string; body: string } }>, reply: FastifyReply) => {
      try {
        await request.jwtVerify();

        const { recipient, template, subject, body } = request.body;

        if (!recipient || !subject || !body) {
          return reply.status(400).send({ error: 'Missing required fields' });
        }

        // Insert into email_outbox queue
        const result = await query(
          `INSERT INTO email_outbox 
           (recipient, template, subject, body_html, status, created_at, scheduled_at)
           VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
           RETURNING id`,
          [recipient, template || 'custom', subject, body]
        );

        logger.info(`Admin queued email to ${recipient}`);

        return reply.status(201).send({
          id: result.rows[0].id,
          message: 'Email queued for sending',
        });
      } catch (err) {
        logger.error('Error sending email:', err);
        return reply.status(500).send({ error: 'Failed to queue email' });
      }
    }
  );

  /**
   * GET /api/admin/emails/templates
   * List all email templates
   */
  fastify.get(
    '/api/admin/emails/templates',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();

        const templates = {
          welcome: {
            name: 'Welcome',
            subject: 'Welcome to Flame Core 🔥',
            description: 'Sent when user creates account',
          },
          verify_email: {
            name: 'Verify Email',
            subject: 'Verify your email address',
            description: 'Sent to verify user email',
          },
          password_reset: {
            name: 'Password Reset',
            subject: 'Reset your password',
            description: 'Sent for password recovery',
          },
          deploy_success: {
            name: 'Deployment Success',
            subject: '✅ Deployment successful',
            description: 'Sent when deployment succeeds',
          },
          deploy_failed: {
            name: 'Deployment Failed',
            subject: '❌ Deployment failed',
            description: 'Sent when deployment fails',
          },
          billing_receipt: {
            name: 'Billing Receipt',
            subject: 'Payment received',
            description: 'Sent when payment is received',
          },
          team_invite: {
            name: 'Team Invite',
            subject: 'You have been invited to a team',
            description: 'Sent when user is invited to team',
          },
          custom: {
            name: 'Custom Email',
            subject: 'Custom',
            description: 'Custom email from admin',
          },
        };

        return reply.send(templates);
      } catch (err) {
        logger.error('Error fetching templates:', err);
        return reply.status(500).send({ error: 'Failed to fetch templates' });
      }
    }
  );

  /**
   * DELETE /api/admin/emails/:id
   * Delete email from outbox (only if pending)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/emails/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await request.jwtVerify();

        // Check if email is pending
        const checkResult = await query(
          'SELECT status FROM email_outbox WHERE id = $1',
          [request.params.id]
        );

        if (checkResult.rows.length === 0) {
          return reply.status(404).send({ error: 'Email not found' });
        }

        if (checkResult.rows[0].status !== 'pending') {
          return reply.status(400).send({ error: 'Can only delete pending emails' });
        }

        // Delete email
        await query('DELETE FROM email_outbox WHERE id = $1', [request.params.id]);

        logger.info(`Admin deleted email ${request.params.id}`);

        return reply.send({ message: 'Email deleted' });
      } catch (err) {
        logger.error('Error deleting email:', err);
        return reply.status(500).send({ error: 'Failed to delete email' });
      }
    }
  );

  /**
   * GET /api/admin/emails/stats
   * Email statistics & delivery rates
   */
  fastify.get(
    '/api/admin/emails/stats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();

        const stats = await query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            ROUND(
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END)::numeric / 
              NULLIF(COUNT(*), 0) * 100, 2
            ) as delivery_rate
          FROM email_outbox
        `);

        return reply.send(stats.rows[0]);
      } catch (err) {
        logger.error('Error fetching email stats:', err);
        return reply.status(500).send({ error: 'Failed to fetch statistics' });
      }
    }
  );
}
