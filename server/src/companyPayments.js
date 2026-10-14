import crypto from 'crypto';

const {
  COMPANY_PAYMENT_INTERNAL_API_KEY = '',
  COMPANY_PAYMENT_PUBLIC_BASE_URL = 'https://flamecoretechltd.com',
  COMPANY_PAYMENT_FLUTTERWAVE_SECRET_KEY = '',
  COMPANY_PAYMENT_FLUTTERWAVE_WEBHOOK_SECRET = '',
  COMPANY_PAYMENT_NOWPAYMENTS_API_KEY = '',
  COMPANY_PAYMENT_NOWPAYMENTS_IPN_SECRET = '',
  COMPANY_PAYMENT_NOWPAYMENTS_PAY_CURRENCY = '',
  FLAMEBOT_CLOUD_TERMINAL_MONTHLY_USD_CENTS = '500',
  FLAMEBOT_CLOUD_TERMINAL_YEARLY_USD_CENTS = '5000',
  FLAMEBOT_CLOUD_TERMINAL_MAX_SLOTS = '4',
  ADMIN_EMAIL = '',
} = process.env;

const FLAMEBOT_CLOUD_MONTHLY_CENTS = Number(FLAMEBOT_CLOUD_TERMINAL_MONTHLY_USD_CENTS) || 500;
const FLAMEBOT_CLOUD_YEARLY_CENTS = Number(FLAMEBOT_CLOUD_TERMINAL_YEARLY_USD_CENTS) || 5000;
const FLAMEBOT_CLOUD_MAX_SLOTS = Math.max(1, Math.min(4, Number(FLAMEBOT_CLOUD_TERMINAL_MAX_SLOTS) || 4));

const FLUTTERWAVE_SUPPORTED_LOCAL_CURRENCIES = new Set([
  'NGN', 'GHS', 'KES', 'UGX', 'TZS', 'RWF', 'ZAR', 'EUR', 'GBP', 'USD',
]);

const FALLBACK_CURRENCY_BY_COUNTRY = {
  DZ: 'DZD', AO: 'AOA', BJ: 'XOF', BW: 'BWP', BF: 'XOF', BI: 'BIF', CV: 'CVE', CM: 'XAF', CF: 'XAF', TD: 'XAF',
  KM: 'KMF', CD: 'CDF', CG: 'XAF', CI: 'XOF', DJ: 'DJF', EG: 'EGP', GQ: 'XAF', ER: 'ERN', SZ: 'SZL', ET: 'ETB',
  GA: 'XAF', GM: 'GMD', GH: 'GHS', GN: 'GNF', GW: 'XOF', KE: 'KES', LS: 'LSL', LR: 'LRD', LY: 'LYD', MG: 'MGA',
  MW: 'MWK', ML: 'XOF', MR: 'MRU', MU: 'MUR', MA: 'MAD', MZ: 'MZN', NA: 'NAD', NE: 'XOF', NG: 'NGN', RW: 'RWF',
  ST: 'STN', SN: 'XOF', SC: 'SCR', SL: 'SLE', SO: 'SOS', ZA: 'ZAR', SS: 'SSP', SD: 'SDG', TZ: 'TZS', TG: 'XOF',
  TN: 'TND', UG: 'UGX', ZM: 'ZMW', ZW: 'USD',
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', PK: 'PKR', AE: 'AED', SA: 'SAR',
};

const geoLookupCache = new Map();
const fxRateCache = new Map();
const regionDisplayNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const DEFAULT_PROJECT_SETTINGS = {
  enforcement_enabled: false,
  min_supported_app_version: '',
  provider: 'flutterwave',
  currency: 'USD',
};

const DEFAULT_PROJECT_PLANS = {
  flamebot: [
    { plan_code: 'monthly', display_name: 'FlameBot Monthly', billing_period: 'month', duration_days: 30, price_usd_cents: 1000, sort_order: 10 },
    { plan_code: 'yearly', display_name: 'FlameBot Yearly', billing_period: 'year', duration_days: 365, price_usd_cents: 10000, sort_order: 20 },
  ],
  corepirate: [
    { plan_code: 'monthly', display_name: 'Monthly Plan', billing_period: 'month', duration_days: 30, price_usd_cents: 1000, sort_order: 10 },
    { plan_code: 'yearly', display_name: 'Yearly Plan', billing_period: 'year', duration_days: 365, price_usd_cents: 10000, sort_order: 20 },
  ],
};

function normalizeProjectKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeCloudTerminalSlots(value, maxSlots = FLAMEBOT_CLOUD_MAX_SLOTS) {
  const slots = Number(value);
  if (!Number.isInteger(slots) || slots < 0 || slots > maxSlots) return null;
  return slots;
}

export function calculateFlameBotCheckoutAmount(plan, cloudTerminalSlots = 0) {
  const slots = normalizeCloudTerminalSlots(cloudTerminalSlots);
  if (slots == null) throw new Error(`Cloud Terminal quantity must be between 0 and ${FLAMEBOT_CLOUD_MAX_SLOTS}.`);
  const billingPeriod = String(plan?.billing_period || plan?.plan_code || '').trim().toLowerCase();
  if (!['month', 'monthly', 'year', 'yearly', 'annual'].includes(billingPeriod)) {
    throw new Error('FlameBot supports monthly and yearly subscriptions only.');
  }
  const addOnCents = ['year', 'yearly', 'annual'].includes(billingPeriod)
    ? FLAMEBOT_CLOUD_YEARLY_CENTS
    : FLAMEBOT_CLOUD_MONTHLY_CENTS;
  return Number(plan?.price_usd_cents || 0) + slots * addOnCents;
}

function cloudTerminalPricingConfig() {
  return {
    label: 'Cloud Terminal',
    max_slots: FLAMEBOT_CLOUD_MAX_SLOTS,
    monthly_per_slot_usd_cents: FLAMEBOT_CLOUD_MONTHLY_CENTS,
    yearly_per_slot_usd_cents: FLAMEBOT_CLOUD_YEARLY_CENTS,
    free_trial_available: false,
  };
}

function buildCustomerKey(projectKey, externalUserId, email) {
  const external = String(externalUserId || '').trim();
  const normalizedEmail = normalizeEmail(email);
  if (external) return `${projectKey}:user:${external}`;
  if (normalizedEmail) return `${projectKey}:email:${normalizedEmail}`;
  return `${projectKey}:anonymous`;
}

function requireCompanyInternalApi(request, response, next) {
  if (!COMPANY_PAYMENT_INTERNAL_API_KEY) {
    return response.status(503).json({ message: 'Company payment service internal key is not configured.' });
  }

  const provided = String(request.header('x-company-payment-key') || '').trim();
  if (!provided || provided !== COMPANY_PAYMENT_INTERNAL_API_KEY) {
    return response.status(401).json({ message: 'Invalid company payment service key.' });
  }
  next();
}

function verifyFlutterwaveWebhook(request) {
  const expected = String(COMPANY_PAYMENT_FLUTTERWAVE_WEBHOOK_SECRET || '').trim();
  if (!expected) return false;
  const received = String(request.header('verif-hash') || '').trim();
  if (!received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function verifyNowPaymentsWebhook(request) {
  const expected = String(COMPANY_PAYMENT_NOWPAYMENTS_IPN_SECRET || '').trim();
  if (!expected) return true;
  const received = String(request.header('x-nowpayments-sig') || '').trim().toLowerCase();
  const rawBody = Buffer.isBuffer(request.rawBody) ? request.rawBody : Buffer.from(JSON.stringify(request.body || {}));
  const computed = crypto.createHmac('sha512', expected).update(rawBody).digest('hex').toLowerCase();
  return !!received && received === computed;
}

function normalizeProvider(value, fallback = 'flutterwave') {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'nowpayments') return 'nowpayments';
  if (provider === 'flutterwave') return 'flutterwave';
  return fallback;
}

function formatMoney(amount, currency = 'USD') {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

function roundLocalCurrencyAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric >= 1000000) return Math.round(numeric / 10000) * 10000;
  if (numeric >= 100000) return Math.round(numeric / 10000) * 10000;
  if (numeric >= 10000) return Math.round(numeric / 1000) * 1000;
  if (numeric >= 1000) return Math.round(numeric / 100) * 100;
  if (numeric >= 100) return Math.round(numeric / 10) * 10;
  return Math.round(numeric * 100) / 100;
}

function getClientIp(request, explicitClientContext = null) {
  const explicitIp = String(explicitClientContext?.client_ip || explicitClientContext?.ip || '').trim();
  if (explicitIp) return explicitIp.replace(/^::ffff:/, '');
  const forwardedFor = String(request.headers['x-forwarded-for'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const rawIp = forwardedFor[0] || request.socket?.remoteAddress || request.ip || '';
  return String(rawIp).replace(/^::ffff:/, '').trim();
}

function getHeaderGeoContext(request, explicitClientContext = null) {
  const rawCountry = explicitClientContext?.cf_ipcountry
    || explicitClientContext?.country_code
    || request.headers['cf-ipcountry'];
  const countryCode = String(rawCountry || '').trim().toUpperCase();
  if (!countryCode || countryCode === 'XX' || countryCode === 'T1') return null;
  return {
    country: regionDisplayNames?.of(countryCode) || countryCode,
    countryCode,
    currencyCode: String(FALLBACK_CURRENCY_BY_COUNTRY[countryCode] || 'USD').trim().toUpperCase(),
    isVpnLike: false,
  };
}

async function lookupGeoContext(ip) {
  const normalizedIp = String(ip || '').trim();
  if (!normalizedIp || normalizedIp === '127.0.0.1' || normalizedIp === '::1') return null;

  const cached = geoLookupCache.get(normalizedIp);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const response = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(normalizedIp)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('ipapi failed');
    const payload = await response.json();
    if (payload?.error) throw new Error('ipapi error');

    const value = {
      country: String(payload?.location?.country || '').trim() || null,
      countryCode: String(payload?.location?.country_code || '').trim().toUpperCase() || null,
      currencyCode: String(
        payload?.location?.currency_code
        || FALLBACK_CURRENCY_BY_COUNTRY[String(payload?.location?.country_code || '').trim().toUpperCase()]
        || 'USD'
      ).trim().toUpperCase(),
      isVpnLike: Boolean(payload?.is_vpn || payload?.is_proxy || payload?.is_tor || payload?.is_datacenter),
    };
    geoLookupCache.set(normalizedIp, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return value;
  } catch {
    try {
      const fallbackResponse = await fetch(`https://ipwho.is/${encodeURIComponent(normalizedIp)}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!fallbackResponse.ok) return null;
      const payload = await fallbackResponse.json();
      if (payload?.success === false) return null;

      const countryCode = String(payload?.country_code || '').trim().toUpperCase() || null;
      const value = {
        country: String(payload?.country || '').trim() || null,
        countryCode,
        currencyCode: String(FALLBACK_CURRENCY_BY_COUNTRY[countryCode] || 'USD').trim().toUpperCase(),
        isVpnLike: Boolean(payload?.security?.vpn || payload?.security?.proxy || payload?.security?.tor || payload?.security?.hosting),
      };
      geoLookupCache.set(normalizedIp, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
      return value;
    } catch {
      return null;
    }
  }
}

async function getUsdQuote(currencyCode) {
  const normalized = String(currencyCode || '').trim().toUpperCase();
  if (!normalized || normalized === 'USD') return { currency: 'USD', rate: 1 };

  const cached = fxRateCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/USD/${encodeURIComponent(normalized)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const rate = Number(payload?.rate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const value = { currency: normalized, rate };
    fxRateCache.set(normalized, { value, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
    return value;
  } catch {
    return null;
  }
}

async function resolveBillingGeoContext(request, explicitClientContext = null) {
  return getHeaderGeoContext(request, explicitClientContext) || await lookupGeoContext(getClientIp(request, explicitClientContext));
}

async function buildLocalizedBillingContext(amountUsdCents, request, explicitClientContext = null) {
  const usdAmountMajor = Number(amountUsdCents || 0) / 100;
  const baseContext = {
    usd_amount: formatMoney(usdAmountMajor, 'USD'),
    checkout_currency: 'USD',
    checkout_amount_major: Number(usdAmountMajor.toFixed(2)),
    display_amount: formatMoney(usdAmountMajor, 'USD'),
    local_supported: false,
    detected_currency: 'USD',
    country: null,
    country_code: null,
    payment_method_label: 'Card payment in USD',
    note: null,
  };

  const geoContext = await resolveBillingGeoContext(request, explicitClientContext);
  if (!geoContext?.currencyCode || geoContext.currencyCode === 'USD') {
    return {
      ...baseContext,
      detected_currency: geoContext?.currencyCode || 'USD',
      country: geoContext?.country || null,
      country_code: geoContext?.countryCode || null,
      note: geoContext?.isVpnLike ? 'Location detection looks approximate, so checkout may stay in USD.' : null,
    };
  }

  const detectedCurrency = String(geoContext.currencyCode || 'USD').trim().toUpperCase();
  if (!FLUTTERWAVE_SUPPORTED_LOCAL_CURRENCIES.has(detectedCurrency)) {
    return {
      ...baseContext,
      detected_currency: detectedCurrency,
      country: geoContext?.country || null,
      country_code: geoContext?.countryCode || null,
      payment_method_label: 'Card payment in USD',
      note: `Local bank checkout is not enabled for ${geoContext?.country || detectedCurrency} yet, so checkout will stay in USD.`,
    };
  }

  const quote = await getUsdQuote(detectedCurrency);
  if (!quote?.rate) {
    return {
      ...baseContext,
      detected_currency: detectedCurrency,
      country: geoContext?.country || null,
      country_code: geoContext?.countryCode || null,
      note: 'Local exchange rate could not be loaded right now, so checkout will stay in USD.',
    };
  }

  const localAmountMajor = roundLocalCurrencyAmount(usdAmountMajor * quote.rate);
  if (!Number.isFinite(localAmountMajor) || localAmountMajor <= 0) {
    return {
      ...baseContext,
      detected_currency: detectedCurrency,
      country: geoContext?.country || null,
      country_code: geoContext?.countryCode || null,
    };
  }

  return {
    usd_amount: formatMoney(usdAmountMajor, 'USD'),
    checkout_currency: quote.currency,
    checkout_amount_major: Number(localAmountMajor),
    display_amount: formatMoney(localAmountMajor, quote.currency),
    local_supported: true,
    detected_currency: quote.currency,
    country: geoContext?.country || null,
    country_code: geoContext?.countryCode || null,
    payment_method_label: 'Bank transfer, card, and other Flutterwave local options',
    note: geoContext?.isVpnLike ? 'Location detection looks approximate, but local checkout has still been prepared.' : null,
  };
}

async function localizePlanForDisplay(plan, billingContext) {
  const usdAmountMajor = Number(plan?.price_usd_cents || 0) / 100;
  if (!billingContext?.local_supported || !billingContext?.checkout_currency || billingContext.checkout_currency === 'USD') {
    return {
      ...plan,
      display_currency: 'USD',
      display_price: formatMoney(usdAmountMajor, 'USD'),
      display_amount_major: Number(usdAmountMajor.toFixed(2)),
    };
  }

  const quote = await getUsdQuote(billingContext.checkout_currency);
  if (!quote?.rate) {
    return {
      ...plan,
      display_currency: 'USD',
      display_price: formatMoney(usdAmountMajor, 'USD'),
      display_amount_major: Number(usdAmountMajor.toFixed(2)),
    };
  }

  const localAmountMajor = roundLocalCurrencyAmount(usdAmountMajor * quote.rate);
  return {
    ...plan,
    display_currency: quote.currency,
    display_price: formatMoney(localAmountMajor, quote.currency),
    display_amount_major: Number(localAmountMajor),
  };
}

function providerReadiness() {
  return {
    flutterwave: {
      configured: Boolean(String(COMPANY_PAYMENT_FLUTTERWAVE_SECRET_KEY || '').trim()),
      webhook_secret_configured: Boolean(String(COMPANY_PAYMENT_FLUTTERWAVE_WEBHOOK_SECRET || '').trim()),
    },
    nowpayments: {
      configured: Boolean(String(COMPANY_PAYMENT_NOWPAYMENTS_API_KEY || '').trim()),
      webhook_secret_configured: Boolean(String(COMPANY_PAYMENT_NOWPAYMENTS_IPN_SECRET || '').trim()),
      pay_currency: String(COMPANY_PAYMENT_NOWPAYMENTS_PAY_CURRENCY || '').trim().toLowerCase() || 'auto',
    },
  };
}

function serializePlan(row) {
  return {
    id: row.id,
    project_key: row.project_key,
    plan_code: row.plan_code,
    display_name: row.display_name,
    billing_period: row.billing_period,
    duration_days: Number(row.duration_days || 0),
    price_usd_cents: Number(row.price_usd_cents || 0),
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order || 0),
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeSubscription(row, accessGrant = null) {
  const now = Date.now();
  const endsAt = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0;
  const accessActive = accessGrant
    && Boolean(accessGrant.is_active)
    && (!accessGrant.expires_at || new Date(accessGrant.expires_at).getTime() > now);
  const subscriptionActive = row
    && String(row.status || '').toLowerCase() === 'active'
    && endsAt > now;
  const allowed = accessActive || subscriptionActive;

  return {
    status: subscriptionActive ? 'active' : accessActive ? 'manual-access' : 'inactive',
    allowed,
    reason: subscriptionActive ? 'subscription_active' : accessActive ? 'manual_access' : 'inactive',
    plan_code: row?.plan_code || null,
    cloud_terminal_slots: Number(row?.cloud_terminal_slots || 0),
    includes_cloud_terminal: Number(row?.cloud_terminal_slots || 0) > 0,
    provider: row?.provider || null,
    current_period_start: row?.current_period_start || null,
    current_period_end: row?.current_period_end || null,
    latest_payment_session_id: row?.latest_payment_session_id || null,
    access_grant: accessGrant
      ? {
          id: accessGrant.id,
          reason: accessGrant.reason || '',
          expires_at: accessGrant.expires_at || null,
          granted_by: accessGrant.granted_by || '',
        }
      : null,
  };
}

async function ensureCompanyPaymentTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_payment_project_settings (
      id SERIAL PRIMARY KEY,
      project_key TEXT NOT NULL UNIQUE,
      enforcement_enabled BOOLEAN NOT NULL DEFAULT false,
      min_supported_app_version TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'flutterwave',
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_payment_plans (
      id SERIAL PRIMARY KEY,
      project_key TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      display_name TEXT NOT NULL,
      billing_period TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      price_usd_cents INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_key, plan_code)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_payment_plans_project_idx ON company_payment_plans (project_key, is_active, sort_order, id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_subscriptions (
      id SERIAL PRIMARY KEY,
      project_key TEXT NOT NULL,
      customer_key TEXT NOT NULL,
      external_user_id TEXT,
      customer_email TEXT,
      customer_name TEXT,
      plan_code TEXT,
      cloud_terminal_slots INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'inactive',
      provider TEXT,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      latest_payment_session_id TEXT,
      access_source TEXT NOT NULL DEFAULT 'payment',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_key, customer_key)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_subscriptions_lookup_idx ON company_subscriptions (project_key, customer_key, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_payment_sessions (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      project_key TEXT NOT NULL,
      customer_key TEXT NOT NULL,
      external_user_id TEXT,
      customer_email TEXT,
      customer_name TEXT,
      plan_code TEXT NOT NULL,
      cloud_terminal_slots INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL,
      amount_usd_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending',
      tx_ref TEXT NOT NULL UNIQUE,
      checkout_url TEXT,
      external_payment_id TEXT,
      return_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      paid_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_payment_sessions_lookup_idx ON company_payment_sessions (project_key, customer_key, status, created_at DESC)`);

  await pool.query(`ALTER TABLE company_subscriptions ADD COLUMN IF NOT EXISTS cloud_terminal_slots INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE company_payment_sessions ADD COLUMN IF NOT EXISTS cloud_terminal_slots INTEGER NOT NULL DEFAULT 0`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_access_grants (
      id SERIAL PRIMARY KEY,
      project_key TEXT NOT NULL,
      customer_key TEXT NOT NULL,
      external_user_id TEXT,
      customer_email TEXT,
      customer_name TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      reason TEXT,
      granted_by TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_key, customer_key)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS company_access_grants_lookup_idx ON company_access_grants (project_key, customer_key, is_active)`);
}

async function ensureProjectDefaults(pool, projectKey) {
  const normalized = normalizeProjectKey(projectKey);
  if (!normalized) return;

  await pool.query(
    `
      INSERT INTO company_payment_project_settings (project_key, enforcement_enabled, min_supported_app_version, provider, currency)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (project_key) DO NOTHING
    `,
    [normalized, DEFAULT_PROJECT_SETTINGS.enforcement_enabled, DEFAULT_PROJECT_SETTINGS.min_supported_app_version, DEFAULT_PROJECT_SETTINGS.provider, DEFAULT_PROJECT_SETTINGS.currency],
  );

  const plans = DEFAULT_PROJECT_PLANS[normalized] || [];
  for (const plan of plans) {
    await pool.query(
      `
        INSERT INTO company_payment_plans
          (project_key, plan_code, display_name, billing_period, duration_days, price_usd_cents, is_active, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, true, $7)
        ON CONFLICT (project_key, plan_code) DO NOTHING
      `,
      [normalized, plan.plan_code, plan.display_name, plan.billing_period, plan.duration_days, plan.price_usd_cents, plan.sort_order],
    );
  }

  if (normalized === 'flamebot') {
    await pool.query(
      `UPDATE company_payment_plans SET is_active = false, updated_at = NOW()
       WHERE project_key = 'flamebot' AND plan_code IN ('daily', 'day', 'weekly', 'week')`,
    );
    await pool.query(
      `UPDATE company_payment_plans
       SET display_name = CASE WHEN plan_code = 'monthly' THEN 'FlameBot Monthly' ELSE 'FlameBot Yearly' END,
           billing_period = CASE WHEN plan_code = 'monthly' THEN 'month' ELSE 'year' END,
           duration_days = CASE WHEN plan_code = 'monthly' THEN 30 ELSE 365 END,
           price_usd_cents = CASE WHEN plan_code = 'monthly' THEN 1000 ELSE 10000 END,
           is_active = true,
           sort_order = CASE WHEN plan_code = 'monthly' THEN 10 ELSE 20 END,
           updated_at = NOW()
       WHERE project_key = 'flamebot' AND plan_code IN ('monthly', 'yearly')`,
    );
  }
}

async function listProjectPlans(pool, projectKey, activeOnly = false) {
  const normalized = normalizeProjectKey(projectKey);
  await ensureProjectDefaults(pool, normalized);
  const params = [normalized];
  const where = activeOnly ? `WHERE project_key = $1 AND is_active = true` : `WHERE project_key = $1`;
  const result = await pool.query(
    `SELECT * FROM company_payment_plans ${where} ORDER BY sort_order ASC, id ASC`,
    params,
  );
  return result.rows.map(serializePlan);
}

async function getProjectSettings(pool, projectKey) {
  const normalized = normalizeProjectKey(projectKey);
  await ensureProjectDefaults(pool, normalized);
  const result = await pool.query(`SELECT * FROM company_payment_project_settings WHERE project_key = $1 LIMIT 1`, [normalized]);
  return result.rows[0] || null;
}

async function getCustomerSubscription(pool, { projectKey, externalUserId, customerEmail }) {
  const normalized = normalizeProjectKey(projectKey);
  const customerKey = buildCustomerKey(normalized, externalUserId, customerEmail);
  const [subscriptionResult, accessResult] = await Promise.all([
    pool.query(`SELECT * FROM company_subscriptions WHERE project_key = $1 AND customer_key = $2 LIMIT 1`, [normalized, customerKey]),
    pool.query(`SELECT * FROM company_access_grants WHERE project_key = $1 AND customer_key = $2 LIMIT 1`, [normalized, customerKey]),
  ]);
  return {
    customerKey,
    subscription: subscriptionResult.rows[0] || null,
    accessGrant: accessResult.rows[0] || null,
  };
}

async function createFlutterwaveCheckout({ plan, sessionRow, customerEmail, customerName, returnUrl, billingContext }) {
  if (!COMPANY_PAYMENT_FLUTTERWAVE_SECRET_KEY) {
    throw new Error('Flutterwave secret key is not configured for company payments.');
  }

  const redirectUrl = returnUrl || `${COMPANY_PAYMENT_PUBLIC_BASE_URL.replace(/\/$/, '')}/`;
  const amountMajor = Number(
    billingContext?.local_supported
      ? billingContext.checkout_amount_major
      : (Number(sessionRow.amount_usd_cents || 0) / 100)
  );
  const checkoutCurrency = String(
    billingContext?.local_supported
      ? billingContext.checkout_currency
      : (sessionRow.currency || 'USD')
  ).trim().toUpperCase() || 'USD';
  const body = {
    tx_ref: sessionRow.tx_ref,
    amount: amountMajor,
    currency: checkoutCurrency,
    redirect_url: redirectUrl,
    customer: {
      email: customerEmail,
      name: customerName || customerEmail,
    },
    customizations: {
      title: `${sessionRow.project_key} subscription`,
      description: `${plan.display_name} subscription`,
    },
    meta: {
      project_key: sessionRow.project_key,
      session_id: sessionRow.session_id,
      plan_code: plan.plan_code,
      external_user_id: sessionRow.external_user_id || '',
      customer_key: sessionRow.customer_key,
      checkout_currency: checkoutCurrency,
      local_supported: Boolean(billingContext?.local_supported),
    },
  };

  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${COMPANY_PAYMENT_FLUTTERWAVE_SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status !== 'success' || !payload?.data?.link) {
    throw new Error(payload?.message || 'Flutterwave checkout creation failed.');
  }

  return {
    checkoutUrl: payload.data.link,
    externalPaymentId: payload.data.id ? String(payload.data.id) : null,
    providerPayload: payload,
    checkoutCurrency,
    amountMajor,
  };
}

async function verifyFlutterwaveTransaction(paymentRow, webhookPayload) {
  const transactionId = String(webhookPayload?.data?.id || webhookPayload?.id || '').trim();
  if (!transactionId) throw new Error('Flutterwave webhook did not include a transaction ID.');
  if (!COMPANY_PAYMENT_FLUTTERWAVE_SECRET_KEY) throw new Error('Flutterwave verification key is not configured.');

  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${COMPANY_PAYMENT_FLUTTERWAVE_SECRET_KEY}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  const verification = await response.json().catch(() => ({}));
  const data = verification?.data || {};
  if (!response.ok || verification?.status !== 'success' || String(data?.status || '').toLowerCase() !== 'successful') {
    throw new Error('Flutterwave could not verify this payment as successful.');
  }
  if (String(data?.tx_ref || '').trim() !== String(paymentRow.tx_ref || '').trim()) {
    throw new Error('Flutterwave transaction reference does not match the checkout session.');
  }

  const billingContext = paymentRow?.metadata?.billing_context || {};
  const expectedCurrency = String(billingContext.checkout_currency || paymentRow.currency || 'USD').trim().toUpperCase();
  const expectedAmount = Number(billingContext.checkout_amount_major);
  const verifiedCurrency = String(data?.currency || '').trim().toUpperCase();
  const verifiedAmount = Number(data?.amount);
  if (!verifiedCurrency || verifiedCurrency !== expectedCurrency) {
    throw new Error('Flutterwave payment currency does not match the checkout session.');
  }
  if (!Number.isFinite(expectedAmount) || !Number.isFinite(verifiedAmount) || Math.abs(verifiedAmount - expectedAmount) > 0.01) {
    throw new Error('Flutterwave payment amount does not match the checkout session.');
  }
  return verification;
}

async function createNowPaymentsCheckout({ plan, sessionRow }) {
  if (!COMPANY_PAYMENT_NOWPAYMENTS_API_KEY) {
    throw new Error('NowPayments API key is not configured for company payments.');
  }

  const endpoint = 'https://api.nowpayments.io/v1/invoice';
  const orderId = String(sessionRow.tx_ref || '').trim() || `company-pay-${sessionRow.session_id}`;
  const publicBase = String(COMPANY_PAYMENT_PUBLIC_BASE_URL || 'https://flamecoretechltd.com').replace(/\/$/, '');
  const preferredPayCurrency = String(COMPANY_PAYMENT_NOWPAYMENTS_PAY_CURRENCY || '').trim().toLowerCase();
  const body = {
    price_amount: Number(sessionRow.amount_usd_cents || 0) / 100,
    price_currency: 'usd',
    order_id: orderId,
    order_description: `${String(sessionRow.project_key || '').toUpperCase()} ${plan.display_name} subscription`,
    ipn_callback_url: `${publicBase}/api/payments/nowpayments/webhook`,
    success_url: String(sessionRow.return_url || `${publicBase}/`),
    cancel_url: String(sessionRow.return_url || `${publicBase}/`),
  };
  if (preferredPayCurrency) {
    body.pay_currency = preferredPayCurrency;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': COMPANY_PAYMENT_NOWPAYMENTS_API_KEY,
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || 'NowPayments checkout creation failed.');
  }

  const checkoutUrl = String(payload?.invoice_url || payload?.payment_url || '').trim() || null;
  const payAddress = String(payload?.pay_address || '').trim() || null;
  const payAmount = payload?.pay_amount ?? null;
  const payCurrency = String(payload?.pay_currency || preferredPayCurrency || '').trim().toLowerCase() || null;

  if (!checkoutUrl && !payAddress) {
    throw new Error('NowPayments did not return any usable crypto payment details.');
  }

  return {
    checkoutUrl,
    externalPaymentId: payload?.payment_id ? String(payload.payment_id) : null,
    payAddress,
    payAmount,
    payCurrency,
    providerPayload: payload,
  };
}

async function applySuccessfulPayment(pool, paymentRow, webhookPayload, notifications = {}) {
  const client = await pool.connect();
  let plan;
  let lockedPayment;
  let periodEnd;
  try {
    await client.query('BEGIN');
    const paymentResult = await client.query(
      `SELECT * FROM company_payment_sessions WHERE id = $1 FOR UPDATE`,
      [paymentRow.id],
    );
    lockedPayment = paymentResult.rows[0];
    if (!lockedPayment) throw new Error(`Payment session ${paymentRow.session_id} was not found.`);
    if (String(lockedPayment.status || '').toLowerCase() === 'paid') {
      await client.query('COMMIT');
      return { alreadyProcessed: true };
    }

    const planResult = await client.query(
      `SELECT * FROM company_payment_plans WHERE project_key = $1 AND plan_code = $2 LIMIT 1`,
      [lockedPayment.project_key, lockedPayment.plan_code],
    );
    plan = planResult.rows[0];
    if (!plan) throw new Error(`Plan not found for payment session ${lockedPayment.session_id}`);

    const now = new Date();
    periodEnd = new Date(now.getTime() + Number(plan.duration_days || 0) * 24 * 60 * 60 * 1000);
    await client.query(
      `
        INSERT INTO company_subscriptions
          (project_key, customer_key, external_user_id, customer_email, customer_name, plan_code, cloud_terminal_slots, status, provider, current_period_start, current_period_end, latest_payment_session_id, access_source, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NOW(), $9, $10, 'payment', NOW())
        ON CONFLICT (project_key, customer_key)
        DO UPDATE SET
          external_user_id = EXCLUDED.external_user_id,
          customer_email = EXCLUDED.customer_email,
          customer_name = EXCLUDED.customer_name,
          plan_code = EXCLUDED.plan_code,
          cloud_terminal_slots = EXCLUDED.cloud_terminal_slots,
          status = 'active',
          provider = EXCLUDED.provider,
          current_period_start = NOW(),
          current_period_end = EXCLUDED.current_period_end,
          latest_payment_session_id = EXCLUDED.latest_payment_session_id,
          access_source = 'payment',
          updated_at = NOW()
      `,
      [
        lockedPayment.project_key,
        lockedPayment.customer_key,
        lockedPayment.external_user_id || null,
        lockedPayment.customer_email || null,
        lockedPayment.customer_name || null,
        lockedPayment.plan_code,
        Number(lockedPayment.cloud_terminal_slots || 0),
        lockedPayment.provider,
        periodEnd.toISOString(),
        lockedPayment.session_id,
      ],
    );

    await client.query(
      `UPDATE company_payment_sessions
       SET status = 'paid', paid_at = NOW(), provider_payload = $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [lockedPayment.id, JSON.stringify(webhookPayload || {})],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }

  if (typeof notifications?.sendProjectMail === 'function' && lockedPayment?.customer_email) {
    await safelyRunNotification(() => notifications.sendProjectMail({
      projectKey: lockedPayment.project_key,
      senderProfile: 'billing',
      to: [lockedPayment.customer_email],
      subject: `${projectDisplayName(lockedPayment.project_key)} payment confirmed`,
      text: buildSuccessEmailText({
        projectKey: lockedPayment.project_key,
        plan,
        customerName: lockedPayment.customer_name,
        periodEndIso: periodEnd.toISOString(),
      }),
    }));
  }
  return { alreadyProcessed: false };
}

export async function initCompanyPayments(pool) {
  await ensureCompanyPaymentTables(pool);
  await ensureProjectDefaults(pool, 'flamebot');
  await ensureProjectDefaults(pool, 'corepirate');
}

function projectDisplayName(projectKey) {
  const normalized = normalizeProjectKey(projectKey);
  if (normalized === 'flamebot') return 'FlameBot';
  if (normalized === 'corepirate') return 'Core Pirate';
  return 'Flame Core Technologies LTD';
}

function formatPlanTitle(plan) {
  return String(plan?.display_name || plan?.plan_code || 'Subscription').trim();
}

function formatBillingDisplayAmount(plan, billingContext = null) {
  if (billingContext?.local_supported && billingContext?.display_amount) {
    return String(billingContext.display_amount).trim();
  }
  return formatMoney(Number(plan?.price_usd_cents || 0) / 100, 'USD');
}

function buildCheckoutEmailText({ projectKey, plan, billingContext, checkout, customerName }) {
  const projectName = projectDisplayName(projectKey);
  const greeting = customerName ? `Hello ${customerName},` : 'Hello,';
  const lines = [
    greeting,
    '',
    `Your ${projectName} payment link is ready for the ${formatPlanTitle(plan)}.`,
    `Amount: ${formatBillingDisplayAmount(plan, billingContext)}`,
    `Method: ${String(billingContext?.payment_method_label || 'Online payment').trim()}`,
    '',
    `Complete payment here: ${checkout.checkoutUrl}`,
  ];
  if (billingContext?.note) lines.push('', `Note: ${String(billingContext.note).trim()}`);
  lines.push('', 'If you need help, reply to this email and our billing team will assist you.', '', `${projectName} Billing`);
  return lines.join('\n');
}

function buildSuccessEmailText({ projectKey, plan, customerName, periodEndIso }) {
  const projectName = projectDisplayName(projectKey);
  const greeting = customerName ? `Hello ${customerName},` : 'Hello,';
  const lines = [
    greeting,
    '',
    `Your ${projectName} payment for the ${formatPlanTitle(plan)} was confirmed successfully.`,
    'Your access is now active.',
  ];
  if (periodEndIso) lines.push(`Current access ends: ${periodEndIso}`);
  lines.push('', 'If anything looks wrong with your access, reply to this email and support will check it.', '', `${projectName} Billing`);
  return lines.join('\n');
}

function buildManualAccessEmailText({ projectKey, customerName, reason, expiresAt }) {
  const projectName = projectDisplayName(projectKey);
  const greeting = customerName ? `Hello ${customerName},` : 'Hello,';
  const lines = [greeting, '', `Your ${projectName} access was updated by the admin team.`];
  if (reason) lines.push(`Reason: ${String(reason).trim()}`);
  if (expiresAt) lines.push(`Access expiry: ${String(expiresAt).trim()}`);
  lines.push('', 'If you need help, reply to this email and our support team will assist you.', '', `${projectName} Support`);
  return lines.join('\n');
}

async function safelyRunNotification(task) {
  try {
    await task();
  } catch (error) {
    console.error('[companyPayments] notification hook failed', error);
  }
}

export function registerCompanyPaymentRoutes({ app, pool, requireAdmin, notifications = {} }) {
  const { sendProjectMail = null } = notifications || {};
  const requireAdminOrInternalApi = (request, response, next) => {
    const provided = String(request.header('x-company-payment-key') || '').trim();
    if (COMPANY_PAYMENT_INTERNAL_API_KEY && provided === COMPANY_PAYMENT_INTERNAL_API_KEY) {
      return next();
    }
    return requireAdmin(request, response, next);
  };

  app.get('/api/admin/payments/projects/:projectKey/settings', requireAdminOrInternalApi, async (request, response) => {
    try {
      const projectKey = normalizeProjectKey(request.params.projectKey);
      const settings = await getProjectSettings(pool, projectKey);
      const plans = await listProjectPlans(pool, projectKey, false);
      response.json({
        success: true,
        settings: settings ? {
          project_key: settings.project_key,
          enforcement_enabled: Boolean(settings.enforcement_enabled),
          min_supported_app_version: settings.min_supported_app_version || '',
          provider: normalizeProvider(settings.provider, 'flutterwave'),
          currency: settings.currency || 'USD',
          available_providers: providerReadiness(),
        } : null,
        plans,
      });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to load payment settings.' });
    }
  });

  app.put('/api/admin/payments/projects/:projectKey/settings', requireAdminOrInternalApi, async (request, response) => {
    try {
      const projectKey = normalizeProjectKey(request.params.projectKey);
      await ensureProjectDefaults(pool, projectKey);
      const enforcementEnabled = Boolean(request.body?.enforcement_enabled);
      const minSupportedVersion = String(request.body?.min_supported_app_version || '').trim();
      const provider = request.body?.provider != null ? normalizeProvider(request.body.provider, 'flutterwave') : null;
      const currency = request.body?.currency != null ? String(request.body.currency || '').trim().toUpperCase() || null : null;
      const result = await pool.query(
        `
          UPDATE company_payment_project_settings
          SET enforcement_enabled = $2,
              min_supported_app_version = $3,
              provider = COALESCE($4, provider),
              currency = COALESCE($5, currency),
              updated_at = NOW()
          WHERE project_key = $1
          RETURNING *
        `,
        [projectKey, enforcementEnabled, minSupportedVersion, provider, currency],
      );
      response.json({ success: true, settings: result.rows[0] });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to save payment settings.' });
    }
  });

  app.get('/api/admin/payments/projects/:projectKey/plans', requireAdminOrInternalApi, async (request, response) => {
    try {
      const plans = await listProjectPlans(pool, request.params.projectKey, false);
      response.json({ success: true, plans });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to load payment plans.' });
    }
  });

  app.post('/api/admin/payments/projects/:projectKey/plans', requireAdminOrInternalApi, async (request, response) => {
    try {
      const projectKey = normalizeProjectKey(request.params.projectKey);
      const planCode = normalizeProjectKey(request.body?.plan_code);
      const displayName = String(request.body?.display_name || '').trim();
      const billingPeriod = normalizeProjectKey(request.body?.billing_period || request.body?.plan_code);
      const durationDays = Number(request.body?.duration_days || 0);
      const priceUsdCents = Number(request.body?.price_usd_cents || 0);
      const sortOrder = Number(request.body?.sort_order || 0);
      const isActive = request.body?.is_active !== false;

      if (!planCode || !displayName || durationDays <= 0 || priceUsdCents < 0) {
        return response.status(400).json({ message: 'plan_code, display_name, duration_days, and price_usd_cents are required.' });
      }

      const result = await pool.query(
        `
          INSERT INTO company_payment_plans
            (project_key, plan_code, display_name, billing_period, duration_days, price_usd_cents, is_active, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [projectKey, planCode, displayName, billingPeriod, durationDays, priceUsdCents, isActive, sortOrder],
      );
      response.json({ success: true, plan: serializePlan(result.rows[0]) });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to create payment plan.' });
    }
  });

  app.patch('/api/admin/payments/projects/:projectKey/plans/:planId', requireAdminOrInternalApi, async (request, response) => {
    try {
      const result = await pool.query(
        `
          UPDATE company_payment_plans
          SET display_name = COALESCE($3, display_name),
              billing_period = COALESCE($4, billing_period),
              duration_days = COALESCE($5, duration_days),
              price_usd_cents = COALESCE($6, price_usd_cents),
              is_active = COALESCE($7, is_active),
              sort_order = COALESCE($8, sort_order),
              updated_at = NOW()
          WHERE project_key = $1 AND id = $2
          RETURNING *
        `,
        [
          normalizeProjectKey(request.params.projectKey),
          Number(request.params.planId),
          request.body?.display_name ?? null,
          request.body?.billing_period ? normalizeProjectKey(request.body.billing_period) : null,
          request.body?.duration_days != null ? Number(request.body.duration_days) : null,
          request.body?.price_usd_cents != null ? Number(request.body.price_usd_cents) : null,
          request.body?.is_active != null ? Boolean(request.body.is_active) : null,
          request.body?.sort_order != null ? Number(request.body.sort_order) : null,
        ],
      );
      if (!result.rows[0]) {
        return response.status(404).json({ message: 'Plan not found.' });
      }
      response.json({ success: true, plan: serializePlan(result.rows[0]) });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to update payment plan.' });
    }
  });

  app.delete('/api/admin/payments/projects/:projectKey/plans/:planId', requireAdminOrInternalApi, async (request, response) => {
    try {
      await pool.query(`DELETE FROM company_payment_plans WHERE project_key = $1 AND id = $2`, [normalizeProjectKey(request.params.projectKey), Number(request.params.planId)]);
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to delete payment plan.' });
    }
  });

  app.get('/api/admin/payments/projects/:projectKey/subscriptions', requireAdminOrInternalApi, async (request, response) => {
    try {
      const projectKey = normalizeProjectKey(request.params.projectKey);
      const [subsResult, grantsResult, paymentsResult] = await Promise.all([
        pool.query(`SELECT * FROM company_subscriptions WHERE project_key = $1 ORDER BY updated_at DESC, id DESC`, [projectKey]),
        pool.query(`SELECT * FROM company_access_grants WHERE project_key = $1 ORDER BY updated_at DESC, id DESC`, [projectKey]),
        pool.query(`SELECT * FROM company_payment_sessions WHERE project_key = $1 ORDER BY created_at DESC, id DESC LIMIT 100`, [projectKey]),
      ]);
      response.json({
        success: true,
        subscriptions: subsResult.rows,
        access_grants: grantsResult.rows,
        recent_payments: paymentsResult.rows,
      });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to load subscriptions.' });
    }
  });

  app.post('/api/admin/payments/projects/:projectKey/access', requireAdminOrInternalApi, async (request, response) => {
    try {
      const projectKey = normalizeProjectKey(request.params.projectKey);
      const externalUserId = String(request.body?.external_user_id || '').trim();
      const customerEmail = normalizeEmail(request.body?.customer_email);
      const customerName = String(request.body?.customer_name || '').trim();
      const reason = String(request.body?.reason || '').trim();
      const expiresAt = request.body?.expires_at ? new Date(request.body.expires_at).toISOString() : null;
      const isActive = request.body?.is_active !== false;
      const customerKey = buildCustomerKey(projectKey, externalUserId, customerEmail);

      if (!externalUserId && !customerEmail) {
        return response.status(400).json({ message: 'external_user_id or customer_email is required.' });
      }

      const result = await pool.query(
        `
          INSERT INTO company_access_grants
            (project_key, customer_key, external_user_id, customer_email, customer_name, is_active, reason, granted_by, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (project_key, customer_key)
          DO UPDATE SET
            external_user_id = EXCLUDED.external_user_id,
            customer_email = EXCLUDED.customer_email,
            customer_name = EXCLUDED.customer_name,
            is_active = EXCLUDED.is_active,
            reason = EXCLUDED.reason,
            granted_by = EXCLUDED.granted_by,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
          RETURNING *
        `,
        [projectKey, customerKey, externalUserId || null, customerEmail || null, customerName || null, isActive, reason || null, request.admin?.email || ADMIN_EMAIL, expiresAt],
      );
      if (typeof sendProjectMail === 'function' && customerEmail) {
        await safelyRunNotification(() => sendProjectMail({
          projectKey,
          senderProfile: 'support',
          to: [customerEmail],
          subject: `${projectDisplayName(projectKey)} access updated`,
          text: buildManualAccessEmailText({
            projectKey,
            customerName,
            reason,
            expiresAt,
          }),
        }));
      }
      response.json({ success: true, access_grant: result.rows[0] });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to update manual access.' });
    }
  });

  app.get('/api/payments/projects/:projectKey/plans', requireCompanyInternalApi, async (request, response) => {
    try {
      const plans = await listProjectPlans(pool, request.params.projectKey, true);
      const settings = await getProjectSettings(pool, request.params.projectKey);
      const billingContext = await buildLocalizedBillingContext(
        Number(plans?.[0]?.price_usd_cents || 0),
        request,
        request.body?.client_context || null,
      );
      const localizedPlans = await Promise.all(plans.map((plan) => localizePlanForDisplay(plan, billingContext)));
      response.json({
        success: true,
        settings: settings ? {
          project_key: settings.project_key,
          enforcement_enabled: Boolean(settings.enforcement_enabled),
          min_supported_app_version: settings.min_supported_app_version || '',
          provider: normalizeProvider(settings.provider, 'flutterwave'),
          currency: settings.currency || 'USD',
          available_providers: providerReadiness(),
          billing_context: billingContext,
        } : null,
        plans: localizedPlans,
        cloud_terminal: normalizeProjectKey(request.params.projectKey) === 'flamebot'
          ? cloudTerminalPricingConfig()
          : null,
      });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to load project plans.' });
    }
  });

  app.post('/api/payments/status', requireCompanyInternalApi, async (request, response) => {
    try {
      const projectKey = normalizeProjectKey(request.body?.project_key);
      const externalUserId = String(request.body?.external_user_id || '').trim();
      const customerEmail = normalizeEmail(request.body?.customer_email);
      const settings = await getProjectSettings(pool, projectKey);
      const plans = await listProjectPlans(pool, projectKey, true);
      const billingContext = await buildLocalizedBillingContext(
        Number(plans?.[0]?.price_usd_cents || 0),
        request,
        request.body?.client_context || null,
      );
      const localizedPlans = await Promise.all(plans.map((plan) => localizePlanForDisplay(plan, billingContext)));
      const { subscription, accessGrant } = await getCustomerSubscription(pool, { projectKey, externalUserId, customerEmail });
      response.json({
        success: true,
        settings: settings ? {
          project_key: settings.project_key,
          enforcement_enabled: Boolean(settings.enforcement_enabled),
          min_supported_app_version: settings.min_supported_app_version || '',
          provider: normalizeProvider(settings.provider, 'flutterwave'),
          currency: settings.currency || 'USD',
          available_providers: providerReadiness(),
          billing_context: billingContext,
        } : null,
        pricing: { plans: localizedPlans },
        cloud_terminal: projectKey === 'flamebot' ? cloudTerminalPricingConfig() : null,
        subscription: serializeSubscription(subscription, accessGrant),
      });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to load payment status.' });
    }
  });

  app.post('/api/payments/checkout', requireCompanyInternalApi, async (request, response) => {
    try {
      const projectKey = normalizeProjectKey(request.body?.project_key);
      const externalUserId = String(request.body?.external_user_id || '').trim();
      const customerEmail = normalizeEmail(request.body?.customer_email);
      const customerName = String(request.body?.customer_name || '').trim();
      const planCode = normalizeProjectKey(request.body?.plan_code);
      const requestedCloudSlots = request.body?.cloud_terminal_slots ?? 0;
      const returnUrl = String(request.body?.return_url || '').trim();
      const metadata = request.body?.metadata && typeof request.body.metadata === 'object' ? request.body.metadata : {};
      const settings = await getProjectSettings(pool, projectKey);
      const requestedProvider = normalizeProvider(request.body?.provider, normalizeProvider(settings?.provider, 'flutterwave'));

      if (!projectKey || !customerEmail || !planCode) {
        return response.status(400).json({ message: 'project_key, customer_email, and plan_code are required.' });
      }

      const planResult = await pool.query(
        `SELECT * FROM company_payment_plans WHERE project_key = $1 AND plan_code = $2 AND is_active = true LIMIT 1`,
        [projectKey, planCode],
      );
      const plan = planResult.rows[0];
      if (!plan) {
        return response.status(404).json({ message: 'Payment plan not found.' });
      }

      const cloudTerminalSlots = projectKey === 'flamebot'
        ? normalizeCloudTerminalSlots(requestedCloudSlots)
        : 0;
      if (cloudTerminalSlots == null) {
        return response.status(400).json({
          message: `Cloud Terminal quantity must be a whole number between 0 and ${FLAMEBOT_CLOUD_MAX_SLOTS}.`,
        });
      }
      if (projectKey === 'flamebot' && !['monthly', 'yearly'].includes(planCode)) {
        return response.status(400).json({ message: 'FlameBot supports monthly and yearly subscriptions only.' });
      }
      const checkoutAmountUsdCents = projectKey === 'flamebot'
        ? calculateFlameBotCheckoutAmount(plan, cloudTerminalSlots)
        : Number(plan.price_usd_cents || 0);
      const checkoutPlan = {
        ...plan,
        price_usd_cents: checkoutAmountUsdCents,
        display_name: projectKey === 'flamebot' && cloudTerminalSlots > 0
          ? `${plan.display_name} + ${cloudTerminalSlots} Cloud Terminal${cloudTerminalSlots === 1 ? '' : 's'}`
          : plan.display_name,
      };

      const billingContext = await buildLocalizedBillingContext(
        checkoutAmountUsdCents,
        request,
        request.body?.client_context || null,
      );

      const customerKey = buildCustomerKey(projectKey, externalUserId, customerEmail);
      const sessionId = crypto.randomUUID();
      const txRef = `${projectKey}-${planCode}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const checkoutCurrency = String(
        requestedProvider === 'flutterwave'
          ? (billingContext?.checkout_currency || 'USD')
          : 'USD'
      ).trim().toUpperCase() || 'USD';
      const sessionMetadata = {
        ...metadata,
        cloud_terminal_slots: cloudTerminalSlots,
        billing_context: {
          checkout_amount_major: Number(billingContext?.checkout_amount_major || checkoutAmountUsdCents / 100),
          checkout_currency: checkoutCurrency,
          usd_amount_cents: checkoutAmountUsdCents,
        },
      };

      const inserted = await pool.query(
        `
          INSERT INTO company_payment_sessions
            (session_id, project_key, customer_key, external_user_id, customer_email, customer_name, plan_code, cloud_terminal_slots, provider, amount_usd_cents, currency, tx_ref, return_url, metadata, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW() + INTERVAL '1 hour')
          RETURNING *
        `,
        [
          sessionId,
          projectKey,
          customerKey,
          externalUserId || null,
          customerEmail,
          customerName || null,
          planCode,
          cloudTerminalSlots,
          requestedProvider,
          checkoutAmountUsdCents,
          checkoutCurrency,
          txRef,
          returnUrl || null,
          JSON.stringify(sessionMetadata),
        ],
      );
      const sessionRow = inserted.rows[0];

      const checkout = requestedProvider === 'nowpayments'
        ? await createNowPaymentsCheckout({
            plan: checkoutPlan,
            sessionRow,
          })
        : await createFlutterwaveCheckout({
            plan: checkoutPlan,
            sessionRow,
            customerEmail,
            customerName,
            returnUrl,
            billingContext,
          });

      await pool.query(
        `
          UPDATE company_payment_sessions
          SET checkout_url = $2,
              external_payment_id = $3,
              provider_payload = $4::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [sessionRow.id, checkout.checkoutUrl, checkout.externalPaymentId, JSON.stringify(checkout.providerPayload || {})],
      );

      if (typeof sendProjectMail === 'function' && customerEmail && checkout.checkoutUrl) {
        await safelyRunNotification(() => sendProjectMail({
          projectKey,
          senderProfile: 'billing',
          to: [customerEmail],
          subject: `${projectDisplayName(projectKey)} payment link ready`,
          text: buildCheckoutEmailText({
            projectKey,
            plan: checkoutPlan,
            billingContext,
            checkout,
            customerName,
          }),
        }));
      }

      response.json({
        success: true,
        payment: {
          session_id: sessionId,
          project_key: projectKey,
          plan_code: planCode,
          cloud_terminal_slots: cloudTerminalSlots,
          provider: requestedProvider,
          amount_usd_cents: checkoutAmountUsdCents,
          currency: checkout.checkoutCurrency || checkoutCurrency,
          display_amount: billingContext?.local_supported ? billingContext.display_amount : formatMoney(checkoutAmountUsdCents / 100, 'USD'),
          local_supported: Boolean(billingContext?.local_supported),
          payment_method_label: billingContext?.payment_method_label || 'Card payment in USD',
          country: billingContext?.country || null,
          country_code: billingContext?.country_code || null,
          note: billingContext?.note || null,
          checkout_url: checkout.checkoutUrl,
          pay_address: checkout.payAddress || null,
          pay_amount: checkout.payAmount ?? null,
          pay_currency: checkout.payCurrency || null,
          tx_ref: txRef,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to create checkout session.' });
    }
  });

  app.post('/api/payments/flutterwave/webhook', async (request, response) => {
    try {
      if (!verifyFlutterwaveWebhook(request)) {
        return response.status(401).json({ message: 'Invalid webhook signature.' });
      }

      const payload = request.body || {};
      const txRef = String(payload?.data?.tx_ref || payload?.tx_ref || '').trim();
      const status = String(payload?.data?.status || payload?.status || '').trim().toLowerCase();
      if (!txRef) {
        return response.status(400).json({ message: 'tx_ref is required.' });
      }

      const paymentResult = await pool.query(`SELECT * FROM company_payment_sessions WHERE tx_ref = $1 LIMIT 1`, [txRef]);
      const paymentRow = paymentResult.rows[0];
      if (!paymentRow) {
        return response.status(404).json({ message: 'Payment session not found.' });
      }

      if (String(paymentRow.status || '').toLowerCase() === 'paid') {
        return response.json({ success: true, already_processed: true });
      }

      if (status === 'successful' || status === 'completed') {
        const verification = await verifyFlutterwaveTransaction(paymentRow, payload);
        await applySuccessfulPayment(pool, paymentRow, { webhook: payload, verification }, { sendProjectMail });
      } else {
        await pool.query(
          `UPDATE company_payment_sessions SET status = $2, provider_payload = $3::jsonb, updated_at = NOW() WHERE id = $1`,
          [paymentRow.id, status || 'failed', JSON.stringify(payload)],
        );
      }

      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to process Flutterwave webhook.' });
    }
  });

  app.post('/api/payments/nowpayments/webhook', async (request, response) => {
    try {
      if (!verifyNowPaymentsWebhook(request)) {
        return response.status(401).json({ message: 'Invalid NowPayments webhook signature.' });
      }

      const payload = request.body || {};
      const paymentId = String(payload?.payment_id || '').trim();
      const orderId = String(payload?.order_id || '').trim();
      const paymentStatus = String(payload?.payment_status || '').trim().toLowerCase();

      if (!paymentId && !orderId) {
        return response.status(400).json({ message: 'payment_id or order_id is required.' });
      }

      const paymentResult = paymentId
        ? await pool.query(`SELECT * FROM company_payment_sessions WHERE provider = 'nowpayments' AND external_payment_id = $1 LIMIT 1`, [paymentId])
        : await pool.query(`SELECT * FROM company_payment_sessions WHERE provider = 'nowpayments' AND tx_ref = $1 LIMIT 1`, [orderId]);

      const paymentRow = paymentResult.rows[0];
      if (!paymentRow) {
        return response.status(404).json({ message: 'Payment session not found.' });
      }

      if (String(paymentRow.status || '').toLowerCase() === 'paid') {
        return response.json({ success: true, already_processed: true });
      }

      if (['finished', 'confirmed'].includes(paymentStatus)) {
        const expectedCents = Number(paymentRow.amount_usd_cents || 0);
        const signedPriceCents = Math.round(Number(payload?.price_amount || 0) * 100);
        const signedPriceCurrency = String(payload?.price_currency || '').trim().toUpperCase();
        if (signedPriceCurrency !== 'USD' || !Number.isFinite(signedPriceCents) || Math.abs(signedPriceCents - expectedCents) > 1) {
          return response.status(400).json({ message: 'NOWPayments amount or currency does not match the checkout session.' });
        }
        await applySuccessfulPayment(pool, paymentRow, payload, { sendProjectMail });
      } else {
        await pool.query(
          `UPDATE company_payment_sessions SET status = $2, provider_payload = $3::jsonb, updated_at = NOW() WHERE id = $1`,
          [paymentRow.id, paymentStatus || 'failed', JSON.stringify(payload)],
        );
      }

      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to process NowPayments webhook.' });
    }
  });
}
