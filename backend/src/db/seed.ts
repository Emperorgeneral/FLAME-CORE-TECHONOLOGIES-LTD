import { query } from './pool.js';
import bcrypt from 'bcrypt';

/**
 * Seeds reference data (currencies, regions, plans) + admin user.
 * Idempotent — safe to re-run. No demo/test users in production.
 */
export async function seedDatabase() {
  console.log('🌱 Seeding reference data…');

  // ─── Currencies (USD as base) ──────────────────────────────────────────
  await query(`
    INSERT INTO currencies (code, symbol, name, locale, decimals, fx_rate_to_usd) VALUES
      ('USD', '$',  'US Dollar',          'en-US', 2, 1.00000000),
      ('NGN', '₦',  'Nigerian Naira',     'en-NG', 2, 1600.00000000),
      ('GBP', '£',  'British Pound',      'en-GB', 2, 0.79000000),
      ('EUR', '€',  'Euro',               'de-DE', 2, 0.92000000),
      ('ZAR', 'R',  'South African Rand', 'en-ZA', 2, 18.50000000),
      ('KES', 'KSh','Kenyan Shilling',    'en-KE', 2, 129.00000000),
      ('GHS', '₵',  'Ghanaian Cedi',      'en-GH', 2, 15.20000000)
    ON CONFLICT (code) DO NOTHING
  `);
  console.log('✅ Currencies (7) seeded');

  // ─── Regions ───────────────────────────────────────────────────────────
  await query(`
    INSERT INTO regions (code, city, country, country_code, continent, pop_id, status, capacity_pct, endpoint) VALUES
      ('los1', 'Lagos',        'Nigeria',        'NG', 'AF', 'AFR-W-01',  'live',    41, 'https://los1.internal.flame.app'),
      ('lhr1', 'London',        'United Kingdom', 'GB', 'EU', 'EUR-W-01',  'soon',     0, NULL),
      ('fra1', 'Frankfurt',     'Germany',        'DE', 'EU', 'EUR-C-01',  'soon',     0, NULL),
      ('nyc1', 'New York',      'United States',  'US', 'NA', 'AMER-E-01', 'planned',  0, NULL),
      ('sin1', 'Singapore',     'Singapore',      'SG', 'AS', 'APAC-S-01', 'planned',  0, NULL),
      ('jnb1', 'Johannesburg',  'South Africa',   'ZA', 'AF', 'AFR-S-01',  'planned',  0, NULL),
      ('nbo1', 'Nairobi',       'Kenya',          'KE', 'AF', 'AFR-E-01',  'planned',  0, NULL)
    ON CONFLICT (code) DO NOTHING
  `);
  console.log('✅ Regions (7) seeded');

  // ─── Plans (USD base prices) ───────────────────────────────────────────
  await query(`
    INSERT INTO plans (
      slug, name, tagline,
      price_usd_monthly, price_usd_yearly,
      max_projects, max_domains, max_team_members, build_minutes_per_month,
      max_upload_mb, max_object_count,
      vcpu, ram_mb, storage_gb, bandwidth_gb,
      custom_domains, multi_region, preview_environments, always_on, priority_support,
      uptime_sla_pct, features
    ) VALUES
      ('hobby',   'Hobby',    'For side projects and learning',
        0, 0,
        3, 1, 1, 100,
        10, 500,
        '0.5 shared', 512, 1, 100,
        false, false, false, false, false,
        NULL,
        ARRAY['Deploy from GitHub','Auto-SSL on *.flame.app','Community support','Sleeps after 30min idle','1 region (Lagos)']
      ),
      ('starter', 'Starter',  'Indie devs & MVPs',
        8, 80,
        10, 5, 3, 500,
        50, 5000,
        '1', 1024, 10, 500,
        true, false, false, true, false,
        99.50,
        ARRAY['Custom domains + SSL','Always on (no sleep)','Environment secrets','Build cache','Email support']
      ),
      ('pro',     'Pro',      'Production-grade apps',
        25, 250,
        50, 25, 10, 99999,
        250, 50000,
        '2 dedicated', 4096, 50, 2048,
        true, true, true, true, true,
        99.90,
        ARRAY['Multi-region deploy','Zero-downtime deploys','Preview environments','Webhook autodeploy','Priority support','Usage analytics']
      ),
      ('scale',   'Scale',    'Teams & high-traffic',
        89, 890,
        999, 999, 50, 99999,
        1024, 500000,
        '4 dedicated', 16384, 200, 10240,
        true, true, true, true, true,
        99.95,
        ARRAY['Horizontal autoscaling','Private networking','Team RBAC','Audit logs','99.95% uptime SLA','Dedicated engineer','DDoS protection']
      )
    ON CONFLICT (slug) DO NOTHING
  `);
  console.log('✅ Plans (4) seeded');

  // ─── Admin user (production only) ────────────────────────────────────────
  // Admin credentials MUST be set via environment variables for production
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('⚠️  ADMIN_EMAIL and ADMIN_PASSWORD env vars not set. Skipping admin user creation.');
    console.warn('    Set these in production to access the admin panel.');
  } else {
    const hashedAdmin = await bcrypt.hash(adminPassword, 10);
    await query(
      `INSERT INTO users (email, username, password_hash, full_name, role, status,
                          email_verified, preferred_currency, preferred_region, locale, timezone)
       VALUES ($1, 'admin', $2, 'Flame Core Administrator', 'admin', 'active', true, 'USD', 'los1', 'en-US', 'Africa/Lagos')
       ON CONFLICT (email) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [adminEmail, hashedAdmin]
    );
    console.log(`✅ Admin user provisioned → ${adminEmail}`);
  }

  console.log('🎉 Seed complete - Ready for production use');
}
