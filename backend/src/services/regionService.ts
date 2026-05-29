import { query } from '../db/pool.js';
import type { Region, RegionCode } from '../types/index.js';

/**
 * Multi-region service.
 *
 * Today: one live region (los1). Tomorrow: many. All deployments are
 * region-aware from the start so we never have to retrofit.
 *
 * Each region has a `endpoint` — the internal API for that region node.
 * Single-VPS today => endpoint is null and we run jobs locally.
 * Multi-VPS later => the orchestrator forwards jobs to the region's endpoint.
 */
export const regionService = {
  async list(): Promise<Region[]> {
    const res = await query(
      `SELECT code, city, country, country_code, continent, pop_id,
              status, capacity_pct, endpoint, nodes
         FROM regions ORDER BY status DESC, code`
    );
    return res.rows.map(this.rowToRegion);
  },

  async listLive(): Promise<Region[]> {
    const res = await query(
      `SELECT code, city, country, country_code, continent, pop_id,
              status, capacity_pct, endpoint, nodes
         FROM regions WHERE status IN ('live','beta') ORDER BY code`
    );
    return res.rows.map(this.rowToRegion);
  },

  async get(code: RegionCode): Promise<Region | null> {
    const res = await query(
      `SELECT code, city, country, country_code, continent, pop_id,
              status, capacity_pct, endpoint, nodes
         FROM regions WHERE code = $1`,
      [code]
    );
    return res.rows[0] ? this.rowToRegion(res.rows[0]) : null;
  },

  /**
   * Suggest a region for a user based on country code.
   * Future enhancement: use geo-IP + latency probes.
   */
  async suggestRegion(countryCode?: string | null): Promise<RegionCode> {
    if (!countryCode) return 'los1';

    const live = await this.listLive();
    // Same country
    const sameCountry = live.find((r) => r.country_code === countryCode);
    if (sameCountry) return sameCountry.code;

    // Same continent
    const continentMap: Record<string, Region['continent']> = {
      NG: 'AF', ZA: 'AF', KE: 'AF', GH: 'AF', EG: 'AF',
      GB: 'EU', DE: 'EU', FR: 'EU', NL: 'EU',
      US: 'NA', CA: 'NA',
      SG: 'AS', IN: 'AS', JP: 'AS',
    };
    const wantContinent = continentMap[countryCode];
    if (wantContinent) {
      const sameContinent = live.find((r) => r.continent === wantContinent);
      if (sameContinent) return sameContinent.code;
    }

    return live[0]?.code ?? 'los1';
  },

  /**
   * For a multi-VPS future: return the endpoint to dispatch a job to.
   * Returns null when the region is local (single-VPS MVP).
   */
  async getDispatchEndpoint(code: RegionCode): Promise<string | null> {
    const r = await this.get(code);
    return r?.endpoint ?? null;
  },

  rowToRegion(r: any): Region {
    return {
      code: r.code,
      city: r.city,
      country: r.country,
      country_code: r.country_code,
      continent: r.continent,
      pop_id: r.pop_id,
      status: r.status,
      capacity_pct: Number(r.capacity_pct),
      endpoint: r.endpoint,
      nodes: r.nodes ?? [],
    };
  },
};
