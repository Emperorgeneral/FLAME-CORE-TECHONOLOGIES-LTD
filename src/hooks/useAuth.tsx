import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, type SessionUser, type SessionTeam } from '@/api/client'

interface AuthContextType {
  user: SessionUser | null
  teams: SessionTeam[]
  currentTeam: SessionTeam | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: any) => Promise<void>
  logout: () => void
  setCurrentTeam: (team: SessionTeam) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [teams, setTeams] = useState<SessionTeam[]>([])
  const [currentTeam, setCurrentTeam] = useState<SessionTeam | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isAuthenticated = !!user

  // Load user from token on mount
  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('flame_token')
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const data = await api.me()
        setUser(data.user)
        setTeams(data.teams || [])
        
        // Restore last used team or pick first
        const lastTeamId = localStorage.getItem('flame_current_team')
        const team = data.teams?.find((t: SessionTeam) => t.id === lastTeamId) || data.teams?.[0]
        if (team) setCurrentTeam(team)
      } catch (err) {
        // Token invalid or expired
        localStorage.removeItem('flame_token')
        localStorage.removeItem('flame_current_team')
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [])

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password)
    setUser(data.user)
    setTeams(data.teams || [])
    if (data.teams?.[0]) setCurrentTeam(data.teams[0])
  }

  const register = async (data: any) => {
    const res = await api.register(data)
    setUser(res.user)
    // After register we usually only get one team
    const team = { id: res.team_id, slug: '', name: 'Personal', role: 'owner' as const }
    setTeams([team])
    setCurrentTeam(team)
  }

  const logout = () => {
    api.clear()
    setUser(null)
    setTeams([])
    setCurrentTeam(null)
    localStorage.removeItem('flame_current_team')
  }

  const refreshUser = async () => {
    if (!isAuthenticated) return
    const data = await api.me()
    setUser(data.user)
    setTeams(data.teams || [])
  }

  const handleSetCurrentTeam = (team: SessionTeam) => {
    setCurrentTeam(team)
    localStorage.setItem('flame_current_team', team.id)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        teams,
        currentTeam,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
        setCurrentTeam: handleSetCurrentTeam,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
