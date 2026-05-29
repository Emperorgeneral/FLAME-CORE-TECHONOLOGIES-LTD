import { FastifyInstance } from 'fastify';
import { currencyService } from '../services/currencyService.js';
import { regionService } from '../services/regionService.js';
import { query } from '../db/pool.js';

/**
 * Public reference data — currencies, regions, plans. No auth needed.
 * The frontend hits these to render the pricing page, region selector,
 * and currency switcher.
 */
export async function registerCatalogRoutes(fastify: FastifyInstance) {
  fastify.get('/api/currencies', async (_req, reply) => {
    return reply.send(await currencyService.list());
  });

  fastify.get('/api/regions', async (_req, reply) => {
    return reply.send(await regionService.list());
  });

  fastify.get('/api/regions/live', async (_req, reply) => {
    return reply.send(await regionService.listLive());
  });

  fastify.get<{ Querystring: { currency?: string } }>('/api/plans', async (req, reply) => {
    const requested = (req.query.currency ?? 'USD').toUpperCase();
    const currency = await currencyService.get(requested as any) ?? await currencyService.get('USD');

    const plans = await query(
      `SELECT id, slug, name, tagline,
              price_usd_monthly, price_usd_yearly,
              max_projects, max_domains, max_team_members, build_minutes_per_month,
              vcpu, ram_mb, storage_gb, bandwidth_gb,
              custom_domains, multi_region, preview_environments, always_on,
              priority_support, uptime_sla_pct, features
         FROM plans WHERE is_public = true ORDER BY price_usd_monthly`
    );

    // Localize prices server-side so the UI always shows the right currency.
    const rows = await Promise.all(plans.rows.map(async (p) => {
      const m = await currencyService.convertUsdToMinor(Number(p.price_usd_monthly), currency!.code);
      const y = await currencyService.convertUsdToMinor(Number(p.price_usd_yearly),  currency!.code);
      return {
        ...p,
        price: {
          currency: currency!.code,
          symbol: currency!.symbol,
          monthly_minor: m.minor,
          monthly_display: await currencyService.format(m.minor, currency!.code),
          yearly_minor: y.minor,
          yearly_display: await currencyService.format(y.minor, currency!.code),
          fx_rate: m.rate,
        },
      };
    }));

    return reply.send({ currency: currency!.code, plans: rows });
  });

  // Health
  fastify.get('/api/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      version: '2.4.1',
      regions: (await regionService.listLive()).length,
      currencies: (await currencyService.list()).length,
      time: new Date().toISOString(),
    });
  });
}
