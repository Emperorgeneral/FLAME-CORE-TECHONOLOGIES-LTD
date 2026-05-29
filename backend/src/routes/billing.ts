import { FastifyInstance } from 'fastify';
import { billingService } from '../services/billingService.js';
import { paymentRegistry } from '../payments/registry.js';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import type { CurrencyCode } from '../types/index.js';

export async function registerBillingRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/teams/') && request.url.includes('/billing')) {
      await request.jwtVerify();
    }
  });

  // Available payment options for a given currency / country.
  fastify.get<{ Querystring: { currency?: string; country?: string } }>(
    '/api/billing/options',
    async (req, reply) => {
      const currency = ((req.query.currency ?? 'USD').toUpperCase()) as CurrencyCode;
      const opts = billingService.optionsFor(currency, req.query.country);
      return reply.send(opts);
    }
  );

  // Issue a new invoice for a team.
  fastify.post<{ Params: { teamId: string } }>('/api/teams/:teamId/billing/invoices', async (req, reply) => {
    const { teamId } = req.params;
    const userId = (req.user as any).sub;
    if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

    const { plan_id, cycle } = req.body as any;
    if (!plan_id || !cycle) return reply.status(400).send({ error: 'plan_id and cycle required' });

    try {
      const invoice = await billingService.issuePlanInvoice({ teamId, planId: plan_id, cycle });
      return reply.status(201).send(invoice);
    } catch (err: any) {
      logger.error('issue invoice', err);
      return reply.status(400).send({ error: err.message });
    }
  });

  // Charge an invoice (server picks the right provider).
  fastify.post<{ Params: { teamId: string; invoiceId: string } }>(
    '/api/teams/:teamId/billing/invoices/:invoiceId/charge',
    async (req, reply) => {
      const { teamId, invoiceId } = req.params;
      const userId = (req.user as any).sub;
      if (!await isMember(teamId, userId)) return reply.status(403).send({ error: 'forbidden' });

      const body = req.body as any;
      try {
        const out = await billingService.chargeInvoice({
          invoiceId,
          countryCode: body?.country_code,
          forceProvider: body?.provider,
          sourceToken: body?.source_token,
          returnUrl: body?.return_url,
          customerEmail: body?.email,
          customerName: body?.name,
        });
        return reply.send(out);
      } catch (err: any) {
        logger.error('charge', err);
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // List invoices for a team
  fastify.get<{ Params: { teamId: string } }>('/api/teams/:teamId/billing/invoices', async (req, reply) => {
    const { teamId } = req.params;
    if (!await isMember(teamId, (req.user as any).sub)) return reply.status(403).send({ error: 'forbidden' });
    const r = await query(
      `SELECT * FROM invoices WHERE team_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [teamId]
    );
    return reply.send(r.rows);
  });

  // ─── Webhooks from payment providers (NO auth — verified by signature) ─
  fastify.post<{ Params: { provider: string } }>('/api/billing/webhooks/:provider', async (req, reply) => {
    const provider = paymentRegistry.get(req.params.provider as any);
    if (!provider) return reply.status(404).send({ error: 'unknown provider' });

    const signature = (req.headers['x-paystack-signature']
      || req.headers['verif-hash']
      || req.headers['stripe-signature']
      || req.headers['paypal-transmission-sig']
      || '') as string;

    const rawBody = JSON.stringify(req.body ?? {});
    const verification = await provider.verifyWebhook(rawBody, signature);
    if (!verification.valid) return reply.status(400).send({ error: 'invalid signature' });

    logger.info('webhook received', {
      provider: req.params.provider,
      event: verification.event_type,
      status: verification.status,
      ref: verification.provider_ref,
    });

    // Mark matching invoice paid/failed.
    if (verification.provider_ref && (verification.status === 'paid' || verification.status === 'failed')) {
      await query(
        `UPDATE invoices
            SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END
          WHERE provider_ref = $1`,
        [verification.provider_ref, verification.status]
      );
    }

    return reply.send({ received: true });
  });
}

async function isMember(teamId: string, userId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
  return r.rowCount! > 0;
}
