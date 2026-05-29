import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../db/pool.js';
import { hashPassword, comparePassword } from '../utils/auth.js';
import { regionService } from './regionService.js';
import { logger } from '../utils/logger.js';
import type { User, CurrencyCode, RegionCode } from '../types/index.js';

/**
 * User service. On registration we ALWAYS auto-create a personal team
 * so the rest of the platform can assume "everything belongs to a team".
 *
 * Currency + region defaults are inferred from country_code when provided —
 * keeping the architecture global-first without forcing the user to pick.
 */
export const userService = {
  async register(args: {
    email: string;
    username: string;
    password: string;
    fullName?: string;
    countryCode?: string;
    locale?: string;
    timezone?: string;
  }): Promise<{ user: User; teamId: string }> {
    const id = uuidv4();
    const hashed = await hashPassword(args.password);

    // Smart defaults based on country
    const currency = inferCurrency(args.countryCode);
    const region: RegionCode = await regionService.suggestRegion(args.countryCode);
    const locale = args.locale ?? inferLocale(args.countryCode);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `INSERT INTO users (
          id, email, username, password_hash, full_name,
          country_code, preferred_currency, preferred_region, locale, timezone,
          role, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'member','active')
         RETURNING *`,
        [
          id, args.email, args.username, hashed, args.fullName ?? '',
          args.countryCode ?? null, currency, region, locale, args.timezone ?? 'UTC',
        ]
      );
      const user: User = userRes.rows[0];

      // Personal team — slug derived from username, deduped if needed.
      let teamSlug = args.username.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const exists = await client.query(`SELECT 1 FROM teams WHERE slug = $1`, [teamSlug]);
      if (exists.rowCount) teamSlug = `${teamSlug}-${id.slice(0, 6)}`;

      const teamRes = await client.query(
        `INSERT INTO teams (slug, name, owner_id, billing_email, billing_currency)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [teamSlug, `${args.fullName || args.username}'s team`, id, args.email, currency]
      );
      const teamId = teamRes.rows[0].id;

      await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [teamId, id]
      );

      await client.query('COMMIT');
      logger.info('user + personal team created', { user: id, team: teamId, region, currency });
      return { user, teamId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getByEmail(email: string): Promise<User | null> {
    const r = await query(`SELECT * FROM users WHERE email = $1`, [email]);
    return r.rows[0] ?? null;
  },

  async getById(id: string): Promise<User | null> {
    const r = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  },

  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.getByEmail(email);
    if (!user || !user.password_hash) return null;
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return null;
    return user;
  },

  async teamsForUser(userId: string) {
    const r = await query(
      `SELECT t.*, tm.role AS member_role
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = $1
        ORDER BY t.created_at ASC`,
      [userId]
    );
    return r.rows;
  },

  async updatePreferences(id: string, prefs: {
    preferred_currency?: CurrencyCode;
    preferred_region?: RegionCode;
    locale?: string;
    timezone?: string;
  }) {
    const fields = Object.keys(prefs).filter((k) => (prefs as any)[k] !== undefined);
    if (!fields.length) return null;
    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const vals = fields.map((f) => (prefs as any)[f]);
    const r = await query(
      `UPDATE users SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...vals]
    );
    return r.rows[0] ?? null;
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────
function inferCurrency(countryCode?: string): CurrencyCode {
  if (!countryCode) return 'USD';
  const map: Record<string, CurrencyCode> = {
    NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR',
    GB: 'GBP', US: 'USD',
    DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR',
  };
  return map[countryCode.toUpperCase()] ?? 'USD';
}

function inferLocale(countryCode?: string): string {
  if (!countryCode) return 'en-US';
  const map: Record<string, string> = {
    NG: 'en-NG', GH: 'en-GH', KE: 'en-KE', ZA: 'en-ZA',
    GB: 'en-GB', US: 'en-US',
    DE: 'de-DE', FR: 'fr-FR', ES: 'es-ES',
  };
  return map[countryCode.toUpperCase()] ?? 'en-US';
}
