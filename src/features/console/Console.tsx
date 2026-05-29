import { HouseDashboard } from './HouseDashboard'
import { HouseView } from './HouseView'
import { RoomPanel } from './RoomPanel'

interface ConsoleProps {
  authed: boolean
  consoleView: 'dashboard' | 'house' | 'room'
  selectedProject: any
  selectedService: any
  projects: any[]
  isLoadingProjects: boolean
  projectsError: string | null
  onSelectProject: (p: any) => void
  onBuildNew: () => void
  onBackToDashboard: () => void
  onSelectService: (s: any) => void
  onAddService: () => void
  onCloseRoom: () => void
  onToast: (msg: string) => void
  onLogout?: () => void
}

export function Console({
  authed,
  consoleView,
  selectedProject,
  selectedService,
  projects,
  isLoadingProjects,
  projectsError,
  onSelectProject,
  onBuildNew,
  onBackToDashboard,
  onSelectService,
  onAddService,
  onCloseRoom,
  onToast,
  onLogout,
}: ConsoleProps) {
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#A8A29C]">
        Please sign in to access the console.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050407] text-[#E8E6E3]">
      {/* Simple top bar - can be expanded later */}
      <div className="border-b border-white/[0.08] bg-[#0D0B10]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="font-semibold tracking-tight">Flame Core</div>
            <div className="text-[11px] px-2 py-0.5 rounded bg-white/[0.06] text-[#6B6560]">CONSOLE</div>
          </div>
          {onLogout && (
            <button onClick={onLogout} className="text-xs text-[#6B6560] hover:text-[#E8E6E3] transition-colors">
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* Main console content using extracted components */}
      {consoleView === "dashboard" && (
        <HouseDashboard 
          projects={projects}
          isLoadingProjects={isLoadingProjects}
          projectsError={projectsError}
          onSelectProject={onSelectProject} 
          onBuildNew={onBuildNew} 
        />
      )}

      {consoleView === "house" && selectedProject && (
        <HouseView 
          project={selectedProject} 
          onBack={onBackToDashboard} 
          onSelectService={onSelectService} 
          onAddService={onAddService} 
        />
      )}

      {consoleView === "room" && selectedService && (
        <RoomPanel 
          service={selectedService} 
          onClose={onCloseRoom} 
          onToast={onToast} 
        />
      )}
    </div>
  )
}

