/**
 * Unified environment configuration for Flame Core ecosystem
 * Used by both marketing website and hosting platform
 *
 * This file handles:
 * - Domain routing (marketing site vs. hosting platform)
 * - API endpoint resolution
 * - OAuth callback URLs
 * - Production vs. development configuration
 */

export interface EnvironmentConfig {
  // Domains
  mainDomain: string
  hostingDomain: string
  hostingPath: string
  apiUrl: string
  
  // Feature flags
  isDevelopment: boolean
  isProduction: boolean
  
  // OAuth
  oauthCallbackUrl: string
  githubOAuthUrl: string
  googleOAuthUrl: string
  
  // Routing
  getHostingPlatformUrl: (path?: string) => string
  getApiUrl: (endpoint: string) => string
}

/**
 * Get configuration based on environment
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const isDevelopment = process.env.NODE_ENV === 'development' || import.meta.env.MODE === 'development'
  const isProduction = !isDevelopment

  // Default development URLs
  let mainDomain = 'http://localhost:5173'
  let hostingDomain = 'http://localhost:5173'
  let hostingPath = '/hosting'
  let apiUrl = 'http://localhost:3001'

  // Production URLs from environment
  if (isProduction) {
    mainDomain = import.meta.env.VITE_MAIN_DOMAIN || 'https://flamecoretechltd.com'
    hostingDomain = import.meta.env.VITE_HOSTING_DOMAIN || 'https://hosting.flamecoretechltd.com'
    hostingPath = import.meta.env.VITE_HOSTING_PATH || '/hosting'
    apiUrl = import.meta.env.VITE_API_URL || 'https://api.flamecoretechltd.com'
  }

  const oauthCallbackUrl = isProduction
    ? `${apiUrl}/api/v1/oauth/github/callback`
    : `${apiUrl}/api/v1/oauth/github/callback`

  const config: EnvironmentConfig = {
    mainDomain,
    hostingDomain,
    hostingPath,
    apiUrl,
    isDevelopment,
    isProduction,
    oauthCallbackUrl,
    githubOAuthUrl: `${apiUrl}/api/v1/oauth/github`,
    googleOAuthUrl: `${apiUrl}/api/v1/oauth/google`,
    
    getHostingPlatformUrl: (path?: string) => {
      if (isProduction) {
        // Production: subdomain-based
        return `${hostingDomain}${path || ''}`
      }
      // Development: path-based on same domain
      return `${hostingDomain}${hostingPath}${path || ''}`
    },

    getApiUrl: (endpoint: string) => {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
      return `${apiUrl}${cleanEndpoint}`
    },
  }

  return config
}

/**
 * Get the URL to access the hosting platform console
 */
export function getHostingConsoleUrl(): string {
  const config = getEnvironmentConfig()
  return config.getHostingPlatformUrl('/console')
}

/**
 * Get the URL to access the main marketing website
 */
export function getMainWebsiteUrl(): string {
  const config = getEnvironmentConfig()
  return config.mainDomain
}

/**
 * Check if current page is on marketing website
 */
export function isMarketingSite(): boolean {
  if (typeof window === 'undefined') return false
  const config = getEnvironmentConfig()
  return window.location.origin === config.mainDomain
}

/**
 * Check if current page is on hosting platform
 */
export function isHostingPlatform(): boolean {
  if (typeof window === 'undefined') return false
  const config = getEnvironmentConfig()
  return window.location.origin === config.hostingDomain || window.location.pathname.startsWith(config.hostingPath)
}

/**
 * Export singleton instance
 */
export const envConfig = getEnvironmentConfig()
