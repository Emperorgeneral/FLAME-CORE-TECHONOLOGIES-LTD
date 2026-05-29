import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool.js';
import { currencyService } from './currencyService.js';
import { paymentRegistry } from '../payments/registry.js';
import { logger } from '../utils/logger.js';
import type { CurrencyCode, Invoice } from '../types/index.js';

/**
 * Billing service — creates invoices and dispatches charges through the
 * modular payment provider registry.
 *
 * - Prices live in USD on the Plans table.
 * - At invoice time we convert to the team's billing currency,
 *   storing BOTH the displayed minor-unit amount and the USD equivalent
 *   (plus the FX rate that was used) for accounting.
 */
export const billingService = {
  /** Generate the next invoice number (FC-YYYY-NNNNNN). */
  async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const res = await query(
      `SELECT COUNT(*)::int AS n FROM invoices WHERE number LIKE $1`,
      [`FC-${year}-%`]
    );
    const next = (res.rows[0].n + 1).toString().padStart(6, '0');
    return `FC-${year}-${next}`;
  },

  /** Issue a new invoice for a team's plan at the current period. */
  async issuePlanInvoice(args: {
    teamId: string;
    planId: string;
    cycle: 'monthly' | 'yearly';
  }): Promise<Invoice> {
    const planRes = await query(
      `SELECT id, price_usd_monthly, price_usd_yearly FROM plans WHERE id = $1`,
      [args.planId]
    );
    if (!planRes.rows[0]) throw new Error('plan not found');

    const teamRes = await query(
      `SELECT billing_currency FROM teams WHERE id = $1`,
      [args.teamId]
    );
    if (!teamRes.rows[0]) throw new Error('team not found');

    const billingCurrency: CurrencyCode = teamRes.rows[0].billing_currency;
    const priceUsd: number = args.cycle === 'yearly'
      ? Number(planRes.rows[0].price_usd_yearly)
      : Number(planRes.rows[0].price_usd_monthly);

    const localised = await currencyService.convertUsdToMinor(priceUsd, billingCurrency);
    const usdMinor   = Math.round(priceUsd * 100);

    const now = new Date();
    const periodEnd = new Date(now);
    if (args.cycle === 'yearly') periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    const number = await this.nextInvoiceNumber();
    const id = uuidv4();

    const inv = await query(
      `INSERT INTO invoices
        (id, team_id, plan_id,
         amount_minor, currency, amount_usd_minor, fx_rate_at_issue,
         status, period_start, period_end, due_at, number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$9,$10)
       RETURNING *`,
      [
        id, args.teamId, args.planId,
        localised.minor, billingCurrency, usdMinor, localised.rate,
        now, periodEnd, number,
      ]
    );

    logger.info('invoice issued', {
      invoice: number, team: args.teamId,
      amount: localised.minor, currency: billingCurrency, usd: usdMinor,
    });
    return inv.rows[0];
  },

  /**
   * Charge an existing invoice. The provider is chosen by the registry
   * based on the invoice currency + optional country hint, OR you can
   * override it (e.g. user picked a saved method).
   */
  async chargeInvoice(args: {
    invoiceId: string;
    countryCode?: string | null;
    forceProvider?: string;
    sourceToken?: string;
    returnUrl?: string;
    customerEmail: string;
    customerName?: string;
  }) {
    const invRes = await query(`SELECT * FROM invoices WHERE id = $1`, [args.invoiceId]);
    const inv = invRes.rows[0];
    if (!inv) throw new Error('invoice not found');

    const provider = args.forceProvider
      ? paymentRegistry.get(args.forceProvider as any)
      : paymentRegistry.pickFor(inv.currency, args.countryCode);

    if (!provider) {
      throw new Error(`no payment provider available for ${inv.currency}`);
    }

    const result = await provider.charge({
      team_id: inv.team_id,
      invoice_id: inv.id,
      amount_minor: Number(inv.amount_minor),
      currency: inv.currency,
      customer_email: args.customerEmail,
      customer_name: args.customerName,
      source_token: args.sourceToken,
      return_url: args.returnUrl,
      description: `Flame Core ${inv.number}`,
    });

    await query(
      `UPDATE invoices
          SET status = $2, payment_provider = $3, provider_ref = $4, provider_fee_minor = $5
        WHERE id = $1`,
      [
        inv.id, result.status, provider.name,
        result.provider_ref, result.fee_minor ?? null,
      ]
    );

    return { invoice: inv, provider: provider.name, result };
  },

  /** List supported providers for a given currency — for the checkout UI. */
  optionsFor(currency: CurrencyCode, countryCode?: string | null) {
    const list = paymentRegistry.availableForCurrency(currency);
    const preferred = paymentRegistry.pickFor(currency, countryCode);
    return { preferred: preferred?.name ?? null, providers: list };
  },
};
