import { query } from './pool.js';

/**
 * Flame Core — Global-first database schema
 *
 * Designed to support multi-region, multi-currency, multi-tenancy,
 * and multiple payment providers from day one — without breaking
 * the single-VPS, single-region MVP.
 */
export async function initializeDatabase() {
  console.log('🔧 Initializing Flame Core schema (global-first)…');

  const schemas = [
    // Extensions
    `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
    `CREATE EXTENSION IF NOT EXISTS "citext"`,

    // ─── Reference tables ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS currencies (
      code            VARCHAR(3) PRIMARY KEY,
      symbol          VARCHAR(8) NOT NULL,
      name            VARCHAR(64) NOT NULL,
      locale          VARCHAR(16) NOT NULL,
      decimals        SMALLINT NOT NULL DEFAULT 2,
      fx_rate_to_usd  NUMERIC(18,8) NOT NULL DEFAULT 1,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS regions (
      code            VARCHAR(8) PRIMARY KEY,
      city            VARCHAR(64) NOT NULL,
      country         VARCHAR(64) NOT NULL,
      country_code    VARCHAR(2) NOT NULL,
      continent       VARCHAR(2) NOT NULL,
      pop_id          VARCHAR(32) NOT NULL,
      status          VARCHAR(16) NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('live','beta','soon','planned','deprecated')),
      capacity_pct    SMALLINT NOT NULL DEFAULT 0,
      endpoint        VARCHAR(255),
      nodes           TEXT[] DEFAULT ARRAY[]::TEXT[],
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Users ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS users (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email               CITEXT UNIQUE NOT NULL,
      username            CITEXT UNIQUE NOT NULL,
      password_hash       VARCHAR(255),
      full_name           VARCHAR(255),
      avatar_url          VARCHAR(500),
      -- OAuth identities
      github_id           VARCHAR(64) UNIQUE,
      github_username     VARCHAR(64),
      google_id           VARCHAR(64) UNIQUE,
      -- Globalization
      country_code        VARCHAR(2),
      preferred_currency  VARCHAR(3) NOT NULL DEFAULT 'USD' REFERENCES currencies(code),
      preferred_region    VARCHAR(8) NOT NULL DEFAULT 'los1' REFERENCES regions(code),
      locale              VARCHAR(16) NOT NULL DEFAULT 'en-US',
      timezone            VARCHAR(64) NOT NULL DEFAULT 'UTC',
      -- Account
      role                VARCHAR(16) NOT NULL DEFAULT 'member'
                          CHECK (role IN ('admin','owner','member','viewer')),
      status              VARCHAR(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('active','suspended','pending','invited')),
      email_verified      BOOLEAN NOT NULL DEFAULT false,
      mfa_enabled         BOOLEAN NOT NULL DEFAULT false,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at       TIMESTAMPTZ
    )`,

    // ─── Plans ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS plans (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug                     VARCHAR(32) UNIQUE NOT NULL,
      name                     VARCHAR(64) NOT NULL,
      tagline                  VARCHAR(255),
      -- Prices in USD (base). Convert at billing time.
      price_usd_monthly        NUMERIC(10,2) NOT NULL,
      price_usd_yearly         NUMERIC(10,2) NOT NULL,
      -- Quotas
      max_projects             INTEGER NOT NULL,
      max_domains              INTEGER NOT NULL,
      max_team_members         INTEGER NOT NULL,
      build_minutes_per_month  INTEGER NOT NULL,
      -- Compute
      vcpu                     VARCHAR(32),
      ram_mb                   INTEGER,
      storage_gb               INTEGER,
      bandwidth_gb             INTEGER,
      -- Capabilities
      custom_domains           BOOLEAN NOT NULL DEFAULT false,
      multi_region             BOOLEAN NOT NULL DEFAULT false,
      preview_environments     BOOLEAN NOT NULL DEFAULT false,
      always_on                BOOLEAN NOT NULL DEFAULT false,
      priority_support         BOOLEAN NOT NULL DEFAULT false,
      uptime_sla_pct           NUMERIC(5,2),
      features                 TEXT[] DEFAULT ARRAY[]::TEXT[],
      is_public                BOOLEAN NOT NULL DEFAULT true,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Teams (multi-tenancy) ───────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS teams (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug              CITEXT UNIQUE NOT NULL,
      name              VARCHAR(255) NOT NULL,
      owner_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      billing_email     CITEXT NOT NULL,
      billing_currency  VARCHAR(3) NOT NULL DEFAULT 'USD' REFERENCES currencies(code),
      plan_id           UUID REFERENCES plans(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS team_members (
      team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       VARCHAR(16) NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner','admin','member','viewer')),
      joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (team_id, user_id)
    )`,

    // ─── Templates (Blueprints for Houses) ─────────────────────────────
    `CREATE TABLE IF NOT EXISTS templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(255) NOT NULL,
      slug          VARCHAR(255) UNIQUE NOT NULL,
      icon          VARCHAR(8) DEFAULT '🏠',
      description   TEXT,
      is_public     BOOLEAN NOT NULL DEFAULT false,
      created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      config        JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Projects (Houses) ─────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS projects (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name                VARCHAR(255) NOT NULL,
      slug                VARCHAR(255) NOT NULL,
      description         TEXT,
      primary_region      VARCHAR(8) NOT NULL DEFAULT 'los1' REFERENCES regions(code),
      status              VARCHAR(16) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','paused','archived')),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (team_id, slug)
    )`,

    // ═══════════════════════════════════════════════════════════════════
    // UNIFIED SERVICES TABLE
    //
    // Every deployable thing is a Service: apps, databases, Docker
    // images, workers, templates, cron jobs — all the same model.
    //
    // Project → contains N Services → each has own deployments,
    //           env vars, logs, metrics, networking, restart controls.
    //
    // service_category:
    //   git_repo   — app from GitHub/GitLab/Bitbucket/URL
    //   docker     — prebuilt image from any registry
    //   database   — managed DB (Postgres, MySQL, Redis, Mongo…)
    //   template   — one-click stack (Next.js, WordPress, etc.)
    //   empty      — manual config
    // ═══════════════════════════════════════════════════════════════════
    `CREATE TABLE IF NOT EXISTS services (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id               UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      -- Identity
      name                  VARCHAR(255) NOT NULL,
      slug                  VARCHAR(128) NOT NULL,
      icon                  VARCHAR(8),               -- emoji icon for UI
      -- Category
      service_category      VARCHAR(16) NOT NULL DEFAULT 'git_repo'
                            CHECK (service_category IN ('git_repo','docker','database','template','empty')),
      -- Source (for git_repo / template)
      source_provider       VARCHAR(16)
                            CHECK (source_provider IN ('github','gitlab','bitbucket','git_url','cli',NULL)),
      repo_url              VARCHAR(500),
      repo_owner            VARCHAR(255),
      repo_name             VARCHAR(255),
      default_branch        VARCHAR(255) DEFAULT 'main',
      autodeploy_enabled    BOOLEAN NOT NULL DEFAULT true,
      webhook_secret        VARCHAR(64) DEFAULT encode(gen_random_bytes(24), 'hex'),
      -- Docker (for docker category)
      docker_image          VARCHAR(500),             -- e.g. nginx:alpine, ghcr.io/org/img
      docker_registry_url   VARCHAR(500),
      docker_registry_user  VARCHAR(255),
      docker_registry_token_encrypted TEXT,
      -- Database (for database category)
      db_engine             VARCHAR(32)
                            CHECK (db_engine IN ('postgres','mysql','redis','mongodb','mariadb','rabbitmq','elasticsearch','minio',NULL)),
      db_version            VARCHAR(16),
      credentials_encrypted TEXT,                     -- JSON blob, AES-256-GCM
      connection_token      TEXT,                     -- encrypted; shown once
      connection_token_hash VARCHAR(128),
      -- Build config (for git_repo / template / empty)
      framework             VARCHAR(32) DEFAULT 'auto',
      build_command          VARCHAR(500),
      start_command          VARCHAR(500),
      install_command        VARCHAR(500),
      root_directory         VARCHAR(255),
      dockerfile_path        VARCHAR(255),
      -- Runtime
      region                 VARCHAR(8) NOT NULL DEFAULT 'los1' REFERENCES regions(code),
      internal_port          INTEGER DEFAULT 3000,
      container_id           VARCHAR(128),
      container_name         VARCHAR(128),
      internal_hostname      VARCHAR(255),            -- <slug>-<id>.flame.internal
      -- Networking
      is_public              BOOLEAN NOT NULL DEFAULT true,
      custom_domain          VARCHAR(255),
      -- Resources
      memory_mb              INTEGER NOT NULL DEFAULT 512,
      cpu_millicores         INTEGER NOT NULL DEFAULT 500,  -- 500 = 0.5 CPU
      storage_gb             INTEGER NOT NULL DEFAULT 1,
      -- State
      status                 VARCHAR(16) NOT NULL DEFAULT 'inactive'
                             CHECK (status IN ('inactive','provisioning','deploying','running','sleeping','stopped','failed','crashed','deleted')),
      -- Ref prefix for internal variable linking: \${{ref_prefix.VAR}}
      ref_prefix             VARCHAR(64),
      -- Metadata
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at             TIMESTAMPTZ,
      UNIQUE (project_id, slug)
    )`,

    `ALTER TABLE services ADD COLUMN IF NOT EXISTS ui_definition_key VARCHAR(64)`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS archived_snapshot JSONB`,

    // ─── Service advanced runtime settings ──────────────────────────────
    // Added with ALTER statements so existing installations can migrate safely.
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS network_mode VARCHAR(24) NOT NULL DEFAULT 'private'`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS network_aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS http_proxy_enabled BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS http_proxy_path VARCHAR(255) NOT NULL DEFAULT '/'`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS http_proxy_target_port INTEGER`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS https_proxy_enabled BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS proxy_headers JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS pre_deploy_command VARCHAR(1000)`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS health_check_path VARCHAR(500) NOT NULL DEFAULT '/'`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS cron_schedule VARCHAR(100)`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS restart_policy VARCHAR(24) NOT NULL DEFAULT 'unless-stopped'`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS restart_retries INTEGER NOT NULL DEFAULT 3`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS replicas INTEGER NOT NULL DEFAULT 1`,

    // Keep runtime settings inside known safe ranges.
    `ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_network_mode`,
    `ALTER TABLE services ADD CONSTRAINT chk_services_network_mode CHECK (network_mode IN ('private','public','custom'))`,
    `ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_restart_policy`,
    `ALTER TABLE services ADD CONSTRAINT chk_services_restart_policy CHECK (restart_policy IN ('no','always','unless-stopped','on-failure'))`,
    `ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_replicas`,
    `ALTER TABLE services ADD CONSTRAINT chk_services_replicas CHECK (replicas >= 1 AND replicas <= 10)`,
    `ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_restart_retries`,
    `ALTER TABLE services ADD CONSTRAINT chk_services_restart_retries CHECK (restart_retries >= 0 AND restart_retries <= 20)`,

    // Persistent log events stay even after deployments are canceled or a room is removed.
    `CREATE TABLE IF NOT EXISTS deployment_log_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deployment_id   UUID REFERENCES deployments(id) ON DELETE SET NULL,
      service_id      UUID REFERENCES services(id) ON DELETE SET NULL,
      project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
      team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
      stream          VARCHAR(24) NOT NULL DEFAULT 'runtime'
                      CHECK (stream IN ('build','runtime','http','network','system','database','backup','replication')),
      level           VARCHAR(12) NOT NULL DEFAULT 'info'
                      CHECK (level IN ('debug','info','warn','error','ok')),
      message         TEXT NOT NULL,
      trace_id        VARCHAR(64),
      metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Deployments (now per-service, not per-project) ──────────────
    `CREATE TABLE IF NOT EXISTS deployments (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id        UUID REFERENCES services(id) ON DELETE SET NULL,
      project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      triggered_by      UUID REFERENCES users(id) ON DELETE SET NULL,
      trigger           VARCHAR(16) NOT NULL DEFAULT 'manual'
                        CHECK (trigger IN ('manual','git_push','webhook','rollback','redeploy','cli','auto')),
      -- Source snapshot
      commit_hash       VARCHAR(40),
      commit_message    TEXT,
      commit_author     VARCHAR(255),
      branch            VARCHAR(255),
      -- Docker image snapshot (for docker / database services)
      image_source      VARCHAR(500),
      -- Runtime
      region            VARCHAR(8) NOT NULL REFERENCES regions(code),
      internal_port     INTEGER,
      container_id      VARCHAR(128),
      image_tag         VARCHAR(255),
      -- Networking
      deployment_url    VARCHAR(500),
      status            VARCHAR(16) NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','cloning','building','pushing','provisioning','ready','failed','cancelled','stopped')),
      -- Timings
      queued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      started_at        TIMESTAMPTZ,
      ready_at          TIMESTAMPTZ,
      duration_ms       INTEGER,
      -- Logs (truncated; full in object storage)
      build_logs        TEXT,
      runtime_logs      TEXT,
      error_message     TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Domains (per-service) ──────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS domains (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id            UUID REFERENCES services(id) ON DELETE CASCADE,
      project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id               UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      domain                VARCHAR(255) UNIQUE NOT NULL,
      type                  VARCHAR(16) NOT NULL DEFAULT 'custom'
                            CHECK (type IN ('system','custom')),
      verification_method   VARCHAR(16) NOT NULL DEFAULT 'dns_cname',
      verification_token    VARCHAR(64) NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
      verified              BOOLEAN NOT NULL DEFAULT false,
      verified_at           TIMESTAMPTZ,
      ssl_status            VARCHAR(16) NOT NULL DEFAULT 'pending'
                            CHECK (ssl_status IN ('pending','provisioning','active','failed','expired')),
      ssl_provider          VARCHAR(32) NOT NULL DEFAULT 'letsencrypt',
      ssl_cert_path         VARCHAR(500),
      ssl_key_path          VARCHAR(500),
      ssl_expires_at        TIMESTAMPTZ,
      redirect_to_primary   BOOLEAN NOT NULL DEFAULT false,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Environment variables (per-service, not per-project) ──────────
    `CREATE TABLE IF NOT EXISTS environment_variables (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service_id        UUID REFERENCES services(id) ON DELETE CASCADE,
      project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
      key               VARCHAR(255) NOT NULL,
      value_encrypted   TEXT NOT NULL,
      is_secret         BOOLEAN NOT NULL DEFAULT false,
      scope             VARCHAR(16) NOT NULL DEFAULT 'all'
                        CHECK (scope IN ('production','preview','development','all')),
      created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── OAuth tokens (GitHub, Google, etc.) ─────────────────────────────
    `CREATE TABLE IF NOT EXISTS user_oauth_tokens (
      user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider                  VARCHAR(32) NOT NULL
                                CHECK (provider IN ('github','google','gitlab','bitbucket')),
      access_token_encrypted    TEXT NOT NULL,
      refresh_token_encrypted   TEXT,
      scope                     TEXT,
      expires_at                TIMESTAMPTZ,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, provider)
    )`,

    // ─── Email verification tokens ───────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email                 CITEXT NOT NULL,
      token                 VARCHAR(64) UNIQUE NOT NULL,  -- hex token
      is_used               BOOLEAN NOT NULL DEFAULT false,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at            TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
      verified_at           TIMESTAMPTZ
    )`,

    // ─── Refresh tokens (long-lived, stored server-side) ──────────────────
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash            VARCHAR(64) UNIQUE NOT NULL,  -- SHA256 hash for security
      is_revoked            BOOLEAN NOT NULL DEFAULT false,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at            TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
      revoked_at            TIMESTAMPTZ,
      last_used_at          TIMESTAMPTZ
    )`,

    // ─── Password reset tokens ───────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email                 CITEXT NOT NULL,
      token                 VARCHAR(64) UNIQUE NOT NULL,
      is_used               BOOLEAN NOT NULL DEFAULT false,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at            TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
      used_at               TIMESTAMPTZ
    )`,

    // ─── Usage counters (for quotas, billing, abuse detection) ───────────
    `CREATE TABLE IF NOT EXISTS usage_counters (
      team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      period_month        DATE NOT NULL, -- first day of month
      build_minutes       INTEGER NOT NULL DEFAULT 0,
      bandwidth_bytes     BIGINT NOT NULL DEFAULT 0,
      storage_bytes       BIGINT NOT NULL DEFAULT 0,
      deployments_active  INTEGER NOT NULL DEFAULT 0,
      cpu_seconds         BIGINT NOT NULL DEFAULT 0,
      requests_count      BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (team_id, period_month)
    )`,

    // ─── Deployment previews (PR previews) ───────────────────────────────
    `CREATE TABLE IF NOT EXISTS preview_deployments (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deployment_id     UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      pr_number         INTEGER,
      pr_title          VARCHAR(500),
      branch            VARCHAR(255) NOT NULL,
      commit_hash       VARCHAR(40) NOT NULL,
      preview_url       VARCHAR(500) NOT NULL,
      status            VARCHAR(16) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','closed','expired')),
      expires_at        TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at         TIMESTAMPTZ
    )`,

    // Plan storage/upload limits added early to avoid painful migrations later.
    `ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_upload_mb INTEGER NOT NULL DEFAULT 50`,
    `ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_object_count INTEGER NOT NULL DEFAULT 1000`,

    // ─── Persistent project volumes ───────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS persistent_volumes (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name              VARCHAR(64) NOT NULL,
      mount_path        VARCHAR(255) NOT NULL,
      host_path         VARCHAR(500) NOT NULL,
      kind              VARCHAR(24) NOT NULL DEFAULT 'uploads'
                        CHECK (kind IN ('uploads','sqlite','cache','generated','backups','custom')),
      read_only         BOOLEAN NOT NULL DEFAULT false,
      quota_bytes       BIGINT,
      used_bytes        BIGINT NOT NULL DEFAULT 0,
      is_active         BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project_id, name),
      UNIQUE (project_id, mount_path)
    )`,

    // ─── Persistent object/file metadata ─────────────────────────────────
    `CREATE TABLE IF NOT EXISTS storage_objects (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      volume_id         UUID REFERENCES persistent_volumes(id) ON DELETE SET NULL,
      key               VARCHAR(1024) NOT NULL,
      original_name     VARCHAR(255) NOT NULL,
      content_type      VARCHAR(255) NOT NULL,
      size_bytes        BIGINT NOT NULL,
      etag              VARCHAR(255),
      checksum_sha256   VARCHAR(64),
      visibility        VARCHAR(16) NOT NULL DEFAULT 'private'
                        CHECK (visibility IN ('private','public')),
      provider          VARCHAR(24) NOT NULL DEFAULT 'local'
                        CHECK (provider IN ('local','s3','r2','b2')),
      object_url        VARCHAR(1024),
      cdn_url           VARCHAR(1024),
      status            VARCHAR(16) NOT NULL DEFAULT 'ready'
                        CHECK (status IN ('pending','ready','failed','deleted','quarantined')),
      bandwidth_bytes   BIGINT NOT NULL DEFAULT 0,
      download_count    BIGINT NOT NULL DEFAULT 0,
      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at        TIMESTAMPTZ,
      UNIQUE (project_id, key)
    )`,

    // ─── Upload tickets / signed upload sessions ─────────────────────────
    `CREATE TABLE IF NOT EXISTS upload_tickets (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      object_id         UUID REFERENCES storage_objects(id) ON DELETE SET NULL,
      token_hash        VARCHAR(128) NOT NULL UNIQUE,
      key               VARCHAR(1024) NOT NULL,
      content_type      VARCHAR(255) NOT NULL,
      max_size_bytes    BIGINT NOT NULL,
      visibility        VARCHAR(16) NOT NULL DEFAULT 'private'
                        CHECK (visibility IN ('private','public')),
      expires_at        TIMESTAMPTZ NOT NULL,
      used_at           TIMESTAMPTZ,
      created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Media processing hooks (future image/video pipeline) ────────────
    `CREATE TABLE IF NOT EXISTS media_jobs (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      object_id         UUID NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
      team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      job_type          VARCHAR(24) NOT NULL
                        CHECK (job_type IN ('thumbnail','optimize','transcode','scan')),
      status            VARCHAR(16) NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','processing','done','failed')),
      input_key         VARCHAR(1024) NOT NULL,
      output_key        VARCHAR(1024),
      error_message     TEXT,
      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at      TIMESTAMPTZ
    )`,

    // ─── Payments — modular providers ────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS payment_methods (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id                UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      provider               VARCHAR(32) NOT NULL
                             CHECK (provider IN ('stripe','paystack','flutterwave','paypal','bank_transfer','crypto')),
      provider_customer_id   VARCHAR(255),
      provider_method_id     VARCHAR(255),
      brand                  VARCHAR(32),
      last4                  VARCHAR(4),
      exp_month              SMALLINT,
      exp_year               SMALLINT,
      is_default             BOOLEAN NOT NULL DEFAULT false,
      currency               VARCHAR(3) NOT NULL REFERENCES currencies(code),
      country_code           VARCHAR(2),
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS invoices (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      plan_id             UUID REFERENCES plans(id) ON DELETE SET NULL,
      -- Amounts in MINOR units (kobo, cents, pence)
      amount_minor        BIGINT NOT NULL,
      currency            VARCHAR(3) NOT NULL REFERENCES currencies(code),
      amount_usd_minor    BIGINT NOT NULL,
      fx_rate_at_issue    NUMERIC(18,8) NOT NULL,
      -- Lifecycle
      status              VARCHAR(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','paid','failed','refunded','disputed')),
      -- Provider
      payment_provider    VARCHAR(32),
      provider_ref        VARCHAR(255),
      provider_fee_minor  BIGINT,
      -- Period
      period_start        TIMESTAMPTZ NOT NULL,
      period_end          TIMESTAMPTZ NOT NULL,
      due_at              TIMESTAMPTZ NOT NULL,
      paid_at             TIMESTAMPTZ,
      -- Document
      number              VARCHAR(32) UNIQUE NOT NULL,
      pdf_url             VARCHAR(500),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── API keys ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS api_keys (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      name          VARCHAR(255) NOT NULL,
      key_prefix    VARCHAR(16) NOT NULL,
      key_hash      VARCHAR(255) NOT NULL,
      scopes        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      last_used_at  TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Webhooks ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS webhooks (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      url                VARCHAR(500) NOT NULL,
      events             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      secret             VARCHAR(64) NOT NULL,
      is_active          BOOLEAN NOT NULL DEFAULT true,
      last_delivery_at   TIMESTAMPTZ,
      last_status_code   INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Audit log ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id        UUID REFERENCES teams(id) ON DELETE SET NULL,
      actor_id       UUID,
      actor_type     VARCHAR(16) NOT NULL DEFAULT 'user'
                     CHECK (actor_type IN ('user','system','api_key')),
      action         VARCHAR(64) NOT NULL,
      resource_type  VARCHAR(32) NOT NULL,
      resource_id    VARCHAR(64),
      metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address     INET,
      user_agent     TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // (attached_services is now unified into the `services` table above)

    // ─── Email outbox (queued transactional emails) ─────────────────────
    `CREATE TABLE IF NOT EXISTS email_outbox (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      to_email      VARCHAR(255) NOT NULL,
      to_name       VARCHAR(255),
      subject       VARCHAR(500) NOT NULL,
      template      VARCHAR(64) NOT NULL,
      template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      html_body     TEXT,
      text_body     TEXT,
      status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','sent','failed','bounced')),
      attempts      SMALLINT NOT NULL DEFAULT 0,
      max_attempts  SMALLINT NOT NULL DEFAULT 3,
      error_message TEXT,
      sent_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Platform settings (runtime-configurable from admin) ─────────────
    `CREATE TABLE IF NOT EXISTS platform_settings (
      key        VARCHAR(128) PRIMARY KEY,
      value      TEXT NOT NULL,
      encrypted  BOOLEAN NOT NULL DEFAULT false,
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Health checks ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS health_checks (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deployment_id     UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      path              VARCHAR(500) NOT NULL DEFAULT '/',
      method            VARCHAR(8) NOT NULL DEFAULT 'GET',
      interval_seconds  INTEGER NOT NULL DEFAULT 30,
      timeout_ms        INTEGER NOT NULL DEFAULT 5000,
      healthy_threshold INTEGER NOT NULL DEFAULT 2,
      unhealthy_threshold INTEGER NOT NULL DEFAULT 3,
      current_status    VARCHAR(16) NOT NULL DEFAULT 'unknown'
                        CHECK (current_status IN ('unknown','healthy','unhealthy','degraded')),
      last_check_at     TIMESTAMPTZ,
      last_status_code  INTEGER,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── TOTP 2FA secrets ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS user_totp (
      user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_encrypted TEXT NOT NULL,
      verified         BOOLEAN NOT NULL DEFAULT false,
      recovery_codes   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Active sessions ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash   VARCHAR(128) NOT NULL,
      ip_address   INET,
      user_agent   TEXT,
      country_code VARCHAR(2),
      device_name  VARCHAR(128),
      is_current   BOOLEAN NOT NULL DEFAULT false,
      last_active  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // ─── Indexes ─────────────────────────────────────────────────────────
    `CREATE INDEX IF NOT EXISTS idx_users_email                ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_users_github_id            ON users(github_id) WHERE github_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_teams_owner                ON teams(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_members_user          ON team_members(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_team              ON projects(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_region            ON projects(primary_region)`,
    `CREATE INDEX IF NOT EXISTS idx_services_project           ON services(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_services_team              ON services(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_services_category          ON services(service_category)`,
    `CREATE INDEX IF NOT EXISTS idx_services_status            ON services(status) WHERE status NOT IN ('inactive','stopped')`,
    `CREATE INDEX IF NOT EXISTS idx_services_token             ON services(connection_token_hash) WHERE connection_token_hash IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_service        ON deployments(service_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_project        ON deployments(project_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_team           ON deployments(team_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_status         ON deployments(status) WHERE status IN ('queued','building','provisioning')`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_region_status  ON deployments(region, status)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_service            ON domains(service_id)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_project            ON domains(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_team               ON domains(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_envvars_service            ON environment_variables(service_id)`,
    `CREATE INDEX IF NOT EXISTS idx_envvars_project_scope      ON environment_variables(project_id, scope)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_envvars_service_key_scope ON environment_variables(service_id, key, scope) WHERE service_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_envvars_project_key_scope ON environment_variables(project_id, key, scope) WHERE service_id IS NULL AND project_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_invoices_team_status       ON invoices(team_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_invoices_currency          ON invoices(currency)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_team_created         ON audit_logs(team_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_usage_team_month           ON usage_counters(team_id, period_month)`,
    `CREATE INDEX IF NOT EXISTS idx_preview_project            ON preview_deployments(project_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user          ON user_oauth_tokens(user_id)`,
    // (attached_services indexes removed — now in services table)
    `CREATE INDEX IF NOT EXISTS idx_email_outbox_status        ON email_outbox(status, created_at) WHERE status IN ('pending','sending')`,
    `CREATE INDEX IF NOT EXISTS idx_health_checks_deployment   ON health_checks(deployment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user         ON user_sessions(user_id, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_log_events_service         ON deployment_log_events(service_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_log_events_deployment      ON deployment_log_events(deployment_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_log_events_stream          ON deployment_log_events(service_id, stream, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_volumes_project            ON persistent_volumes(project_id, is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_objects_project            ON storage_objects(project_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_objects_team               ON storage_objects(team_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_upload_tickets_project     ON upload_tickets(project_id, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_media_jobs_status          ON media_jobs(status, created_at)`,
  ];

  for (const stmt of schemas) {
    try {
      await query(stmt);
    } catch (err) {
      console.error('Schema error on:', stmt.substring(0, 80), err);
    }
  }

  console.log('✅ Schema initialized');
}
