import { useState } from 'react'
import { StatusBadge } from './ConsoleDashboard'

interface RoomPanelProps {
  service: any
  onClose: () => void
  onToast: (msg: string) => void
}

export function RoomPanel({ service, onClose, onToast }: RoomPanelProps) {
  const [roomTab, setRoomTab] = useState<'deployments' | 'variables' | 'metrics' | 'settings'>('deployments')

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-2xl h-full bg-[#0D0B10] border-l border-white/[0.08] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel Header */}
        <div className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0D0B10]/95 backdrop-blur-xl px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-white/[0.04] border border-white/[0.08] grid place-items-center text-xl">{service.icon}</div>
              <div>
                <h1 className="text-xl font-bold text-[#E8E6E3]">{service.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={service.status} />
                  <span className="text-[11px] text-[#6B6560]">US West</span>
                  <span className="text-[11px] text-[#6B6560]">·</span>
                  <span className="text-[11px] text-[#6B6560]">1 Replica</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-lg border border-white/[0.08] grid place-items-center text-[#6B6560] hover:text-[#E8E6E3] hover:border-white/[0.16] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Panel Tabs */}
        <div className="flex gap-1 border-b border-white/[0.06] px-6 py-3">
          {[
            ["deployments", "Deployments"], 
            ["variables", "Variables"], 
            ["metrics", "Metrics"], 
            ["settings", "Settings"]
          ].map(([id, label]) => (
            <button 
              key={id} 
              onClick={() => setRoomTab(id as any)}
              className={`relative px-4 h-9 text-[13px] font-[550] tracking-tight transition-colors ${roomTab === id ? "text-[#8B7FFF]" : "text-[#6B6560] hover:text-[#A8A29C]"}`}
            >
              {label}
              {roomTab === id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#8B7FFF]" />}
            </button>
          ))}
        </div>

        {/* Panel Content */}
        <div className="p-6 space-y-6">
          {roomTab === "deployments" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-[#0A080C] p-4 text-center">
                <p className="text-[13px] text-[#A8A29C] mb-2">There is no active deployment for this service.</p>
                <button onClick={() => onToast("DEPLOY · deployment triggered")} className="text-[12px] text-[#8B7FFF] hover:underline">Make a deployment to get started →</button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-[600] text-[#E8E6E3]">History</h3>
                  <button className="text-[11px] text-[#6B6560] hover:text-[#A8A29C]">Hide Skipped</button>
                </div>
                <div className="space-y-2">
                  {[
                    { status: "removed", commit: "perf: reduce baseline memory footprint - Lazy-load redis-py", time: "last month", source: "via GitHub" },
                    { status: "removed", commit: "perf: reduce baseline memory footprint - Lazy-load redis-py", time: "2 months ago", source: "via GitHub" },
                    { status: "success", commit: "feat: add user authentication flow", time: "3 months ago", source: "via GitHub" },
                  ].map((dep, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.06] bg-[#0A080C] hover:border-white/[0.1] transition-colors">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${dep.status === 'removed' ? 'bg-[#6B6560]/20 text-[#6B6560]' : 'bg-[#27D17F]/20 text-[#27D17F]'}`}>
                        {dep.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[#E8E6E3] truncate">{dep.commit}</p>
                        <p className="text-[11px] text-[#6B6560]">{dep.time} {dep.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {roomTab === "variables" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-[13px] font-[600] text-[#E8E6E3]">Variables</h3>
                <button onClick={() => onToast("ADD VARIABLE · modal opened")} className="h-8 px-3 rounded-lg bg-[#8B7FFF]/10 text-[#8B7FFF] text-[11px] font-bold hover:bg-[#8B7FFF]/20 transition-colors">+ New Variable</button>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#0A080C] overflow-hidden">
                {[
                  { key: "NODE_ENV", value: "production", sealed: false },
                  { key: "DATABASE_URL", value: "postgresql://••••••••@primary-db:5432/app", sealed: true },
                ].map((env) => (
                  <div key={env.key} className="flex items-center justify-between p-4 border-b border-white/[0.06] last:border-0">
                    <div className="mono text-[12px] text-[#E8E6E3] font-[600]">{env.key}</div>
                    <div className="flex items-center gap-3">
                      <span className="mono text-[11px] text-[#6B6560]">{env.value}</span>
                      {env.sealed && <span className="text-[9px] uppercase tracking-wider text-[#FFBD2E] bg-[#FFBD2E]/10 px-1.5 py-0.5 rounded border border-[#FFBD2E]/20">Sealed</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {roomTab === "metrics" && (
            <div className="space-y-4">
              <h3 className="text-[13px] font-[600] text-[#E8E6E3]">Service Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "CPU Usage", value: "12%", trend: "+2%" },
                  { label: "Memory", value: "186 MB", trend: "+12 MB" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-white/[0.06] bg-[#0A080C] p-4">
                    <div className="mono text-[10px] tracking-[0.14em] uppercase text-[#6B6560] font-semibold mb-2">{m.label}</div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-[20px] font-[700] tracking-tight text-[#E8E6E3]">{m.value}</div>
                      <div className="text-[10px] text-[#27D17F]">{m.trend}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {roomTab === "settings" && (
            <div className="text-[#A8A29C] text-sm">
              Service settings panel content will be extracted in a future pass.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
