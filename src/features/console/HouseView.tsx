import type { Service } from './types'

interface HouseViewProps {
  project: any
  onBack: () => void
  onSelectService: (service: any) => void
  onAddService: () => void
}

export function HouseView({ project, onBack, onSelectService, onAddService }: HouseViewProps) {
  // Mock services for the house canvas (will become real data)
  const services = [
    { id: "s1", name: "primary-db", type: "postgres", icon: "🐘", status: "offline", volume: "postgres-2026-04-13" },
    { id: "s2", name: "cache-layer", type: "redis", icon: "🟥", status: "offline", volume: "redis-volume" },
    { id: "s3", name: "web", type: "git_repo", icon: "⚡", status: "offline", volume: null },
    { id: "s4", name: "worker", type: "git_repo", icon: "⚡", status: "offline", volume: null },
    { id: "s5", name: "FLAME OFFICIAL SUPPO...", type: "git_repo", icon: "⌨️", status: "offline", volume: null },
  ]

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Project Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="h-9 w-9 rounded-lg border border-white/[0.08] grid place-items-center text-[#6B6560] hover:text-[#E8E6E3] hover:border-white/[0.16] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#E8E6E3] tracking-tight">{project.name}</h1>
              <span className="text-[11px] mono text-[#27D17F] bg-[#27D17F]/10 px-2 py-0.5 rounded border border-[#27D17F]/20">production</span>
            </div>
            <p className="text-[#6B6560] text-sm mono mt-0.5">{project.description || 'Project workspace'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="h-9 px-3 rounded-lg border border-white/[0.08] text-[12px] text-[#A8A29C] hover:text-[#E8E6E3] transition-colors">US West</button>
          <button onClick={onAddService} className="h-9 px-4 rounded-lg bg-[#8B7FFF] text-[#050407] text-[12px] font-bold hover:bg-[#9C8CFF] transition-colors flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            Add Service
          </button>
        </div>
      </div>

      {/* Service Canvas Grid */}
      <div className="relative min-h-[500px] border border-white/[0.06] rounded-2xl bg-[#0A080C] p-8">
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(circle, #8B7FFF 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        
        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((svc) => (
            <div 
              key={svc.id} 
              onClick={() => onSelectService(svc)}
              className="relative border border-white/[0.08] bg-[#0D0B10] rounded-xl p-5 hover:border-[#8B7FFF]/40 hover:bg-[#8B7FFF]/[0.03] cursor-pointer transition-all group min-h-[160px]"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white/[0.04] border border-white/[0.08] grid place-items-center text-xl">{svc.icon}</div>
                  <div>
                    <h3 className="font-bold text-[15px] text-[#E8E6E3]">{svc.name}</h3>
                    <p className="text-[11px] text-[#6B6560]">Service is {svc.status}</p>
                  </div>
                </div>
              </div>
              
              {svc.volume && (
                <div className="flex items-center gap-2 text-[11px] text-[#6B6560] mono bg-white/[0.02] rounded px-2 py-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 6V5a2 2 0 012-2h6a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5"/></svg>
                  {svc.volume}
                </div>
              )}
              
              <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="h-7 w-7 rounded-md bg-white/[0.04] border border-white/[0.08] grid place-items-center text-[#6B6560] hover:text-[#E8E6E3]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth="1.5"/><path d="M9 9h6v6H9z" fill="currentColor"/></svg>
                </button>
                <button className="h-7 w-7 rounded-md bg-white/[0.04] border border-white/[0.08] grid place-items-center text-[#6B6560] hover:text-[#E8E6E3]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
          ))}
          
          <button onClick={onAddService} 
                  className="border border-dashed border-white/[0.1] bg-white/[0.01] rounded-xl flex flex-col items-center justify-center text-[#6B6560] hover:text-[#8B7FFF] hover:border-[#8B7FFF]/40 hover:bg-[#8B7FFF]/[0.02] transition-all min-h-[160px]">
            <div className="h-12 w-12 rounded-full bg-white/[0.04] border border-white/[0.08] grid place-items-center mb-3 text-xl">+</div>
            <div className="font-bold text-[13px]">Add Service</div>
          </button>
        </div>
      </div>
    </div>
  )
}
