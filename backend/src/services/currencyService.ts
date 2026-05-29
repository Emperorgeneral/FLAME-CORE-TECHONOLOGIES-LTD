import { query } from '../db/pool.js';
import type { CurrencyCode, Currency } from '../types/index.js';

/**
 * Multi-currency service.
 *
 * All prices stored in USD (base). Convert at read/billing time using
 * the latest FX rate. Future: a scheduled job refreshes rates from an
 * FX provider (e.g. Open Exchange Rates, Frankfurter, ECB).
 *
 * No NGN-specific hardcoding anywhere in this codebase.
 */
export const currencyService = {
  async list(): Promise<Currency[]> {
    const res = await query(
      `SELECT code, symbol, name, locale, decimals, fx_rate_to_usd
         FROM currencies WHERE is_active = true ORDER BY code`
    );
    return res.rows.map(this.rowToCurrency);
  },

  async get(code: CurrencyCode): Promise<Currency | null> {
    const res = await query(
      `SELECT code, symbol, name, locale, decimals, fx_rate_to_usd
         FROM currencies WHERE code = $1`,
      [code]
    );
    return res.rows[0] ? this.rowToCurrency(res.rows[0]) : null;
  },

  /**
   * Convert a USD amount (decimal) into the target currency's MINOR units.
   * Always returns an integer count of the smallest currency unit
   * (kobo, cents, pence) to avoid floating-point drift in billing.
   */
  async convertUsdToMinor(usdAmount: number, target: CurrencyCode): Promise<{
    minor: number;
    rate: number;
    decimals: number;
  }> {
    const c = await this.get(target);
    if (!c) throw new Error(`Unknown currency: ${target}`);
    const amount = usdAmount * Number(c.fx_rate_to_usd);
    const minor = Math.round(amount * Math.pow(10, c.decimals));
    return { minor, rate: Number(c.fx_rate_to_usd), decimals: c.decimals };
  },

  /** Format a minor-unit amount back to a localized display string. */
  async format(minor: number, code: CurrencyCode): Promise<string> {
    const c = await this.get(code);
    if (!c) return `${minor}`;
    const value = minor / Math.pow(10, c.decimals);
    return new Intl.NumberFormat(c.locale, {
      style: 'currency',
      currency: c.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: c.decimals,
    }).format(value);
  },

  /**
   * Update FX rates. Called by a scheduled job (e.g. every hour).
   * Pass-in object: { NGN: 1600.0, GBP: 0.79, ... } — values vs 1 USD.
   */
  async updateRates(rates: Partial<Record<CurrencyCode, number>>): Promise<void> {
    for (const [code, rate] of Object.entries(rates)) {
      if (!rate || rate <= 0) continue;
      await query(
        `UPDATE currencies SET fx_rate_to_usd = $2, updated_at = now() WHERE code = $1`,
        [code, rate]
      );
    }
  },

  rowToCurrency(r: any): Currency {
    return {
      code: r.code,
      symbol: r.symbol,
      name: r.name,
      locale: r.locale,
      decimals: Number(r.decimals),
      fx_rate_to_usd: Number(r.fx_rate_to_usd),
    };
  },
};
