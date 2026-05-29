import { useState } from 'react'
import type { Deployment, Region, LogLine } from './types'

// Re-export StatusBadge for use in other console views
export function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; bg: string; border: string; pulse?: boolean }> = {
    queued:        { color: "#6B6560", bg: "white/[0.04]",  border: "white/[0.08]" },
    cloning:       { color: "#FFBD2E", bg: "#FFBD2E/10",   border: "#FFBD2E/30", pulse: true },
    installing:    { color: "#FFBD2E", bg: "#FFBD2E/10",   border: "#FFBD2E/30", pulse: true },
    building:      { color: "#FFBD2E", bg: "#FFBD2E/10",   border: "#FFBD2E/30", pulse: true },
    provisioning:  { color: "#FFBD2E", bg: "#FFBD2E/10",   border: "#FFBD2E/30", pulse: true },
    starting:      { color: "#FF8A4D", bg: "#FF8A4D/10",   border: "#FF8A4D/30", pulse: true },
    healthy:       { color: "#27D17F", bg: "#27D17F/10",   border: "#27D17F/30" },
    ready:         { color: "#27D17F", bg: "#27D17F/10",   border: "#27D17F/30" },
    failed:        { color: "#FF5F56", bg: "#FF5F56/10",   border: "#FF5F56/30" },
    sleeping:      { color: "#8B7FFF", bg: "#8B7FFF/10",   border: "#8B7FFF/30" },
    stopped:       { color: "#6B6560", bg: "white/[0.04]",  border: "white/[0.08]" },
    cancelled:     { color: "#6B6560", bg: "white/[0.04]",  border: "white/[0.08]" },
    rollback:      { color: "#FF8A4D", bg: "#FF8A4D/10",   border: "#FF8A4D/30", pulse: true },
    redeploying:   { color: "#FF8A4D", bg: "#FF8A4D/10",   border: "#FF8A4D/30", pulse: true },
  }
  const cfg = configs[status] || configs.queued
  return (
    <span className={`mono text-[10px] font-[700] tracking-[0.12em] uppercase px-2 py-1 rounded-full inline-flex items-center gap-1.5`}
      style={{ color: cfg.color, backgroundColor: `color-mix(in srgb, ${cfg.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)` }}>
      {cfg.pulse && <span className="h-1 w-1 rounded-full animate-pulse" style={{ backgroundColor: cfg.color }} />}
      {status}
    </span>
  )
}

interface ConsoleDashboardProps {
  deployments: Deployment[]
  regions: Region[]
  consoleTab: "deployments" | "logs" | "env" | "domains" | "services" | "settings"
  setConsoleTab: (t: any) => void
  selectedDeployment: string | null
  setSelectedDeployment: (id: string | null) => void
  logs: LogLine[]
  onNewDeploy: () => void
  onToast: (msg: string) => void
}

export function ConsoleDashboard({
  deployments,
  regions,
  consoleTab,
  setConsoleTab,
  selectedDeployment,
  setSelectedDeployment,
  logs,
  onNewDeploy,
  onToast,
}: ConsoleDashboardProps) {
  const [envVars, setEnvVars] = useState([
    { key: "DATABASE_URL", value: "postgres://****", secret: true },
    { key: "REDIS_URL", value: "redis://****", secret: true },
    { key: "NODE_ENV", value: "production", secret: false },
    { key: "PORT", value: "3000", secret: false },
    { key: "STRIPE_SECRET_KEY", value: "sk_live_****", secret: true },
  ])
  const [newKey, setNewKey] = useState("")
  const [newVal, setNewVal] = useState("")
  const [showSecrets, setShowSecrets] = useState(false)
  const [domains] = useState([
    { domain: "api-gateway.flame.app", type: "system", ssl: "active", added: "2 weeks ago" },
    { domain: "api.flamecore.io", type: "custom", ssl: "active", added: "5 days ago" },
    { domain: "staging.flamecore.io", type: "custom", ssl: "active", added: "3 days ago" },
  ])

  const selected = deployments.find((d) => d.id === selectedDeployment) || deployments[0]

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7">
      {/* Top header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-[#6B6560] font-[500]">acme-org</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-[#4a4540]"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2"/></svg>
            <span className="text-[#E8E6E3] font-[600]">{selected.project}</span>
          </div>
          <span className="mono text-[10px] tracking-[0.12em] uppercase bg-[#27D17F]/10 text-[#27D17F] border border-[#27D17F]/30 px-2 py-0.5 rounded-full font-semibold">production</span>
        </div>
        <button onClick={onNewDeploy} className="rounded-md bg-[#FF4D1F] text-[#050407] px-3.5 h-9 text-[13px] font-[650] hover:bg-[#FF5C2E] transition-colors flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          New deployment
        </button>
      </div>

      {/* Metrics row */}
      <div className="grid gap-3 md:grid-cols-4 mb-7">
        {[
          { k: "Active services", v: deployments.filter(d => d.status === "ready").length.toString(), delta: "+2 this week", icon: "▣" },
          { k: "Requests / 24h", v: "1.4M", delta: "+18.2%", icon: "↗" },
          { k: "Error rate", v: "0.03%", delta: "-0.01%", icon: "✓" },
          { k: "Avg deploy time", v: "47s", delta: "p50 across regions", icon: "◷" },
        ].map((m) => (
          <div key={m.k} className="rounded-xl border border-white/[0.06] bg-[#0a0709]/70 backdrop-blur-xl p-4 relative overflow-hidden group hover:border-white/[0.1] transition-colors">
            <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-[#FF4D1F]/[0.04] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="mono text-[10px] tracking-[0.14em] uppercase text-[#6B6560] font-semibold">{m.k}</div>
                <span className="text-[#FF4D1F] text-[12px]">{m.icon}</span>
              </div>
              <div className="text-[24px] font-[700] tracking-[-0.02em] text-[#E8E6E3] leading-none mb-1.5">{m.v}</div>
              <div className="text-[11px] text-[#27D17F] mono">{m.delta}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] mb-6 overflow-x-auto">
        {[
          ["deployments", "Deployments", deployments.length],
          ["logs", "Logs", null],
          ["env", "Environment", envVars.length],
          ["services", "Services", 3],
          ["domains", "Domains", domains.length],
          ["settings", "Settings", null],
        ].map(([id, label, count]) => (
          <button
            key={id as string}
            onClick={() => setConsoleTab(id)}
            className={`relative px-3.5 h-10 flex items-center gap-2 text-[13px] font-[550] tracking-tight transition-colors whitespace-nowrap ${consoleTab === id ? "text-[#E8E6E3]" : "text-[#6B6560] hover:text-[#A8A29C]"}`}
          >
            {label}
            {count !== null && (
              <span className={`mono text-[10px] px-1.5 py-0.5 rounded ${consoleTab === id ? "bg-[#FF4D1F]/15 text-[#FF4D1F]" : "bg-white/[0.04] text-[#6B6560]"}`}>{count}</span>
            )}
            {consoleTab === id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF4D1F]" />}
          </button>
        ))}
      </div>

      {/* Tab content - (abbreviated in this extraction for length; full content remains in original until full migration) */}
      {consoleTab === "deployments" && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 overflow-hidden">
          {/* ... full table content moved here in next pass ... */}
          <div className="p-6 text-center text-[#6B6560] text-sm">
            Full Deployments table content is being migrated from App.tsx into this feature module.
          </div>
        </div>
      )}

      {/* Other tabs (logs, env, domains, services, settings) will be fully moved in subsequent extractions */}
      {consoleTab !== "deployments" && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-8 text-center">
          <div className="text-[#A8A29C]">This tab is currently being extracted into <span className="mono text-[#FF4D1F]">features/console/</span></div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-10 pt-6 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-3 mono text-[10.5px] tracking-[0.1em] text-[#4a4540]">
        <div>flame core console · v2.4.1 · all actions logged</div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#27D17F] animate-pulse" />
          <span>realtime sync · 12ms</span>
        </div>
      </div>
    </div>
  )
}
