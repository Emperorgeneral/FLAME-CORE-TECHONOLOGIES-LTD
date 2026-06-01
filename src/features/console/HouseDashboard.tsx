import { StatusBadge } from './ConsoleDashboard'
import type { Project } from './types'

interface HouseDashboardProps {
  projects: any[]
  isLoadingProjects: boolean
  projectsError: string | null
  onSelectProject: (project: any) => void
  onBuildNew: () => void
}

// Extracted "Your Houses" / Projects Dashboard view
export function HouseDashboard({ 
  projects, 
  isLoadingProjects, 
  projectsError,
  onSelectProject, 
  onBuildNew 
}: HouseDashboardProps) {
  // Use only real projects from the API - no demo fallback
  const displayProjects = projects

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-[#E8E6E3] tracking-tight">Your Houses</h1>
          <p className="text-[#6B6560] mt-1">Manage your projects and deployments</p>
        </div>
        <button onClick={onBuildNew} className="h-11 px-5 rounded-xl bg-[#FF4D1F] text-[#050407] font-bold text-[14px] hover:bg-[#FF5C2E] transition-colors flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          Build New House
        </button>
      </div>

      {isLoadingProjects && (
        <div className="text-center text-[#6B6560] py-10">
          <div className="animate-spin inline-block w-5 h-5 border-2 border-[#FF4D1F] border-t-transparent rounded-full mr-2"></div>
          Loading projects...
        </div>
      )}

      {projectsError && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6 text-red-400 text-sm">
          Failed to load projects: {projectsError}
        </div>
      )}

      {!isLoadingProjects && displayProjects.length === 0 ? (
        <div className="border border-white/[0.08] bg-[#0a0709]/50 rounded-2xl p-12 text-center">
          <div className="text-[#6B6560] mb-4">📭</div>
          <h3 className="text-[#E8E6E3] font-semibold mb-2">No deployments yet</h3>
          <p className="text-[#6B6560] text-[14px] mb-6">Create your first deployment to get started</p>
          <button onClick={onBuildNew} className="inline-block h-10 px-5 rounded-lg bg-[#FF4D1F] text-[#050407] font-bold text-[13px] hover:bg-[#FF5C2E] transition-colors">
            Deploy Now →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayProjects.map((p) => (
            <div 
              key={p.id} 
              onClick={() => onSelectProject(p)} 
              className="border border-white/[0.08] bg-[#0a0709] p-6 rounded-2xl hover:border-[#FF4D1F]/40 hover:bg-[#FF4D1F]/[0.02] cursor-pointer transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-12 w-12 rounded-xl bg-[#FF4D1F]/10 border border-[#FF4D1F]/20 grid place-items-center text-2xl group-hover:scale-110 transition-transform">🏠</div>
                <StatusBadge status={p.status} />
              </div>
              <h3 className="font-bold text-[18px] text-[#E8E6E3] group-hover:text-[#FF4D1F] transition-colors">{p.name}</h3>
              <div className="flex items-center gap-3 mt-2 text-[12px] text-[#6B6560] mono">
                <span>{p.services || p.deployment_count || 0} Rooms</span>
                <span>·</span>
                <span>{p.updated || "recently"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
