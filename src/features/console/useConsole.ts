import { useState, useEffect } from 'react'
import { apiClient } from '@/api/client'

export type ConsoleView = 'dashboard' | 'house' | 'room'
export type RoomTab = 'deployments' | 'variables' | 'metrics' | 'settings'
export type NewProjectStep = 'root' | 'github' | 'gitlab' | 'bitbucket' | 'docker' | 'database' | 'template' | 'cli' | 'url' | 'empty'

export function useConsole(teamId?: string, userId?: string) {
  // Navigation state
  const [consoleView, setConsoleView] = useState<ConsoleView>('dashboard')
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [selectedService, setSelectedService] = useState<any>(null)

  // Data loading state
  const [projects, setProjects] = useState<any[]>([])
  const [deployments, setDeployments] = useState<any[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [isLoadingDeployments, setIsLoadingDeployments] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [deploymentsError, setDeploymentsError] = useState<string | null>(null)

  // Room panel state
  const [roomTab, setRoomTab] = useState<RoomTab>('deployments')
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    source: true,
    network: true,
    proxy: false,
    commands: false,
    health: false,
    lifecycle: false,
    danger: false,
  })
  const [roomSettings, setRoomSettings] = useState({
    sourceRepo: 'https://github.com/flamecore/api-gateway',
    networkMode: 'private',
    networkAlias: 'api-gateway',
    httpProxyEnabled: true,
    httpProxyPath: '/',
    httpProxyTargetPort: '3000',
    httpsProxyEnabled: true,
    preDeployCommand: 'npm ci && npm run db:migrate',
    startCommand: 'npm start',
    healthCheckPath: '/health',
    cronSchedule: '',
    restartPolicy: 'unless-stopped',
    restartRetries: '3',
    replicas: '1',
  })

  // Deploy modal state
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [deployRepo, setDeployRepo] = useState('')
  const [deployRegion, setDeployRegion] = useState('los1')
  const [deployFramework, setDeployFramework] = useState('auto')
  
  // New project wizard state
  const [newProjectStep, setNewProjectStep] = useState<NewProjectStep>('root')
  const [newProjectSearch, setNewProjectSearch] = useState('')
  const [selectedDb, setSelectedDb] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [selectedDockerImage, setSelectedDockerImage] = useState('')

  // Data loading functions
  const loadProjects = async () => {
    if (!teamId) return
    setIsLoadingProjects(true)
    setProjectsError(null)
    try {
      const data = await apiClient.projects(teamId)
      setProjects(Array.isArray(data) ? data : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects'
      setProjectsError(message)
      console.error('Failed to load projects:', err)
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const loadDeployments = async () => {
    if (!teamId || !selectedProject?.id) return
    setIsLoadingDeployments(true)
    setDeploymentsError(null)
    try {
      const data = await apiClient.deployments(teamId, selectedProject.id)
      setDeployments(Array.isArray(data) ? data : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load deployments'
      setDeploymentsError(message)
      console.error('Failed to load deployments:', err)
    } finally {
      setIsLoadingDeployments(false)
    }
  }

  // Load projects on mount and when teamId changes
  useEffect(() => {
    loadProjects()
  }, [teamId])

  // Load deployments when selectedProject changes
  useEffect(() => {
    loadDeployments()
  }, [teamId, selectedProject?.id])

  // Navigation handlers
  const selectProject = (p: any) => {
    setSelectedProject(p)
    setConsoleView('house')
  }

  const backToDashboard = () => {
    setConsoleView('dashboard')
    setSelectedProject(null)
  }

  const selectService = (s: any) => {
    setSelectedService(s)
    setConsoleView('room')
  }

  const closeRoom = () => {
    setConsoleView('house')
    setSelectedService(null)
  }

  // Section expansion handler
  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Deploy modal handlers
  const openDeployModal = () => setShowDeployModal(true)
  const closeDeployModal = () => setShowDeployModal(false)

  // New project wizard handlers
  const nextProjectStep = () => {
    const steps: NewProjectStep[] = ['root', 'github', 'gitlab', 'bitbucket', 'docker', 'database', 'template', 'cli', 'url', 'empty']
    const currentIdx = steps.indexOf(newProjectStep)
    if (currentIdx < steps.length - 1) {
      setNewProjectStep(steps[currentIdx + 1])
    }
  }

  const prevProjectStep = () => {
    const steps: NewProjectStep[] = ['root', 'github', 'gitlab', 'bitbucket', 'docker', 'database', 'template', 'cli', 'url', 'empty']
    const currentIdx = steps.indexOf(newProjectStep)
    if (currentIdx > 0) {
      setNewProjectStep(steps[currentIdx - 1])
    }
  }

  const resetProjectWizard = () => {
    setNewProjectStep('root')
    setNewProjectSearch('')
    setSelectedDb(null)
    setSelectedTemplate(null)
    setSelectedDockerImage('')
  }

  return {
    // Data
    projects,
    deployments,
    isLoadingProjects,
    isLoadingDeployments,
    projectsError,
    deploymentsError,
    loadProjects,
    loadDeployments,

    // Navigation
    consoleView,
    setConsoleView,
    selectedProject,
    selectedService,
    selectProject,
    backToDashboard,
    selectService,
    closeRoom,

    // Room panel
    roomTab,
    setRoomTab,
    expandedSections,
    toggleSection,
    roomSettings,
    setRoomSettings,

    // Deploy modal
    showDeployModal,
    openDeployModal,
    closeDeployModal,
    deployRepo,
    setDeployRepo,
    deployRegion,
    setDeployRegion,
    deployFramework,
    setDeployFramework,

    // New project wizard
    newProjectStep,
    setNewProjectStep,
    newProjectSearch,
    setNewProjectSearch,
    selectedDb,
    setSelectedDb,
    selectedTemplate,
    setSelectedTemplate,
    selectedDockerImage,
    setSelectedDockerImage,
    nextProjectStep,
    prevProjectStep,
    resetProjectWizard,
  }
}
