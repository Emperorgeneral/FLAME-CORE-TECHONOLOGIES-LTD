/**
 * Flame Core — Global-first type definitions
 *
 * Strategic note: Architecture supports global multi-region, multi-currency,
 * multi-payment-provider from day one. Initial GTM focuses on Africa, but
 * NO logic should be hardcoded to a single country/currency/region.
 */

// ─── Currencies ────────────────────────────────────────────────────────────
export type CurrencyCode = 'USD' | 'NGN' | 'GBP' | 'EUR' | 'ZAR' | 'KES' | 'GHS';

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
  // Multiplier vs base currency (USD). Refreshed via FX provider job.
  fx_rate_to_usd: number;
}

// ─── Regions ───────────────────────────────────────────────────────────────
export type RegionCode =
  | 'los1'   // Lagos, Nigeria
  | 'lhr1'   // London, UK
  | 'fra1'   // Frankfurt, Germany
  | 'nyc1'   // New York, USA
  | 'sin1'   // Singapore
  | 'jnb1'   // Johannesburg, South Africa
  | 'nbo1';  // Nairobi, Kenya

export type RegionStatus = 'live' | 'beta' | 'soon' | 'planned' | 'deprecated';

export interface Region {
  code: RegionCode;
  city: string;
  country: string;
  country_code: string;       // ISO 3166-1 alpha-2
  continent: 'AF' | 'EU' | 'NA' | 'SA' | 'AS' | 'OC';
  pop_id: string;             // e.g. AFR-W-01
  status: RegionStatus;
  capacity_pct: number;       // 0-100
  endpoint: string;           // internal API endpoint for the region node
  // For future multi-node-per-region setups
  nodes: string[];
}

// ─── Users ─────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'owner' | 'member' | 'viewer';
export type UserStatus = 'active' | 'suspended' | 'pending' | 'invited';

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string | null;     // null when OAuth-only
  full_name: string;
  avatar_url: string | null;
  // OAuth identities
  github_id: string | null;
  github_username: string | null;
  google_id: string | null;
  // Globalization
  country_code: string | null;
  preferred_currency: CurrencyCode;
  preferred_region: RegionCode;
  locale: string;
  timezone: string;
  // Account
  role: UserRole;
  status: UserStatus;
  email_verified: boolean;
  mfa_enabled: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

// ─── Teams (multi-tenancy from day one) ────────────────────────────────────
export interface Team {
  id: string;
  slug: string;                      // org slug used in URLs
  name: string;
  owner_id: string;
  billing_email: string;
  billing_currency: CurrencyCode;
  plan_id: string;
  created_at: Date;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: UserRole;
  joined_at: Date;
}

// ─── Projects ──────────────────────────────────────────────────────────────
export type FrameworkType =
  | 'nextjs' | 'nuxt' | 'svelte' | 'astro' | 'remix'   // SSR
  | 'react' | 'vue' | 'static'                         // static
  | 'express' | 'fastify' | 'nestjs' | 'nodejs'        // node
  | 'python' | 'flask' | 'django' | 'fastapi'          // python
  | 'go' | 'rust' | 'bun' | 'deno'                     // other
  | 'docker'                                            // BYO Dockerfile
  | 'unknown';

export type DeploymentSource = 'github' | 'gitlab' | 'bitbucket' | 'cli' | 'git_url';

export interface Project {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  description: string;
  // Source
  source: DeploymentSource;
  repo_url: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  // Build config
  framework: FrameworkType;
  build_command: string | null;
  start_command: string | null;
  install_command: string | null;
  root_directory: string | null;
  dockerfile_path: string | null;
  // Runtime
  primary_region: RegionCode;
  // Auto-deploy
  autodeploy_enabled: boolean;
  webhook_secret: string;
  status: 'active' | 'paused' | 'archived';
  created_at: Date;
  updated_at: Date;
}

// ─── Deployments ───────────────────────────────────────────────────────────
export type DeploymentStatus =
  | 'queued'
  | 'cloning'
  | 'building'
  | 'pushing'
  | 'provisioning'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'stopped';

export type DeploymentTrigger = 'manual' | 'git_push' | 'webhook' | 'rollback' | 'redeploy' | 'cli';

export interface Deployment {
  id: string;
  project_id: string;
  team_id: string;
  triggered_by: string;             // user_id
  trigger: DeploymentTrigger;
  // Source snapshot
  commit_hash: string;
  commit_message: string;
  commit_author: string;
  branch: string;
  // Runtime
  region: RegionCode;
  internal_port: number;
  container_id: string | null;
  image_tag: string | null;
  // Networking
  deployment_url: string;           // *.flame.app generated URL
  status: DeploymentStatus;
  // Timings
  queued_at: Date;
  started_at: Date | null;
  ready_at: Date | null;
  duration_ms: number | null;
  // Logs (truncated; full in object storage)
  build_logs: string;
  runtime_logs: string;
  error_message: string | null;
  created_at: Date;
}

// ─── Domains ───────────────────────────────────────────────────────────────
export type SSLStatus = 'pending' | 'provisioning' | 'active' | 'failed' | 'expired';
export type DomainType = 'system' | 'custom';

export interface Domain {
  id: string;
  project_id: string;
  team_id: string;
  domain: string;
  type: DomainType;
  // Verification
  verification_method: 'dns_cname' | 'dns_txt' | 'http';
  verification_token: string;
  verified: boolean;
  verified_at: Date | null;
  // SSL via Let's Encrypt / Certbot
  ssl_status: SSLStatus;
  ssl_provider: 'letsencrypt' | 'cloudflare' | 'custom';
  ssl_cert_path: string | null;
  ssl_key_path: string | null;
  ssl_expires_at: Date | null;
  // Routing
  redirect_to_primary: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── Environment variables ─────────────────────────────────────────────────
export type EnvScope = 'production' | 'preview' | 'development' | 'all';

export interface EnvironmentVariable {
  id: string;
  project_id: string;
  key: string;
  value_encrypted: string;          // AES-256-GCM
  is_secret: boolean;
  scope: EnvScope;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// ─── Persistent storage ────────────────────────────────────────────────────
export type StorageProviderKind = 'local' | 's3' | 'r2' | 'b2';
export type StorageVisibility = 'private' | 'public';
export type PersistentVolumeKind = 'uploads' | 'sqlite' | 'cache' | 'generated' | 'backups' | 'custom';

export interface PersistentVolume {
  id: string;
  team_id: string;
  project_id: string;
  name: string;
  mount_path: string;
  host_path: string;
  kind: PersistentVolumeKind;
  read_only: boolean;
  quota_bytes: number | null;
  used_bytes: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StorageObject {
  id: string;
  team_id: string;
  project_id: string;
  volume_id: string | null;
  key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  etag: string | null;
  checksum_sha256: string | null;
  visibility: StorageVisibility;
  provider: StorageProviderKind;
  object_url: string | null;
  cdn_url: string | null;
  status: 'pending' | 'ready' | 'failed' | 'deleted' | 'quarantined';
  bandwidth_bytes: number;
  download_count: number;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface UploadTicket {
  id: string;
  team_id: string;
  project_id: string;
  object_id: string | null;
  token_hash: string;
  key: string;
  content_type: string;
  max_size_bytes: number;
  visibility: StorageVisibility;
  expires_at: Date;
  used_at: Date | null;
  created_by: string | null;
  created_at: Date;
}

export interface MediaJob {
  id: string;
  object_id: string;
  team_id: string;
  project_id: string;
  job_type: 'thumbnail' | 'optimize' | 'transcode' | 'scan';
  status: 'queued' | 'processing' | 'done' | 'failed';
  input_key: string;
  output_key: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  completed_at: Date | null;
}

// ─── Plans (multi-currency, USD-base) ──────────────────────────────────────
export type PlanSlug = 'hobby' | 'starter' | 'pro' | 'scale' | 'enterprise';

export interface Plan {
  id: string;
  slug: PlanSlug;
  name: string;
  tagline: string;
  // Pricing — base in USD; converted at billing time using current FX
  price_usd_monthly: number;
  price_usd_yearly: number;
  // Quotas
  max_projects: number;
  max_domains: number;
  max_team_members: number;
  build_minutes_per_month: number;
  max_upload_mb: number;
  max_object_count: number;
  // Compute
  vcpu: string;
  ram_mb: number;
  storage_gb: number;
  bandwidth_gb: number;
  // Capabilities
  custom_domains: boolean;
  multi_region: boolean;
  preview_environments: boolean;
  always_on: boolean;
  priority_support: boolean;
  uptime_sla_pct: number | null;
  features: string[];
  is_public: boolean;
}

// ─── Payments (modular provider system) ────────────────────────────────────
export type PaymentProvider =
  | 'stripe'
  | 'paystack'
  | 'flutterwave'
  | 'paypal'
  | 'bank_transfer'
  | 'crypto';                       // future

export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refunded' | 'disputed';

export interface PaymentMethod {
  id: string;
  team_id: string;
  provider: PaymentProvider;
  provider_customer_id: string;     // e.g. cus_xxx on Stripe, customer_code on Paystack
  provider_method_id: string;       // pm_xxx, authorization_code, etc.
  // Display info (PCI-safe)
  brand: string | null;             // visa, mastercard, verve
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  // Defaults
  is_default: boolean;
  currency: CurrencyCode;
  country_code: string | null;
  created_at: Date;
}

export interface Invoice {
  id: string;
  team_id: string;
  plan_id: string;
  // Amounts — store BOTH the displayed currency and the USD equivalent at issue time
  amount_minor: number;             // in smallest unit (kobo, cents, pence)
  currency: CurrencyCode;
  amount_usd_minor: number;
  fx_rate_at_issue: number;
  // Lifecycle
  status: PaymentStatus;
  // Provider
  payment_provider: PaymentProvider | null;
  provider_ref: string | null;
  provider_fee_minor: number | null;
  // Period
  period_start: Date;
  period_end: Date;
  due_at: Date;
  paid_at: Date | null;
  // Document
  number: string;                   // FC-2025-000123
  pdf_url: string | null;
  created_at: Date;
}

// ─── API keys ──────────────────────────────────────────────────────────────
export interface APIKey {
  id: string;
  team_id: string;
  created_by: string;
  name: string;
  key_prefix: string;               // first 8 chars for display
  key_hash: string;                 // bcrypt hash of full key
  scopes: string[];                 // ['deployments:write', 'projects:read', ...]
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

// ─── Webhooks ──────────────────────────────────────────────────────────────
export type WebhookEvent =
  | 'deployment.queued'
  | 'deployment.started'
  | 'deployment.ready'
  | 'deployment.failed'
  | 'domain.verified'
  | 'domain.ssl_active'
  | 'invoice.paid'
  | 'invoice.failed';

export interface Webhook {
  id: string;
  team_id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  is_active: boolean;
  last_delivery_at: Date | null;
  last_status_code: number | null;
  created_at: Date;
}

// ─── Audit log ─────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  team_id: string;
  actor_id: string;                 // user_id or 'system'
  actor_type: 'user' | 'system' | 'api_key';
  action: string;                   // 'deployment.created', 'env.updated', etc.
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

// ─── Job queue payloads ────────────────────────────────────────────────────
export interface DeploymentJobPayload {
  deployment_id: string;
  project_id: string;
  team_id: string;
  region: RegionCode;
  source: DeploymentSource;
  repo_url: string;
  branch: string;
  commit_hash: string;
}

// ─── JWT ───────────────────────────────────────────────────────────────────
export interface JWTPayload {
  sub: string;                      // user_id
  email: string;
  role: UserRole;
  team_ids: string[];
  iat: number;
  exp: number;
}
