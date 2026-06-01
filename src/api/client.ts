/**
 * Flame Core API client (global-first).
 *
 * - Talks to the team-scoped API (`/api/teams/:teamId/...`).
 * - Multi-currency aware: pass `currency` to `getPlans()`.
 * - No NGN-only assumptions anywhere.
 *
 * Configuration:
 *   Set VITE_API_URL in your .env (or .env.local)
 *   Default: http://localhost:3001 (for local development)
 */
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.MODE === 'production'
    ? ((): never => {
        throw new Error('VITE_API_URL must be set in production');
      })()
    : 'http://localhost:3001')

export type CurrencyCode = 'USD' | 'NGN' | 'GBP' | 'EUR' | 'ZAR' | 'KES' | 'GHS'
export type RegionCode = 'los1' | 'lhr1' | 'fra1' | 'nyc1' | 'sin1' | 'jnb1' | 'nbo1'
export type PaymentProvider = 'stripe' | 'paystack' | 'flutterwave' | 'paypal' | 'bank_transfer' | 'crypto'

export interface SessionUser {
  id: string
  email: string
  username: string
  full_name: string
  role: 'admin' | 'owner' | 'member' | 'viewer'
  avatar_url: string | null
  country_code: string | null
  preferred_currency: CurrencyCode
  preferred_region: RegionCode
  locale: string
  timezone: string
}

export interface SessionTeam {
  id: string
  slug: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

class APIClient {
  private token: string | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = window.localStorage.getItem('flame_token')
    }
  }

  setToken(token: string) {
    this.token = token
    if (typeof window !== 'undefined') window.localStorage.setItem('flame_token', token)
  }

  clear() {
    this.token = null
    if (typeof window !== 'undefined') window.localStorage.removeItem('flame_token')
  }

  private async req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({} as any))
      const message = err?.error || `API request failed (${res.status})`
      const error = new Error(message) as Error & { status?: number; code?: string }
      error.status = res.status
      error.code = err?.code
      throw error
    }

    if (res.status === 204) return null as T
    return res.json() as Promise<T>
  }

  // ── Catalog (public) ────────────────────────────────────────────────
  health()       { return this.req('GET', '/api/health') }
  currencies()   { return this.req('GET', '/api/currencies') }
  regions()      { return this.req('GET', '/api/regions') }
  liveRegions()  { return this.req('GET', '/api/regions/live') }
  plans(currency: CurrencyCode = 'USD') {
    return this.req('GET', `/api/plans?currency=${currency}`)
  }

  // ── Auth ────────────────────────────────────────────────────────────
  async register(input: {
    email: string; username: string; password: string;
    full_name?: string; country_code?: string; locale?: string; timezone?: string;
  }) {
    const out = await this.req<{ user: SessionUser; team_id: string; token: string }>(
      'POST', '/api/auth/register', input
    )
    this.setToken(out.token)
    return out
  }

  async login(email: string, password: string) {
    const out = await this.req<{ user: SessionUser; teams: SessionTeam[]; token: string }>(
      'POST', '/api/auth/login', { email, password }
    )
    this.setToken(out.token)
    return out
  }

  async verifyEmail(token: string) {
    const out = await this.req<{ user: SessionUser; message: string }>(
      'POST', '/api/auth/verify', { token }
    )
    return out
  }

  async refreshToken() {
    const out = await this.req<{ token: string }>(
      'POST', '/api/auth/refresh'
    )
    this.setToken(out.token)
    return out
  }

  me() { return this.req<{ user: SessionUser; teams: SessionTeam[] }>('GET', '/api/auth/me') }

  updatePreferences(prefs: { preferred_currency?: CurrencyCode; preferred_region?: RegionCode; locale?: string; timezone?: string }) {
    return this.req('PATCH', '/api/auth/preferences', prefs)
  }

  // ── OAuth ───────────────────────────────────────────────────────────
  /** Returns the URL to redirect the user to for GitHub OAuth */
  get githubOAuthUrl() { return `${API_URL}/api/v1/oauth/github` }
  /** Returns the URL to redirect the user to for Google OAuth */
  get googleOAuthUrl() { return `${API_URL}/api/v1/oauth/google` }

  /** List connected OAuth providers for the current user */
  oauthAccounts() {
    return this.req<{
      has_password: boolean
      providers: { provider: string; connected: boolean; scope: string; connected_at: string; username?: string }[]
      available: string[]
    }>('GET', '/api/v1/oauth/accounts')
  }

  /** Link a new provider to the current account (redirects to provider) */
  linkGitHub() { window.location.href = `${API_URL}/api/v1/oauth/github/link` }
  linkGoogle() { window.location.href = `${API_URL}/api/v1/oauth/google/link` }

  /** Unlink/disconnect a provider */
  unlinkProvider(provider: 'github' | 'google') {
    return this.req('DELETE', `/api/v1/oauth/${provider}`)
  }

  /** List GitHub repos (requires GitHub to be connected) */
  githubRepos(page = 1) {
    return this.req<{
      id: number; full_name: string; name: string; owner: string;
      private: boolean; default_branch: string; language: string;
      description: string; updated_at: string; clone_url: string;
      html_url: string; stargazers_count: number; fork: boolean;
    }[]>('GET', `/api/v1/oauth/github/repos?page=${page}`)
  }

  // ── Projects (team-scoped) ──────────────────────────────────────────
  projects(teamId: string) { return this.req('GET', `/api/teams/${teamId}/projects`) }
  project(teamId: string, projectId: string) { return this.req('GET', `/api/teams/${teamId}/projects/${projectId}`) }

  createProject(teamId: string, input: {
    name: string; repo_url: string; description?: string;
    source?: 'github' | 'gitlab' | 'bitbucket' | 'cli' | 'git_url';
    default_branch?: string; framework?: string; primary_region?: RegionCode;
  }) {
    return this.req('POST', `/api/teams/${teamId}/projects`, input)
  }

  updateProject(teamId: string, projectId: string, updates: Record<string, unknown>) {
    return this.req('PATCH', `/api/teams/${teamId}/projects/${projectId}`, updates)
  }

  // ── Env vars ────────────────────────────────────────────────────────
  envVars(teamId: string, projectId: string) {
    return this.req('GET', `/api/teams/${teamId}/projects/${projectId}/env`)
  }
  setEnv(teamId: string, projectId: string, key: string, value: string, is_secret = false, scope: 'production'|'preview'|'development'|'all' = 'all') {
    return this.req('POST', `/api/teams/${teamId}/projects/${projectId}/env`, { key, value, is_secret, scope })
  }
  deleteEnv(teamId: string, projectId: string, key: string) {
    return this.req('DELETE', `/api/teams/${teamId}/projects/${projectId}/env/${encodeURIComponent(key)}`)
  }

  // ── Deployments ─────────────────────────────────────────────────────
  deploy(teamId: string, projectId: string, input?: { branch?: string; region?: RegionCode; commit_hash?: string; commit_message?: string }) {
    return this.req('POST', `/api/teams/${teamId}/projects/${projectId}/deploy`, input ?? {})
  }
  deployments(teamId: string, projectId: string) {
    return this.req('GET', `/api/teams/${teamId}/projects/${projectId}/deployments`)
  }
  teamDeployments(teamId: string) {
    return this.req('GET', `/api/teams/${teamId}/deployments`)
  }
  deployment(id: string)       { return this.req('GET', `/api/deployments/${id}`) }
  deploymentLogs(id: string)   { return this.req('GET', `/api/deployments/${id}/logs`) }
  cancelDeployment(id: string) { return this.req('POST', `/api/deployments/${id}/cancel`) }
  redeploy(id: string)         { return this.req('POST', `/api/deployments/${id}/redeploy`) }

  // ── Billing ─────────────────────────────────────────────────────────
  billingOptions(currency: CurrencyCode, country?: string) {
    const qs = new URLSearchParams({ currency, ...(country ? { country } : {}) }).toString()
    return this.req('GET', `/api/billing/options?${qs}`)
  }
  invoices(teamId: string) { return this.req('GET', `/api/teams/${teamId}/billing/invoices`) }
  issueInvoice(teamId: string, plan_id: string, cycle: 'monthly' | 'yearly') {
    return this.req('POST', `/api/teams/${teamId}/billing/invoices`, { plan_id, cycle })
  }
  chargeInvoice(teamId: string, invoiceId: string, input: { email: string; name?: string; provider?: PaymentProvider; country_code?: string; source_token?: string; return_url?: string }) {
    return this.req('POST', `/api/teams/${teamId}/billing/invoices/${invoiceId}/charge`, input)
  }

  // ── Admin ───────────────────────────────────────────────────────────
  adminStats()        { return this.req('GET', '/api/admin/stats') }
  adminUsers()        { return this.req('GET', '/api/admin/users') }
  adminDeployments()  { return this.req('GET', '/api/admin/deployments') }
  adminRevenue()      { return this.req('GET', '/api/admin/revenue') }
  adminSetUserStatus(userId: string, status: 'active'|'suspended'|'pending') {
    return this.req('POST', `/api/admin/users/${userId}/status`, { status })
  }
}

export const api = new APIClient()
export const apiClient = api  // backwards-compat alias
