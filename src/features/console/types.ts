// Shared types for the Console feature

export type DeployStatus = 
  | "queued" | "cloning" | "installing" | "building" | "provisioning" 
  | "starting" | "healthy" | "ready" | "failed" | "sleeping" | "stopped" 
  | "cancelled" | "rollback" | "redeploying"

export interface Deployment {
  id: string
  project: string
  repo: string
  branch: string
  framework: string
  region: string
  status: DeployStatus
  commit: string
  commitMsg: string
  duration: string
  deployedAt: string
  url: string
  health?: "healthy" | "unhealthy" | "degraded" | "unknown"
  cpuPct?: number
  ramMB?: number
  restarts?: number
}

export interface Project {
  id: string
  name: string
  repo: string
  framework: string
  region: string
  status: string
  lastDeploy?: string
  url?: string
}

export interface Service {
  id: string
  name: string
  type: string
  status: string
  icon: string
  region?: string
}
