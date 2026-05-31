import { useState, useEffect, useRef } from "react"
import { Toast } from "@/components/ui"
import { Console } from "@/features/console/Console"
import { ConsoleDashboard, StatusBadge } from "@/features/console/ConsoleDashboard"
import { HouseDashboard } from "@/features/console/HouseDashboard"
import { HouseView } from "@/features/console/HouseView"
import { RoomPanel } from "@/features/console/RoomPanel"
import { useConsole } from "@/features/console/useConsole"

type Region = {
  code: string
  city: string
  country: string
  flag: string
  status: "live" | "soon" | "planned"
  latency: number
  pop: string
}

type Currency = {
  code: "NGN" | "USD" | "GBP" | "EUR"
  symbol: string
  rate: number // relative to USD
  locale: string
}

type Plan = {
  id: string
  name: string
  tagline: string
  priceUSD: number // base price in USD
  cpu: string
  ram: string
  storage: string
  bandwidth: string
  builds: string
  projects: number
  popular?: boolean
  features: string[]
}

type DeployStatus = "queued" | "cloning" | "installing" | "building" | "provisioning" | "starting" | "healthy" | "ready" | "failed" | "sleeping" | "stopped" | "cancelled" | "rollback" | "redeploying"

type Deployment = {
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

type LogLine = {
  t: string
  level: "info" | "warn" | "error" | "ok"
  msg: string
}

export default function App() {
  const [view, setView] = useState<"public" | "console" | "admin">("public")
  const [mobileMenu, setMobileMenu] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authMode, setAuthMode] = useState<"signin" | "register">("signin")
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [registerData, setRegisterData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    phone: "",
    country: "Nigeria",
    teamName: "",
    role: "Founder",
    password: "",
    confirmPassword: "",
  })
  const [currency, setCurrency] = useState<Currency["code"]>("USD")
  const [billing, setBilling] = useState<"month" | "year">("month")
  const [teamId, setTeamId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  
  // Console state management via dedicated hook
  const consoleState = useConsole(teamId || undefined, userId || undefined)
  
  const [toast, setToast] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 })
  const [heroVisible, setHeroVisible] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const [adminTab, setAdminTab] = useState<"overview" | "deployments" | "users" | "domains" | "billing" | "security" | "storage" | "settings">("overview")

  const currencies: Currency[] = [
    { code: "USD", symbol: "$", rate: 1, locale: "en-US" },
    { code: "NGN", symbol: "₦", rate: 1600, locale: "en-NG" },
    { code: "GBP", symbol: "£", rate: 0.79, locale: "en-GB" },
    { code: "EUR", symbol: "€", rate: 0.92, locale: "de-DE" },
  ]

  const regions: Region[] = [
    { code: "los1", city: "Lagos", country: "Nigeria", flag: "🇳🇬", status: "live", latency: 12, pop: "AFR-W-01" },
    { code: "lhr1", city: "London", country: "United Kingdom", flag: "🇬🇧", status: "soon", latency: 87, pop: "EUR-W-01" },
    { code: "fra1", city: "Frankfurt", country: "Germany", flag: "🇩🇪", status: "soon", latency: 94, pop: "EUR-C-01" },
    { code: "nyc1", city: "New York", country: "United States", flag: "🇺🇸", status: "planned", latency: 142, pop: "AMER-E-01" },
    { code: "sin1", city: "Singapore", country: "Singapore", flag: "🇸🇬", status: "planned", latency: 198, pop: "APAC-S-01" },
  ]

  const plans: Plan[] = [
    {
      id: "hobby",
      name: "HOBBY",
      tagline: "For side projects and learning",
      priceUSD: 0,
      cpu: "0.5 vCPU shared",
      ram: "512 MB",
      storage: "1 GB SSD",
      bandwidth: "100 GB",
      builds: "100 min/mo",
      projects: 3,
      features: [
        "Deploy from GitHub",
        "Auto-SSL on *.flame.app",
        "Community support",
        "Sleeps after 30min idle",
        "1 region (Lagos)",
      ],
    },
    {
      id: "starter",
      name: "STARTER",
      tagline: "Indie devs & MVPs",
      priceUSD: 8,
      cpu: "1 vCPU",
      ram: "1 GB",
      storage: "10 GB SSD",
      bandwidth: "500 GB",
      builds: "500 min/mo",
      projects: 10,
      features: [
        "Custom domains + SSL",
        "Always on (no sleep)",
        "Environment secrets",
        "Build cache",
        "Email support",
      ],
    },
    {
      id: "pro",
      name: "PRO",
      tagline: "Production-grade apps",
      priceUSD: 25,
      cpu: "2 vCPU dedicated",
      ram: "4 GB",
      storage: "50 GB SSD",
      bandwidth: "2 TB",
      builds: "Unlimited",
      projects: 50,
      popular: true,
      features: [
        "Multi-region deploy",
        "Zero-downtime deploys",
        "Preview environments",
        "Webhook autodeploy",
        "Priority support",
        "Usage analytics",
      ],
    },
    {
      id: "scale",
      name: "SCALE",
      tagline: "Teams & high-traffic",
      priceUSD: 89,
      cpu: "4 vCPU dedicated",
      ram: "16 GB",
      storage: "200 GB SSD",
      bandwidth: "10 TB",
      builds: "Unlimited",
      projects: 999,
      features: [
        "Horizontal autoscaling",
        "Private networking",
        "Team RBAC",
        "Audit logs",
        "99.95% uptime SLA",
        "Dedicated engineer",
        "DDoS protection",
      ],
    },
  ]

  const deployments: Deployment[] = [
    {
      id: "dpl_8f2a91",
      project: "api-gateway",
      repo: "flamecore/api-gateway",
      branch: "main",
      framework: "Node.js",
      region: "los1",
      status: "healthy",
      commit: "a4f8c2e",
      commitMsg: "fix: handle webhook retries with exponential backoff",
      duration: "42s",
      deployedAt: "2m ago",
      url: "api-gateway.flame.app",
      health: "healthy",
      cpuPct: 12,
      ramMB: 186,
      restarts: 0,
    },
    {
      id: "dpl_7d1b40",
      project: "payments-svc",
      repo: "flamecore/payments-svc",
      branch: "main",
      framework: "Docker",
      region: "los1",
      status: "building",
      commit: "92b1f0d",
      commitMsg: "feat: add Stripe Connect for multi-currency payouts",
      duration: "—",
      deployedAt: "now",
      url: "payments.flame.app",
      health: "unknown",
    },
    {
      id: "dpl_6c0a12",
      project: "dashboard-web",
      repo: "flamecore/dashboard-web",
      branch: "main",
      framework: "Next.js",
      region: "los1",
      status: "ready",
      commit: "1de7a39",
      commitMsg: "ui: dark mode polish + region selector",
      duration: "1m 18s",
      deployedAt: "1h ago",
      url: "dashboard.flame.app",
      health: "healthy",
      cpuPct: 8,
      ramMB: 312,
      restarts: 0,
    },
    {
      id: "dpl_5b9f81",
      project: "telegram-bot",
      repo: "flamecore/notify-bot",
      branch: "main",
      framework: "Python",
      region: "los1",
      status: "sleeping",
      commit: "8c3e221",
      commitMsg: "chore: bump aiogram to 3.13",
      duration: "55s",
      deployedAt: "4h ago",
      url: "bot.flame.app",
      health: "unknown",
      cpuPct: 0,
      ramMB: 0,
    },
    {
      id: "dpl_4a8e72",
      project: "marketing-site",
      repo: "flamecore/marketing",
      branch: "preview/landing-v3",
      framework: "Astro",
      region: "los1",
      status: "failed",
      commit: "ff219a0",
      commitMsg: "wip: redesign hero section",
      duration: "12s",
      deployedAt: "6h ago",
      url: "—",
      health: "unhealthy",
    },
  ]

  const [logs, setLogs] = useState<LogLine[]>([
    { t: "14:22:01", level: "info", msg: "→ cloning github.com/flamecore/payments-svc#main" },
    { t: "14:22:03", level: "ok", msg: "✓ repository cloned (1.2 MB)" },
    { t: "14:22:03", level: "info", msg: "→ detecting build system" },
    { t: "14:22:04", level: "ok", msg: "✓ detected Dockerfile (custom build)" },
    { t: "14:22:05", level: "info", msg: "→ building image flame-dpl_7d1b40:latest" },
    { t: "14:22:08", level: "info", msg: "  step 1/9 : FROM node:20-alpine" },
    { t: "14:22:11", level: "info", msg: "  step 2/9 : WORKDIR /app" },
    { t: "14:22:11", level: "info", msg: "  step 3/9 : COPY package*.json ./" },
    { t: "14:22:12", level: "info", msg: "  step 4/9 : RUN npm ci --omit=dev" },
    { t: "14:22:34", level: "ok", msg: "  ✓ installed 248 packages in 22s" },
    { t: "14:22:35", level: "info", msg: "  step 5/9 : COPY . ." },
    { t: "14:22:36", level: "info", msg: "  step 6/9 : RUN npm run build" },
    { t: "14:22:48", level: "warn", msg: "  ⚠ deprecation: subdependency 'inflight' is deprecated" },
    { t: "14:22:51", level: "ok", msg: "  ✓ build complete (bundle 412 KB)" },
    { t: "14:22:52", level: "info", msg: "→ pushing to internal registry" },
    { t: "14:22:55", level: "info", msg: "→ provisioning container in lagos (los1)" },
  ])
  void logs

  useEffect(() => {
    const stored = localStorage.getItem("flamecore_session")
    if (stored === "active") setAuthed(true)
    const storedCurrency = localStorage.getItem("flamecore_currency") as Currency["code"] | null
    if (storedCurrency) setCurrency(storedCurrency)
    const storedTeamId = localStorage.getItem("flamecore_team")
    if (storedTeamId) setTeamId(storedTeamId)

    // Handle OAuth callback: /auth/callback?token=...&team=...
    const params = new URLSearchParams(window.location.search)
    const oauthToken = params.get("token")
    const oauthError = params.get("error")
    if (oauthToken) {
      localStorage.setItem("flame_token", oauthToken)
      localStorage.setItem("flamecore_session", "active")
      if (params.get("team")) {
        const team = params.get("team")!
        localStorage.setItem("flamecore_team", team)
        setTeamId(team)
      }
      setAuthed(true)
      setView("console")
      setToast("AUTHENTICATED · signed in via OAuth")
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname)
    } else if (oauthError) {
      const errors: Record<string, string> = {
        invalid_state: "OAuth session expired — please try again",
        token_exchange: "Failed to verify with provider — please retry",
        no_email: "No email found on your account — please use email signup",
        server_error: "Something went wrong — please try again",
      }
      setToast(`ERROR · ${errors[oauthError] || oauthError}`)
      setView("console")
      window.history.replaceState({}, "", window.location.pathname)
    }

    setTimeout(() => setHeroVisible(true), 50)
  }, [])

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect()
        setMousePos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        })
      }
    }
    window.addEventListener("mousemove", handleMouse)
    return () => window.removeEventListener("mousemove", handleMouse)
  }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3500)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Simulated live log streaming when a deployment is selected & building
  // useEffect(() => {
  //   if (consoleTab !== "logs") return
  //   const dep = deployments.find((d) => d.id === selectedDeployment)
  //   if (!dep || dep.status !== "building") return
  //   const interval = setInterval(() => {
  //     const samples: LogLine[] = [
  //       { t: new Date().toLocaleTimeString("en-GB"), level: "info", msg: "  health check: GET / → 200 OK (8ms)" },
  //       { t: new Date().toLocaleTimeString("en-GB"), level: "info", msg: "  routing traffic to new revision (canary 25%)" },
  //       { t: new Date().toLocaleTimeString("en-GB"), level: "ok", msg: "  ✓ container healthy in 1.4s" },
  //     ]
  //     setLogs((l) => [...l.slice(-30), samples[Math.floor(Math.random() * samples.length)]])
  //   }, 2400)
  //   return () => clearInterval(interval)
  // }, [consoleTab, selectedDeployment])

  const activeCurrency = currencies.find((c) => c.code === currency)!

  const formatPrice = (priceUSD: number) => {
    if (priceUSD === 0) return "Free"
    const price = priceUSD * activeCurrency.rate * (billing === "year" ? 10 : 1)
    return new Intl.NumberFormat(activeCurrency.locale, {
      style: "currency",
      currency: activeCurrency.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (loginEmail && loginPassword.length >= 4) {
      setAuthed(true)
      setIsAdmin(loginEmail.includes("admin"))
      localStorage.setItem("flamecore_session", "active")
      setToast("AUTHENTICATED · welcome back, operator")
      setLoginEmail("")
      setLoginPassword("")
    } else {
      setToast("ERROR · invalid credentials")
    }
  }

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault()
    const fullName = `${registerData.firstName} ${registerData.lastName}`.trim()

    if (!registerData.firstName || !registerData.lastName || !registerData.email || !registerData.company || !registerData.teamName) {
      setToast("ERROR · complete all required registration fields")
      return
    }

    if (registerData.password.length < 8) {
      setToast("ERROR · password must be at least 8 characters")
      return
    }

    if (registerData.password !== registerData.confirmPassword) {
      setToast("ERROR · passwords do not match")
      return
    }

    setAuthed(true)
    setIsAdmin(registerData.email.includes("admin"))
    localStorage.setItem("flamecore_session", "active")
    localStorage.setItem("flamecore_profile", JSON.stringify({
      name: fullName,
      email: registerData.email,
      company: registerData.company,
      team: registerData.teamName,
      role: registerData.role,
      country: registerData.country,
    }))
    setToast(`ACCOUNT CREATED · welcome ${registerData.firstName}`)
    setRegisterData({
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      phone: "",
      country: "Nigeria",
      teamName: "",
      role: "Founder",
      password: "",
      confirmPassword: "",
    })
    setAuthMode("signin")
    setView("console")
  }

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault()
    if (!deployRepo) return
    const id = `dpl_${Math.random().toString(36).slice(2, 8)}`
    const region = regions.find((r) => r.code === deployRegion)!
    setToast(`DEPLOYING · ${id} → ${region.city.toLowerCase()}`)
    setShowDeployModal(false)
    setDeployRepo("")
    setSelectedDeployment(id)
    // setConsoleTab("logs")
  }

  return (
    <div className="min-h-screen bg-[#050407] text-[#E8E6E3] selection:bg-[#FF4D1F]/30 selection:text-[#FF4D1F]">
      <style>{`
        * { font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace !important; font-feature-settings: 'ss01', 'cv01'; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1a1518; border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: #FF4D1F; }
        @keyframes scan { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2.4); opacity: 0; } }
        @keyframes typing { from { width: 0 } to { width: 100% } }
        @keyframes gradient-shift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        .gradient-text { background: linear-gradient(110deg, #FF4D1F 0%, #FF8A4D 35%, #FFD06B 50%, #FF8A4D 65%, #FF4D1F 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: gradient-shift 6s ease infinite; }
        .grid-bg { background-image: linear-gradient(rgba(255,77,31,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,77,31,0.07) 1px, transparent 1px); background-size: 56px 56px; }
        .noise { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E"); }
      `}</style>

      {/* Ambient background */}
      <div className="fixed inset-0 -z-50 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_900px_500px_at_50%_-100px,rgba(255,77,31,0.22),transparent)]" />
        <div className="absolute inset-0 grid-bg opacity-[0.5]" />
        <div className="absolute inset-0 noise opacity-[0.025] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(255,77,31,0.06),transparent_70%)] blur-3xl" />
      </div>

      {/* Status bar */}
      <div className="sticky top-0 z-50 border-b border-white/[0.05] bg-[#050407]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-7 max-w-[1440px] items-center justify-between px-5 mono text-[10px] tracking-[0.08em] uppercase">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-[#27D17F] animate-ping opacity-60" />
                <span className="relative rounded-full h-1.5 w-1.5 bg-[#27D17F]" />
              </span>
              <span className="text-[#27D17F] font-medium">All systems operational</span>
            </div>
            <div className="hidden md:flex items-center gap-3 text-[#6B6560]">
              <span>1 region live · 4 expanding</span>
              <span className="text-[#FF4D1F]">·</span>
              <span>v2.4.1</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[#6B6560]">
              <span>{new Date().toUTCString().slice(17, 22)} UTC</span>
            </div>
            <select
              value={currency}
              onChange={(e) => { setCurrency(e.target.value as Currency["code"]); localStorage.setItem("flamecore_currency", e.target.value) }}
              className="bg-transparent border border-white/[0.08] rounded-md px-1.5 py-0.5 mono text-[10px] text-[#E8E6E3] hover:border-[#FF4D1F]/40 transition-colors cursor-pointer focus:outline-none focus:border-[#FF4D1F]"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code} className="bg-[#0a0709]">{c.code}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              {isAdmin && (
                <button
                  onClick={() => setView(view === "admin" ? "console" : "admin")}
                  className="flex items-center gap-1 rounded-md border border-[#FFBD2E]/30 bg-[#FFBD2E]/[0.08] px-2 py-0.5 text-[10px] font-medium text-[#FFBD2E] hover:bg-[#FFBD2E]/15 transition-colors"
                >
                  {view === "admin" ? "← console" : "ops"}
                </button>
              )}
              <button
                onClick={() => setView(view === "public" ? "console" : "public")}
                className="flex items-center gap-1.5 rounded-md border border-[#FF4D1F]/30 bg-[#FF4D1F]/[0.08] px-2 py-0.5 text-[10px] font-medium text-[#FF4D1F] hover:bg-[#FF4D1F]/15 transition-colors"
              >
                <span className="h-1 w-1 rounded-full bg-[#FF4D1F]" />
                {view === "public" ? "→ console" : "← website"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <header className="sticky top-7 z-40 border-b border-white/[0.05] bg-[#050407]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 h-[64px]">
          <div className="flex items-center gap-9">
            <button onClick={() => setView("public")} className="group flex items-center gap-2.5">
              <div className="relative">
                <div className="absolute -inset-1 rounded-lg bg-[#FF4D1F] blur-md opacity-50 group-hover:opacity-80 transition-opacity" />
                <div className="relative h-9 w-9 rounded-lg bg-[#0a0709] border border-[#FF4D1F]/40 grid place-items-center overflow-hidden">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C12 2 7 7 7 12C7 14.5 8.5 16 10 16C10 14 11 13 12 13C13 13 14 14 14 16C15.5 16 17 14.5 17 12C17 7 12 2 12 2Z" fill="#FF4D1F"/>
                    <path d="M12 22C15 22 17 20 17 17.5C17 16 16 15 14.5 14.5C14 16 13 17 12 17C11 17 10 16 9.5 14.5C8 15 7 16 7 17.5C7 20 9 22 12 22Z" fill="#FF8A4D"/>
                  </svg>
                </div>
              </div>
              <div className="leading-none">
                <div className="flex items-baseline gap-[5px]">
                  <span className="text-[19px] font-bold tracking-[-0.02em] text-[#E8E6E3]">flame</span>
                  <span className="text-[19px] font-bold tracking-[-0.02em] text-[#FF4D1F]">core</span>
                </div>
                <div className="mono text-[8.5px] tracking-[0.22em] text-[#6B6560] mt-0.5 font-medium">CLOUD INFRASTRUCTURE</div>
              </div>
            </button>

            {view === "public" && (
              <nav className="hidden lg:flex items-center gap-0.5">
                {[
                  ["Platform", "#platform"],
                  ["Pricing", "#pricing"],
                  ["Regions", "#regions"],
                  ["Docs", "#"],
                  ["Changelog", "#"],
                ].map(([label, href]) => (
                  <a key={label} href={href} className="px-3 h-8 flex items-center text-[13px] font-medium tracking-tight text-[#A8A29C] hover:text-[#E8E6E3] transition-colors">
                    {label}
                  </a>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {view === "public" ? (
              <>
                <button onClick={() => { setView("console"); }} className="hidden md:flex items-center gap-1.5 px-3 h-9 text-[13px] font-medium text-[#A8A29C] hover:text-[#E8E6E3] transition-colors">
                  Sign in
                </button>
                <button
                  onClick={() => { setView("console") }}
                  className="group relative overflow-hidden rounded-md bg-[#FF4D1F] px-3.5 h-9 flex items-center gap-1.5 hover:bg-[#FF5C2E] transition-colors"
                >
                  <span className="text-[13px] font-semibold tracking-tight text-[#050407]">Start deploying</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 5l7 7-7 7" stroke="#050407" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            ) : authed ? (
              <div className="flex items-center gap-2">
                <button className="hidden md:flex h-9 w-9 rounded-md border border-white/[0.08] items-center justify-center hover:border-white/15 text-[#A8A29C] hover:text-[#E8E6E3] transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
                <div className="hidden sm:flex items-center gap-2 px-2.5 h-9 rounded-md border border-white/[0.08]">
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-[#FF4D1F] to-[#FF8A4D] grid place-items-center text-[10px] font-bold text-[#050407]">OP</div>
                  <span className="mono text-[11px] text-[#A8A29C]">operator</span>
                </div>
                <button
                  onClick={() => { setAuthed(false); localStorage.removeItem("flamecore_session") }}
                  className="px-3 h-9 rounded-md border border-white/[0.08] text-[12px] font-medium hover:border-[#FF4D1F]/40 hover:text-[#FF4D1F] transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : null}

            <button onClick={() => setMobileMenu(!mobileMenu)} className="lg:hidden h-9 w-9 grid place-items-center rounded-md border border-white/[0.08]">
              <div className="space-y-1">
                <div className={`h-[1.5px] bg-[#E8E6E3] transition-all ${mobileMenu ? "w-3.5 translate-y-[3px] rotate-45" : "w-3.5"}`} />
                <div className={`h-[1.5px] bg-[#E8E6E3] transition-all ${mobileMenu ? "w-3.5 -translate-y-[3px] -rotate-45" : "w-2.5"}`} />
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* PUBLIC SITE */}
      {view === "public" && (
        <main>
          {/* Hero */}
          <section ref={heroRef} className="relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-60 pointer-events-none transition-opacity duration-1000"
              style={{
                background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,77,31,0.12), transparent 50%)`,
              }}
            />

            <div className="relative mx-auto max-w-[1440px] px-5 pt-20 pb-28">
              {/* Eyebrow */}
              <div className={`mb-9 inline-flex items-center gap-2.5 transition-all duration-700 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}>
                <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl pl-2 pr-3 h-7">
                  <div className="flex items-center gap-1 mono text-[10px] tracking-[0.14em] text-[#FF4D1F] uppercase font-semibold bg-[#FF4D1F]/10 px-1.5 py-0.5 rounded-full">
                    <span className="h-1 w-1 rounded-full bg-[#FF4D1F]" />
                    New
                  </div>
                  <span className="text-[12px] text-[#A8A29C] font-medium">Multi-region rollout · London & Frankfurt in private beta</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-[#6B6560]"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
              </div>

              <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-14 items-start">
                <div>
                  <h1 className={`font-[700] leading-[0.94] tracking-[-0.035em] text-[clamp(44px,7.5vw,108px)] transition-all duration-1000 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                    <span className="block text-[#E8E6E3]">Ship code.</span>
                    <span className="block gradient-text">Not infrastructure.</span>
                  </h1>

                  <p className={`mt-7 max-w-[560px] text-[18px] leading-[1.55] tracking-[-0.005em] text-[#A8A29C] font-[450] transition-all duration-1000 delay-150 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                    The modern cloud platform built on Docker. Connect your GitHub repo, hit deploy, and we'll handle the rest — builds, SSL, scaling, and uptime across regions.
                  </p>

                  <div className={`mt-9 flex flex-wrap items-center gap-3 transition-all duration-1000 delay-300 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                    <button
                      onClick={() => setView("console")}
                      className="group relative overflow-hidden rounded-lg bg-[#E8E6E3] px-5 h-12 flex items-center gap-2.5 hover:bg-white transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" fill="#050407"/>
                      </svg>
                      <span className="text-[14px] font-[650] text-[#050407]">Deploy from GitHub</span>
                    </button>
                    <button className="flex items-center gap-2.5 rounded-lg border border-white/[0.1] bg-white/[0.02] px-5 h-12 hover:border-white/[0.18] hover:bg-white/[0.04] transition-all backdrop-blur-xl">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><polygon points="6 4 20 12 6 20 6 4" fill="#E8E6E3"/></svg>
                      <span className="text-[14px] font-[550] text-[#E8E6E3]">Watch 60s demo</span>
                    </button>
                  </div>

                  {/* Command line teaser */}
                  <div className={`mt-9 flex items-center gap-2.5 rounded-md border border-white/[0.06] bg-[#0a0709]/80 backdrop-blur-xl pl-3 pr-1.5 py-1.5 max-w-md transition-all duration-1000 delay-500 ${heroVisible ? "opacity-100" : "opacity-0"}`}>
                    <span className="mono text-[12px] text-[#FF4D1F]">$</span>
                    <span className="mono text-[12px] text-[#E8E6E3] truncate flex-1">npx @flamecore/cli deploy</span>
                    <button onClick={() => { navigator.clipboard?.writeText("npx @flamecore/cli deploy"); setToast("COPIED · npx @flamecore/cli deploy") }} className="text-[10px] mono text-[#6B6560] hover:text-[#FF4D1F] px-2 h-6 rounded border border-white/[0.06] transition-colors">
                      copy
                    </button>
                  </div>

                  {/* Trust strip */}
                  <div className={`mt-12 grid grid-cols-3 md:grid-cols-4 gap-6 max-w-[600px] transition-all duration-1000 delay-700 ${heroVisible ? "opacity-100" : "opacity-0"}`}>
                    {[
                      ["50ms", "p95 cold start"],
                      ["99.95%", "uptime SLA"],
                      ["5", "global regions"],
                      ["12s", "avg build time"],
                    ].map(([k, v]) => (
                      <div key={v} className="space-y-1">
                        <div className="text-[22px] font-[700] tracking-tight text-[#E8E6E3] leading-none">{k}</div>
                        <div className="text-[11px] tracking-tight text-[#6B6560] font-medium">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live deployment card */}
                <div className={`relative transition-all duration-1000 delay-300 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
                  <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-[#FF4D1F]/40 via-transparent to-transparent" />
                  <div className="relative rounded-2xl border border-white/[0.06] bg-[#0a0709]/90 backdrop-blur-2xl overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-4 h-11">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                          <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                          <div className="h-2.5 w-2.5 rounded-full bg-[#27D17F]" />
                        </div>
                        <span className="mono text-[10.5px] text-[#6B6560] ml-2">flame · payments-svc · deploy</span>
                      </div>
                      <div className="flex items-center gap-1.5 mono text-[10px] text-[#27D17F]">
                        <div className="h-1.5 w-1.5 rounded-full bg-[#27D17F] animate-pulse" />
                        live
                      </div>
                    </div>

                    {/* Build log preview */}
                    <div className="p-4 mono text-[11.5px] leading-[1.75] space-y-[3px] min-h-[280px]">
                      <div className="text-[#6B6560]">$ flame deploy --region=los1</div>
                      <div className="text-[#A8A29C]">→ analyzing repository<span className="inline-block w-2 h-3 bg-[#FF4D1F] ml-1 animate-pulse" /></div>
                      <div className="text-[#27D17F]">✓ detected: Node.js (Dockerfile)</div>
                      <div className="text-[#27D17F]">✓ cloned in 1.2s</div>
                      <div className="text-[#A8A29C]">→ building image · flame-payments-svc</div>
                      <div className="text-[#6B6560] pl-3">layer 1/6 · base image cached</div>
                      <div className="text-[#6B6560] pl-3">layer 2/6 · deps cached (npm ci)</div>
                      <div className="text-[#6B6560] pl-3">layer 3/6 · copying source · 412 KB</div>
                      <div className="text-[#6B6560] pl-3">layer 4/6 · running build · 8.2s</div>
                      <div className="text-[#27D17F]">✓ image built · 84.2 MB</div>
                      <div className="text-[#A8A29C]">→ provisioning container in <span className="text-[#FF4D1F]">lagos-1</span></div>
                      <div className="text-[#A8A29C]">→ configuring nginx + TLS</div>
                      <div className="text-[#27D17F]">✓ deployed to https://payments-svc.flame.app</div>
                      <div className="pt-2 flex items-center gap-2">
                        <span className="bg-[#27D17F]/10 text-[#27D17F] mono text-[10px] px-1.5 py-0.5 rounded border border-[#27D17F]/30">READY</span>
                        <span className="text-[#6B6560]">deployed in <span className="text-[#E8E6E3] font-medium">42s</span></span>
                      </div>
                    </div>

                    {/* Card footer metrics */}
                    <div className="grid grid-cols-3 border-t border-white/[0.06] divide-x divide-white/[0.06]">
                      {[
                        ["Region", "lagos-1"],
                        ["RPS", "1.2k"],
                        ["Errors", "0.00%"],
                      ].map(([k, v]) => (
                        <div key={k} className="px-3 py-2.5">
                          <div className="mono text-[9px] tracking-[0.14em] text-[#6B6560] uppercase">{k}</div>
                          <div className="text-[13px] font-[600] text-[#E8E6E3] mt-0.5">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Floating chip */}
                  <div className="absolute -bottom-3 -left-3 rounded-lg border border-white/[0.08] bg-[#0a0709] px-3 py-2 mono text-[10px] flex items-center gap-2 shadow-xl">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FF4D1F] animate-pulse" />
                    <span className="text-[#A8A29C]">12ms · 🇳🇬 LOS1</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Logo strip */}
          <section className="border-y border-white/[0.04] bg-[#08070a]/40">
            <div className="mx-auto max-w-[1440px] px-5 py-8">
              <div className="flex flex-wrap items-center justify-center md:justify-between gap-6">
                <span className="mono text-[10.5px] tracking-[0.18em] uppercase text-[#6B6560]">Powering teams from</span>
                <div className="flex flex-wrap items-center gap-x-9 gap-y-3 opacity-60">
                  {["Lagos", "Nairobi", "Cape Town", "Accra", "Berlin", "London", "São Paulo"].map((city) => (
                    <span key={city} className="mono text-[11px] tracking-[0.12em] uppercase text-[#A8A29C] font-medium">{city}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Platform features */}
          <section id="platform" className="border-b border-white/[0.04]">
            <div className="mx-auto max-w-[1440px] px-5 py-28">
              <div className="max-w-[680px] mb-16">
                <div className="mono text-[10.5px] tracking-[0.2em] uppercase text-[#FF4D1F] font-semibold mb-4">// Platform</div>
                <h2 className="text-[42px] md:text-[56px] font-[700] leading-[0.98] tracking-[-0.03em] text-[#E8E6E3]">
                  Everything between <span className="italic font-[600] gradient-text">git push</span> and a healthy production deployment.
                </h2>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.06]">
                {[
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2v6m0 8v6m10-10h-6M8 12H2M19.07 4.93l-4.24 4.24M9.17 14.83l-4.24 4.24m14.14 0l-4.24-4.24M9.17 9.17L4.93 4.93" stroke="#FF4D1F" strokeWidth="1.5" strokeLinecap="round"/></svg>),
                    title: "Git-driven deploys",
                    body: "Connect any GitHub repo. Every push triggers a build. Branch previews, atomic rollbacks, zero-downtime releases."
                  },
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="#FF4D1F" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="#FF4D1F" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="#FF4D1F" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="#FF4D1F" strokeWidth="1.5"/></svg>),
                    title: "Built on Docker",
                    body: "Bring your own Dockerfile, or let us detect Next.js, Express, FastAPI, Go, Rust, Bun and 30+ frameworks."
                  },
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#FF4D1F" strokeWidth="1.5"/><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" stroke="#FF4D1F" strokeWidth="1.5"/></svg>),
                    title: "Multi-region from day one",
                    body: "Deploy to Lagos today. London, Frankfurt, New York, Singapore rolling out. Pin or replicate per region."
                  },
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#FF4D1F" strokeWidth="1.5"/></svg>),
                    title: "TLS that just works",
                    body: "Let's Encrypt provisioning in seconds. HTTP/2, HTTP/3, modern ciphers, HSTS — configured correctly by default."
                  },
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18M7 14l4-4 4 4 6-6" stroke="#FF4D1F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
                    title: "Observability built in",
                    body: "Structured logs, request traces, CPU/RAM graphs, deploy diffs. Stream from your terminal with `flame logs -f`."
                  },
                  {
                    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#FF4D1F" strokeWidth="1.5"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="#FF4D1F" strokeWidth="1.5"/></svg>),
                    title: "Secrets & env vars",
                    body: "Encrypted at rest. Scoped per environment. Rotate without redeploys. Audit who accessed what, when."
                  },
                ].map((f) => (
                  <div key={f.title} className="group bg-[#050407] p-7 hover:bg-[#0a0709] transition-colors relative">
                    <div className="h-10 w-10 rounded-lg border border-[#FF4D1F]/25 bg-[#FF4D1F]/[0.06] grid place-items-center mb-5 group-hover:border-[#FF4D1F]/50 group-hover:bg-[#FF4D1F]/[0.1] transition-colors">
                      {f.icon}
                    </div>
                    <h3 className="text-[17px] font-[650] tracking-[-0.01em] text-[#E8E6E3] mb-2">{f.title}</h3>
                    <p className="text-[13.5px] leading-[1.55] text-[#A8A29C] font-[450]">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section id="pricing" className="border-b border-white/[0.04]">
            <div className="mx-auto max-w-[1440px] px-5 py-28">
              <div className="flex flex-wrap items-end justify-between gap-6 mb-14">
                <div className="max-w-[640px]">
                  <div className="mono text-[10.5px] tracking-[0.2em] uppercase text-[#FF4D1F] font-semibold mb-4">// Pricing</div>
                  <h2 className="text-[42px] md:text-[56px] font-[700] leading-[0.98] tracking-[-0.03em] text-[#E8E6E3]">
                    Usage-based, no surprises.
                  </h2>
                  <p className="mt-4 text-[16px] leading-[1.55] text-[#A8A29C] font-[450]">
                    Start free. Scale when you ship. All currencies supported — pay in USD, NGN, GBP or EUR with one click.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#0a0709]/80 p-1">
                    <button
                      onClick={() => setBilling("month")}
                      className={`px-3.5 h-8 rounded-md text-[12.5px] font-[550] transition-all ${billing === "month" ? "bg-[#E8E6E3] text-[#050407]" : "text-[#A8A29C] hover:text-[#E8E6E3]"}`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setBilling("year")}
                      className={`px-3.5 h-8 rounded-md text-[12.5px] font-[550] transition-all flex items-center gap-1.5 ${billing === "year" ? "bg-[#E8E6E3] text-[#050407]" : "text-[#A8A29C] hover:text-[#E8E6E3]"}`}
                    >
                      Yearly
                      <span className={`text-[9.5px] mono px-1 rounded ${billing === "year" ? "bg-[#FF4D1F]/15 text-[#FF4D1F]" : "bg-[#27D17F]/10 text-[#27D17F]"}`}>-17%</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {plans.map((plan) => (
                  <div key={plan.id} className="relative">
                    {plan.popular && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                        <div className="mono text-[9.5px] font-[700] tracking-[0.16em] uppercase bg-gradient-to-r from-[#FF4D1F] to-[#FF8A4D] text-[#050407] px-2.5 h-5 flex items-center rounded-full shadow-[0_0_20px_rgba(255,77,31,0.4)]">
                          most popular
                        </div>
                      </div>
                    )}

                    <div className={`h-full rounded-2xl border bg-[#0a0709]/70 backdrop-blur-xl transition-all duration-300 ${plan.popular ? "border-[#FF4D1F]/40 shadow-[0_0_50px_-12px_rgba(255,77,31,0.3)]" : "border-white/[0.06] hover:border-white/[0.14]"}`}>
                      <div className="p-6">
                        <div className="mb-5">
                          <div className="mono text-[10.5px] font-[700] tracking-[0.2em] text-[#FF4D1F] mb-1.5">{plan.name}</div>
                          <div className="text-[12.5px] text-[#A8A29C] font-[450] h-8">{plan.tagline}</div>
                        </div>

                        <div className="mb-6 flex items-baseline gap-1.5">
                          <span className="text-[36px] font-[700] tracking-[-0.03em] text-[#E8E6E3] leading-none">{formatPrice(plan.priceUSD)}</span>
                          {plan.priceUSD > 0 && (
                            <span className="mono text-[11px] text-[#6B6560]">/{billing === "year" ? "yr" : "mo"}</span>
                          )}
                        </div>

                        <button
                          onClick={() => { setView("console"); setShowDeployModal(true) }}
                          className={`w-full h-10 rounded-md font-[600] text-[13px] tracking-tight transition-all ${plan.popular ? "bg-[#FF4D1F] text-[#050407] hover:bg-[#FF5C2E]" : "border border-white/[0.1] text-[#E8E6E3] hover:border-[#FF4D1F]/40 hover:bg-[#FF4D1F]/[0.06]"}`}
                        >
                          {plan.priceUSD === 0 ? "Start free" : "Start trial"}
                        </button>

                        <div className="mt-6 space-y-3.5 border-t border-white/[0.06] pt-5">
                          {[
                            ["Compute", plan.cpu],
                            ["Memory", plan.ram],
                            ["Storage", plan.storage],
                            ["Bandwidth", plan.bandwidth],
                            ["Build minutes", plan.builds],
                          ].map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between text-[12.5px]">
                              <span className="text-[#6B6560] font-[450]">{k}</span>
                              <span className="text-[#E8E6E3] font-[550]">{v}</span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-5 pt-5 border-t border-white/[0.06] space-y-2.5">
                          {plan.features.map((feat) => (
                            <div key={feat} className="flex items-start gap-2">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0"><path d="M20 6L9 17l-5-5" stroke="#FF4D1F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              <span className="text-[12.5px] leading-[1.45] text-[#A8A29C] font-[450]">{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Payment row */}
              <div className="mt-10 flex flex-wrap items-center justify-between gap-6 rounded-xl border border-white/[0.06] bg-white/[0.015] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg border border-white/[0.08] grid place-items-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="#A8A29C" strokeWidth="1.5"/><path d="M2 10h20" stroke="#A8A29C" strokeWidth="1.5"/></svg>
                  </div>
                  <div>
                    <div className="text-[14px] font-[600] text-[#E8E6E3]">Pay in any currency, anywhere</div>
                    <div className="text-[12px] text-[#6B6560] mt-0.5">Cards · Stripe · Paystack · Flutterwave · PayPal · Bank transfer (NGN, USD, GBP, EUR)</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {["Stripe", "Paystack", "Flutterwave", "PayPal"].map((p) => (
                    <span key={p} className="mono text-[10px] tracking-[0.1em] uppercase text-[#A8A29C] border border-white/[0.08] rounded-md px-2 py-1 font-medium">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Regions */}
          <section id="regions" className="border-b border-white/[0.04]">
            <div className="mx-auto max-w-[1440px] px-5 py-28">
              <div className="grid lg:grid-cols-[1fr_1.2fr] gap-14 items-start">
                <div>
                  <div className="mono text-[10.5px] tracking-[0.2em] uppercase text-[#FF4D1F] font-semibold mb-4">// Global network</div>
                  <h2 className="text-[42px] md:text-[52px] font-[700] leading-[0.98] tracking-[-0.03em] text-[#E8E6E3] mb-5">
                    Africa-rooted.<br/>Globally available.
                  </h2>
                  <p className="text-[16px] leading-[1.6] text-[#A8A29C] font-[450] max-w-[480px]">
                    Our first region is in Lagos — because African builders deserve infrastructure that doesn't add 200ms of latency just to reach a server. The next four are coming.
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-4 max-w-[420px]">
                    {[
                      ["1", "Live region"],
                      ["4", "Coming 2025"],
                      ["18 Tbps", "Backbone capacity"],
                      ["12ms", "p50 from Lagos"],
                    ].map(([k, v]) => (
                      <div key={v} className="rounded-lg border border-white/[0.06] bg-[#0a0709]/50 p-4">
                        <div className="text-[20px] font-[700] text-[#E8E6E3] tracking-tight leading-none">{k}</div>
                        <div className="text-[11px] text-[#6B6560] mt-1.5 font-medium">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-[#0a0709]/60 backdrop-blur-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#27D17F] animate-pulse" />
                      <span className="mono text-[11px] text-[#A8A29C]">edge_status · realtime</span>
                    </div>
                    <span className="mono text-[10px] text-[#6B6560]">refresh 5s</span>
                  </div>

                  <div className="divide-y divide-white/[0.04]">
                    {regions.map((r) => (
                      <div key={r.code} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-5 py-4 hover:bg-white/[0.015] transition-colors">
                        <div className="text-[24px]">{r.flag}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14.5px] font-[600] text-[#E8E6E3] tracking-tight">{r.city}</span>
                            <span className="mono text-[10px] text-[#6B6560]">{r.pop}</span>
                          </div>
                          <div className="text-[11.5px] text-[#6B6560] mt-0.5">{r.country}</div>
                        </div>
                        <div className="mono text-[11px] text-[#A8A29C] hidden sm:block">
                          {r.status === "live" ? `${r.latency}ms` : "—"}
                        </div>
                        <div>
                          {r.status === "live" && (
                            <span className="mono text-[9.5px] font-[700] tracking-[0.14em] uppercase bg-[#27D17F]/10 text-[#27D17F] border border-[#27D17F]/30 px-2 py-1 rounded-full">live</span>
                          )}
                          {r.status === "soon" && (
                            <span className="mono text-[9.5px] font-[700] tracking-[0.14em] uppercase bg-[#FFBD2E]/10 text-[#FFBD2E] border border-[#FFBD2E]/30 px-2 py-1 rounded-full">Q2 '25</span>
                          )}
                          {r.status === "planned" && (
                            <span className="mono text-[9.5px] font-[700] tracking-[0.14em] uppercase bg-white/[0.04] text-[#6B6560] border border-white/[0.08] px-2 py-1 rounded-full">planned</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-white/[0.06] px-5 py-3 flex items-center justify-between text-[11px] text-[#6B6560] mono">
                    <span>5 regions total</span>
                    <button className="text-[#FF4D1F] hover:underline">request a region →</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,77,31,0.15),transparent_60%)]" />
            <div className="relative mx-auto max-w-[1100px] px-5 py-28 text-center">
              <h2 className="text-[48px] md:text-[72px] font-[700] leading-[0.95] tracking-[-0.035em] mb-6">
                <span className="text-[#E8E6E3]">Your next deploy</span><br/>
                <span className="gradient-text">takes 42 seconds.</span>
              </h2>
              <p className="text-[17px] leading-[1.55] text-[#A8A29C] max-w-[520px] mx-auto mb-9 font-[450]">
                Free to start. No credit card. Connect GitHub and ship.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={() => setView("console")} className="rounded-lg bg-[#FF4D1F] text-[#050407] px-6 h-12 font-[650] text-[14px] hover:bg-[#FF5C2E] transition-colors flex items-center gap-2">
                  Start deploying free
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button className="rounded-lg border border-white/[0.12] px-6 h-12 font-[550] text-[14px] hover:border-white/[0.2] hover:bg-white/[0.03] transition-all">
                  Talk to sales
                </button>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="border-t border-white/[0.05] bg-[#08070a]/40">
            <div className="mx-auto max-w-[1440px] px-5">
              <div className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-md bg-[#FF4D1F] grid place-items-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C12 2 7 7 7 12C7 14.5 8.5 16 10 16C10 14 11 13 12 13C13 13 14 14 14 16C15.5 16 17 14.5 17 12C17 7 12 2 12 2Z" fill="#050407"/></svg>
                    </div>
                    <div className="font-[700] tracking-tight text-[#E8E6E3]">flame<span className="text-[#FF4D1F]">core</span></div>
                  </div>
                  <p className="text-[13px] leading-[1.6] text-[#6B6560] max-w-[280px] font-[450]">
                    A modern cloud platform built in Lagos for developers everywhere. From GitHub to global in seconds.
                  </p>
                  <div className="mt-5 mono text-[10px] tracking-[0.14em] uppercase text-[#6B6560]">
                    Flame Core Technology LTD · RC 1982743
                  </div>
                </div>

                {[
                  { title: "Platform", links: ["Deployments", "Docker", "Domains & SSL", "Regions", "CLI"] },
                  { title: "Resources", links: ["Documentation", "Guides", "API reference", "Status", "Changelog"] },
                  { title: "Company", links: ["About", "Pricing", "Customers", "Careers", "Press"] },
                  { title: "Legal", links: ["Privacy", "Terms", "DPA", "Security", "AUP"] },
                ].map((col) => (
                  <div key={col.title}>
                    <h4 className="mono text-[10.5px] font-[700] tracking-[0.18em] uppercase text-[#FF4D1F] mb-4">{col.title}</h4>
                    <div className="space-y-2.5">
                      {col.links.map((l) => (
                        <a key={l} href="#" className="block text-[13px] text-[#A8A29C] hover:text-[#E8E6E3] transition-colors font-[450]">{l}</a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/[0.05] py-5 flex flex-col md:flex-row items-center justify-between gap-3 mono text-[10.5px] text-[#6B6560] tracking-wide">
                <div>© 2025 Flame Core Technology · Built in Lagos · Deployed worldwide</div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#27D17F] animate-pulse" />
                  <span>all systems operational</span>
                </div>
              </div>
            </div>
          </footer>
        </main>
      )}

      {/* CONSOLE (Auth + Dashboard) */}
      {view === "console" && (
        <main>
          {!authed ? (
            <div className="min-h-[calc(100vh-92px)] grid place-items-center px-5 py-16">
              <div className="w-full max-w-[420px]">
                <div className="text-center mb-9">
                  <div className="mx-auto h-14 w-14 rounded-xl border border-[#FF4D1F]/40 bg-[#0a0709] grid place-items-center mb-5 relative">
                    <div className="absolute inset-0 rounded-xl bg-[#FF4D1F]/20 blur-lg" />
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative">
                      <path d="M12 2C12 2 7 7 7 12C7 14.5 8.5 16 10 16C10 14 11 13 12 13C13 13 14 14 14 16C15.5 16 17 14.5 17 12C17 7 12 2 12 2Z" fill="#FF4D1F"/>
                    </svg>
                  </div>
                  <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[#E8E6E3] leading-none mb-2">{authMode === "signin" ? "Welcome back" : "Create your account"}</h1>
                  <p className="text-[13px] text-[#6B6560]">{authMode === "signin" ? "Sign in to your Flame Core console" : "Set up your team and launch your first deployment"}</p>
                </div>

                <div className="mb-4 flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#050407] p-1">
                  <button type="button" onClick={() => setAuthMode("signin")} className={`flex-1 h-9 rounded-md text-[12px] font-[650] transition-colors ${authMode === "signin" ? "bg-[#FF4D1F]/10 text-[#FF4D1F] border border-[#FF4D1F]/30" : "text-[#6B6560] hover:text-[#A8A29C]"}`}>
                    Sign in
                  </button>
                  <button type="button" onClick={() => setAuthMode("register")} className={`flex-1 h-9 rounded-md text-[12px] font-[650] transition-colors ${authMode === "register" ? "bg-[#FF4D1F]/10 text-[#FF4D1F] border border-[#FF4D1F]/30" : "text-[#6B6560] hover:text-[#A8A29C]"}`}>
                    Create account
                  </button>
                </div>

                {authMode === "signin" ? (
                  <form onSubmit={handleLogin} className="rounded-2xl border border-white/[0.06] bg-[#0a0709]/80 backdrop-blur-xl p-6 space-y-4">
                    <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1/oauth/github`} className="w-full h-11 rounded-lg border border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-2.5 text-[13.5px] font-[550] text-[#E8E6E3] no-underline">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 12A10 10 0 0012 2z" fill="#E8E6E3"/></svg>
                      Continue with GitHub
                    </a>

                    <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1/oauth/google`} className="w-full h-11 rounded-lg border border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-2.5 text-[13.5px] font-[550] text-[#E8E6E3] no-underline">
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Continue with Google
                    </a>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-white/[0.06]" />
                      <span className="mono text-[10px] uppercase tracking-[0.16em] text-[#6B6560]">or email</span>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>

                    <div>
                      <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Email</label>
                      <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@company.com" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3.5 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50 focus:ring-2 focus:ring-[#FF4D1F]/15 transition-all" />
                    </div>

                    <div>
                      <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Password</label>
                      <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3.5 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50 focus:ring-2 focus:ring-[#FF4D1F]/15 transition-all" />
                    </div>

                    <button type="submit" className="w-full h-11 rounded-lg bg-[#FF4D1F] text-[#050407] font-[650] text-[13.5px] hover:bg-[#FF5C2E] transition-colors">
                      Sign in →
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="rounded-2xl border border-white/[0.06] bg-[#0a0709]/80 backdrop-blur-xl p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">First name</label>
                        <input type="text" value={registerData.firstName} onChange={(e) => setRegisterData({ ...registerData, firstName: e.target.value })} placeholder="Ada" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                      </div>
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Last name</label>
                        <input type="text" value={registerData.lastName} onChange={(e) => setRegisterData({ ...registerData, lastName: e.target.value })} placeholder="Okafor" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                      </div>
                    </div>

                    <div>
                      <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Work email</label>
                      <input type="email" value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} placeholder="you@company.com" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Company</label>
                        <input type="text" value={registerData.company} onChange={(e) => setRegisterData({ ...registerData, company: e.target.value })} placeholder="Flame Labs" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                      </div>
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Phone</label>
                        <input type="tel" value={registerData.phone} onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })} placeholder="+234 801 234 5678" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Country</label>
                        <select value={registerData.country} onChange={(e) => setRegisterData({ ...registerData, country: e.target.value })} className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] focus:outline-none focus:border-[#FF4D1F]/50">
                          {["Nigeria", "Ghana", "Kenya", "South Africa", "United Kingdom", "United States", "Germany", "Singapore"].map((country) => (
                            <option key={country} value={country} className="bg-[#0a0709]">{country}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Role</label>
                        <select value={registerData.role} onChange={(e) => setRegisterData({ ...registerData, role: e.target.value })} className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] focus:outline-none focus:border-[#FF4D1F]/50">
                          {["Founder", "Engineer", "Product Manager", "CTO", "Designer", "DevOps", "Student"].map((role) => (
                            <option key={role} value={role} className="bg-[#0a0709]">{role}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Workspace / team name</label>
                      <input type="text" value={registerData.teamName} onChange={(e) => setRegisterData({ ...registerData, teamName: e.target.value })} placeholder="Acme Engineering" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Password</label>
                        <input type="password" value={registerData.password} onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })} placeholder="At least 8 characters" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                      </div>
                      <div>
                        <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Confirm password</label>
                        <input type="password" value={registerData.confirmPassword} onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })} placeholder="Repeat password" className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[14px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
                      </div>
                    </div>

                    <button type="submit" className="w-full h-11 rounded-lg bg-[#FF4D1F] text-[#050407] font-[650] text-[13.5px] hover:bg-[#FF5C2E] transition-colors">
                      Create account →
                    </button>
                  </form>
                )}

                <div className="mt-5 text-center text-[12px] text-[#6B6560]">
                  {authMode === "signin" ? (
                    <>No account? <button type="button" onClick={() => setAuthMode("register")} className="text-[#FF4D1F] hover:underline">Create one free</button></>
                  ) : (
                    <>Already have an account? <button type="button" onClick={() => setAuthMode("signin")} className="text-[#FF4D1F] hover:underline">Sign in</button></>
                  )}
                </div>

                <div className="mt-3 text-center mono text-[10px] uppercase tracking-[0.14em] text-[#4a4540]">
                  {authMode === "signin" ? "any email + 4+ chars works for demo" : "registration now includes richer onboarding fields"}
                </div>
              </div>
            </div>
          ) : (
            <Console
              authed={authed}
              consoleView={consoleState.consoleView}
              selectedProject={consoleState.selectedProject}
              selectedService={consoleState.selectedService}
              projects={consoleState.projects}
              isLoadingProjects={consoleState.isLoadingProjects}
              projectsError={consoleState.projectsError}
              onSelectProject={consoleState.selectProject}
              onBuildNew={consoleState.openDeployModal}
              onBackToDashboard={consoleState.backToDashboard}
              onSelectService={consoleState.selectService}
              onAddService={consoleState.openDeployModal}
              onCloseRoom={consoleState.closeRoom}
              onToast={(msg) => setToast(msg)}
              onLogout={() => { setAuthed(false); setView("public") }}
            />
          )}
    </main>
  )}

  {/* ADMIN SUPER CONSOLE */}
  {view === "admin" && authed && (
    <main className="min-h-[calc(100vh-92px)]">
      <AdminSuperConsole onToast={setToast} adminTab={adminTab} setAdminTab={setAdminTab} />
    </main>
  )}

  {/* ─── Admin Super Console ───────────────────────────────────────────── */}
  {showDeployModal && (
        <NewProjectPalette
          onClose={() => { setShowDeployModal(false); setNewProjectStep("root"); setNewProjectSearch("") }}
          onDeploy={handleDeploy}
          step={newProjectStep}
          setStep={setNewProjectStep}
          search={newProjectSearch}
          setSearch={setNewProjectSearch}
          deployRepo={deployRepo}
          setDeployRepo={setDeployRepo}
          deployRegion={deployRegion}
          setDeployRegion={setDeployRegion}
          deployFramework={deployFramework}
          setDeployFramework={setDeployFramework}
          regions={regions}
          selectedDb={selectedDb}
          setSelectedDb={setSelectedDb}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          dockerImage={selectedDockerImage}
          setDockerImage={setSelectedDockerImage}
          onToast={setToast}
        />
      )}

      {/* Toast */}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}

/* ─────────────────────────── CONSOLE DASHBOARD ─────────────────────────── */



/* ─── Admin Super Console ───────────────────────────────────────────── */
function AdminSuperConsole({ onToast, adminTab, setAdminTab }: { onToast: (m: string) => void; adminTab: string; setAdminTab: (t: any) => void }) {
  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-[#FFBD2E] grid place-items-center text-[14px]">🛡️</div>
            <h1 className="text-[24px] font-[700] tracking-tight text-[#E8E6E3]">Operations Center</h1>
            <span className="mono text-[9.5px] tracking-[0.14em] uppercase bg-[#FFBD2E]/10 text-[#FFBD2E] border border-[#FFBD2E]/30 px-2 py-0.5 rounded-full font-semibold">internal</span>
          </div>
          <div className="mono text-[10.5px] text-[#6B6560] mt-1">Platform operator dashboard · All teams & deployments</div>
        </div>
      </div>

      {/* System metrics */}
      <div className="grid gap-3 md:grid-cols-5 mb-7">
        {[
          { k: "VPS CPU", v: "23%", d: "4 cores · 3.4 GHz", c: "#27D17F" },
          { k: "Memory", v: "4.2 / 8 GB", d: "52% used", c: "#27D17F" },
          { k: "Disk", v: "41 / 100 GB", d: "41% used", c: "#27D17F" },
          { k: "Containers", v: "7", d: "5 healthy · 1 building · 1 sleeping", c: "#FFBD2E" },
          { k: "Queue", v: "1", d: "0 failed (24h)", c: "#27D17F" },
        ].map((m) => (
          <div key={m.k} className="rounded-xl border border-white/[0.06] bg-[#0a0709]/70 p-4">
            <div className="mono text-[10px] tracking-[0.14em] uppercase text-[#6B6560] font-semibold mb-2">{m.k}</div>
            <div className="text-[20px] font-[700] tracking-tight leading-none mb-1" style={{ color: m.c }}>{m.v}</div>
            <div className="text-[11px] text-[#6B6560]">{m.d}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] mb-6 overflow-x-auto">
        {[
          ["overview", "Overview"], ["deployments", "All Deploys"], ["users", "Users"], ["domains", "Domains"],
          ["billing", "Billing"], ["security", "Security"], ["storage", "Storage"], ["settings", "Settings"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setAdminTab(id)}
            className={`relative px-3.5 h-10 text-[13px] font-[550] tracking-tight whitespace-nowrap transition-colors ${adminTab === id ? "text-[#FFBD2E]" : "text-[#6B6560] hover:text-[#A8A29C]"}`}>
            {label}
            {adminTab === id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FFBD2E]" />}
          </button>
        ))}
      </div>

      {/* Overview */}
      {adminTab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-5">
            <div className="text-[14px] font-[650] text-[#E8E6E3] mb-4">Recent Deployments</div>
            <div className="space-y-2">
              {[
                { id: "dpl_8f2a91", project: "api-gateway", status: "healthy", team: "flamecore", time: "2m ago" },
                { id: "dpl_7d1b40", project: "payments-svc", status: "building", team: "flamecore", time: "now" },
                { id: "dpl_6c0a12", project: "dashboard-web", status: "ready", team: "acme-corp", time: "1h ago" },
                { id: "dpl_5b9f81", project: "telegram-bot", status: "sleeping", team: "flamecore", time: "4h ago" },
                { id: "dpl_4a8e72", project: "marketing-site", status: "failed", team: "flamecore", time: "6h ago" },
              ].map((dep) => (
                <div key={dep.id} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-[#050407] px-3 py-2.5 hover:border-white/[0.08] transition-colors">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={dep.status} />
                    <div>
                      <div className="text-[13px] font-[600] text-[#E8E6E3]">{dep.project}</div>
                      <div className="mono text-[10px] text-[#6B6560]">{dep.team} · {dep.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#6B6560]">{dep.time}</span>
                    <button onClick={() => onToast(`RESTART · ${dep.id}`)} className="h-7 w-7 rounded-md border border-white/[0.06] grid place-items-center text-[#6B6560] hover:text-[#FF4D1F] hover:border-[#FF4D1F]/30 transition-colors text-[11px]">↻</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-5">
              <div className="text-[14px] font-[650] text-[#E8E6E3] mb-3">Active Regions</div>
              <div className="space-y-2.5">
                {[
                  { flag: "🇳🇬", city: "Lagos", code: "los1", status: "live", deploys: 7, load: "41%" },
                  { flag: "🇬🇧", city: "London", code: "lhr1", status: "soon", deploys: 0, load: "—" },
                  { flag: "🇩🇪", city: "Frankfurt", code: "fra1", status: "soon", deploys: 0, load: "—" },
                ].map((r) => (
                  <div key={r.code} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">{r.flag}</span>
                      <div>
                        <span className="text-[13px] font-[600] text-[#E8E6E3]">{r.city}</span>
                        <span className="mono text-[10px] text-[#6B6560] ml-2">{r.code}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-[#A8A29C]">{r.deploys} deploys</span>
                      <span className="text-[#A8A29C]">{r.load}</span>
                      <StatusBadge status={r.status === "live" ? "healthy" : "queued"} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[#FF5F56]/25 bg-[#FF5F56]/[0.04] p-5">
              <div className="text-[14px] font-[650] text-[#FF5F56] mb-2">Security Events (24h)</div>
              <div className="space-y-2">
                {[
                  { event: "auth.login_failed", ip: "41.222.x.x", time: "2h ago", count: "3 attempts" },
                  { event: "rate_limit.hit", ip: "102.88.x.x", time: "5h ago", count: "deploy endpoint" },
                ].map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#FF5F56]">⚠</span>
                      <span className="mono text-[#A8A29C]">{e.event}</span>
                    </div>
                    <span className="text-[#6B6560]">{e.ip} · {e.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings — SMTP */}
      {adminTab === "storage" && (
        <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-4">
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[16px]">🗄️</span>
                <div className="text-[14px] font-[650] text-[#E8E6E3]">Storage Provider Health</div>
              </div>
              <div className="space-y-3 text-[12px]">
                <div className="flex items-center justify-between"><span className="text-[#6B6560]">Provider</span><span className="mono text-[#E8E6E3]">Cloudflare R2</span></div>
                <div className="flex items-center justify-between"><span className="text-[#6B6560]">Bucket</span><span className="mono text-[#E8E6E3]">flame-storage</span></div>
                <div className="flex items-center justify-between"><span className="text-[#6B6560]">Health</span><StatusBadge status="healthy" /></div>
                <div className="flex items-center justify-between"><span className="text-[#6B6560]">CDN</span><span className="mono text-[#27D17F]">enabled</span></div>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-6">
              <div className="text-[14px] font-[650] text-[#E8E6E3] mb-3">Usage by Team</div>
              <div className="space-y-2.5">
                {[
                  ["flamecore", "12.8 GB", "84k objects"],
                  ["acme-corp", "4.2 GB", "12k objects"],
                  ["demo-team", "440 MB", "1.2k objects"],
                ].map(([team, size, objects]) => (
                  <div key={team} className="flex items-center justify-between text-[12px]">
                    <div>
                      <div className="text-[#E8E6E3] font-[600]">{team}</div>
                      <div className="mono text-[10px] text-[#6B6560]">{objects}</div>
                    </div>
                    <div className="mono text-[#A8A29C]">{size}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-6">
              <div className="text-[14px] font-[650] text-[#E8E6E3] mb-3">Largest Projects</div>
              <div className="space-y-2.5">
                {[
                  ["cms-assets", "flamecore", "8.4 GB"],
                  ["media-library", "acme-corp", "3.1 GB"],
                  ["exports-service", "flamecore", "1.2 GB"],
                ].map(([project, team, size]) => (
                  <div key={project} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-[#050407] px-3 py-2.5">
                    <div>
                      <div className="text-[13px] font-[600] text-[#E8E6E3]">{project}</div>
                      <div className="mono text-[10px] text-[#6B6560]">{team}</div>
                    </div>
                    <div className="mono text-[#A8A29C] text-[12px]">{size}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[#FF5F56]/25 bg-[#FF5F56]/[0.04] p-6">
              <div className="text-[14px] font-[650] text-[#FF5F56] mb-3">Failed Uploads</div>
              <div className="space-y-2 text-[12px]">
                {[
                  ["evil.exe", "unsupported MIME", "2m ago"],
                  ["video.mov", "quota exceeded", "14m ago"],
                ].map(([file, reason, time]) => (
                  <div key={file} className="flex items-center justify-between">
                    <div>
                      <div className="text-[#E8E6E3]">{file}</div>
                      <div className="mono text-[10px] text-[#FF5F56]">{reason}</div>
                    </div>
                    <div className="text-[#6B6560]">{time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {adminTab === "settings" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[16px]">📧</span>
              <div className="text-[14px] font-[650] text-[#E8E6E3]">SMTP Configuration</div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Host", placeholder: "smtp.gmail.com", key: "host" },
                { label: "Port", placeholder: "587", key: "port" },
                { label: "Username", placeholder: "you@gmail.com", key: "user" },
                { label: "Password", placeholder: "••••••••", key: "pass" },
                { label: "From Email", placeholder: "noreply@flame.app", key: "from_email" },
                { label: "From Name", placeholder: "Flame Core", key: "from_name" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="mono text-[10px] font-[600] tracking-[0.12em] uppercase text-[#6B6560] block mb-1.5">{f.label}</label>
                  <input type={f.key === "pass" ? "password" : "text"} placeholder={f.placeholder}
                    className="w-full h-9 rounded-md border border-white/[0.08] bg-[#050407] px-3 text-[13px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50 mono" />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={() => onToast("SMTP · settings saved")} className="flex-1 h-9 rounded-md bg-[#FF4D1F] text-[#050407] text-[12px] font-[650]">Save</button>
                <button onClick={() => onToast("SMTP · test email sent")} className="h-9 px-4 rounded-md border border-white/[0.08] text-[12px] text-[#A8A29C] hover:text-[#E8E6E3] transition-colors">Test</button>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[16px]">☁️</span>
              <div className="text-[14px] font-[650] text-[#E8E6E3]">Object Storage</div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mono text-[10px] font-[600] tracking-[0.12em] uppercase text-[#6B6560] block mb-1.5">Provider</label>
                <select className="w-full h-9 rounded-md border border-white/[0.08] bg-[#050407] px-3 text-[13px] text-[#E8E6E3] focus:outline-none focus:border-[#FF4D1F]/50">
                  <option value="local" className="bg-[#0a0709]">Local Filesystem</option>
                  <option value="s3" className="bg-[#0a0709]">AWS S3</option>
                  <option value="r2" className="bg-[#0a0709]">Cloudflare R2</option>
                  <option value="b2" className="bg-[#0a0709]">Backblaze B2</option>
                </select>
              </div>
              {[
                { label: "Endpoint / Region", placeholder: "us-east-1 or https://..." },
                { label: "Bucket", placeholder: "flame-storage" },
                { label: "Access Key", placeholder: "AKIA..." },
                { label: "Secret Key", placeholder: "••••••••" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mono text-[10px] font-[600] tracking-[0.12em] uppercase text-[#6B6560] block mb-1.5">{f.label}</label>
                  <input type={f.label.includes("Secret") ? "password" : "text"} placeholder={f.placeholder}
                    className="w-full h-9 rounded-md border border-white/[0.08] bg-[#050407] px-3 text-[13px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50 mono" />
                </div>
              ))}
              <button onClick={() => onToast("STORAGE · settings saved")} className="w-full h-9 rounded-md bg-[#FF4D1F] text-[#050407] text-[12px] font-[650]">Save Storage Config</button>
            </div>
          </div>
        </div>
      )}

      {/* Other tabs placeholder */}
      {["deployments","users","domains","billing","security"].includes(adminTab) && adminTab !== "overview" && adminTab !== "settings" && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0a0709]/40 p-8 text-center">
          <div className="text-[16px] mb-2">🔧</div>
          <div className="text-[14px] font-[600] text-[#E8E6E3] mb-1">{adminTab.charAt(0).toUpperCase() + adminTab.slice(1)} Management</div>
          <div className="text-[12px] text-[#6B6560]">Connected to /api/v1/super/{adminTab} · Data loads from backend</div>
        </div>
      )}

      <div className="mt-8 pt-5 border-t border-white/[0.05] mono text-[10.5px] text-[#4a4540] flex items-center justify-between">
        <span>flame core operations · internal only · all actions audited</span>
        <span className="text-[#FFBD2E]">admin mode active</span>
      </div>
    </div>
  )
}

/* ─── New Project Command Palette ────────────────────────────────────────── */
type PaletteStep = "root" | "github" | "gitlab" | "bitbucket" | "docker" | "database" | "template" | "cli" | "url" | "empty"

type PaletteProps = {
  onClose: () => void
  onDeploy: (e: React.FormEvent) => void
  step: PaletteStep
  setStep: (s: PaletteStep) => void
  search: string
  setSearch: (s: string) => void
  deployRepo: string
  setDeployRepo: (v: string) => void
  deployRegion: string
  setDeployRegion: (v: string) => void
  deployFramework?: string
  setDeployFramework?: (v: string) => void
  regions: Region[]
  selectedDb: string | null
  setSelectedDb: (v: string | null) => void
  selectedTemplate: string | null
  setSelectedTemplate: (v: string | null) => void
  dockerImage: string
  setDockerImage: (v: string) => void
  onToast: (v: string) => void
}

const GITHUB_REPOS = [
  { name: "flamecore/api-gateway", lang: "TypeScript", stars: 24, updated: "2m ago", private: false },
  { name: "flamecore/dashboard-web", lang: "TypeScript", stars: 8, updated: "1h ago", private: false },
  { name: "flamecore/payments-svc", lang: "Node.js", stars: 3, updated: "3h ago", private: true },
  { name: "flamecore/marketing", lang: "Astro", stars: 1, updated: "1d ago", private: false },
  { name: "flamecore/notify-bot", lang: "Python", stars: 5, updated: "2d ago", private: false },
  { name: "flamecore/auth-service", lang: "Go", stars: 7, updated: "3d ago", private: true },
]

const DATABASES = [
  { id: "postgres", name: "PostgreSQL", version: "17", icon: "🐘", desc: "Advanced open-source relational database" },
  { id: "mysql", name: "MySQL", version: "8.4", icon: "🐬", desc: "World's most popular open-source database" },
  { id: "redis", name: "Redis", version: "7.4", icon: "🟥", desc: "In-memory data store, cache & message broker" },
  { id: "mongodb", name: "MongoDB", version: "7.0", icon: "🍃", desc: "Developer-friendly NoSQL document database" },
  { id: "sqlite", name: "SQLite", version: "3.x", icon: "🪶", desc: "Serverless, zero-config SQL database" },
  { id: "kafka", name: "Kafka", version: "3.8", icon: "⚡", desc: "High-throughput distributed event streaming" },
]

const TEMPLATES = [
  { id: "nextjs-starter", name: "Next.js Starter", category: "Full-Stack", icon: "▲", repo: "https://github.com/vercel/next.js" },
  { id: "express-api", name: "Express API", category: "Backend", icon: "⚡", repo: "https://github.com/expressjs/express" },
  { id: "fastapi", name: "FastAPI", category: "Python API", icon: "🐍", repo: "https://github.com/tiangolo/fastapi" },
  { id: "django", name: "Django", category: "Python Full-Stack", icon: "🎸", repo: "https://github.com/django/django" },
  { id: "nestjs", name: "NestJS", category: "TypeScript API", icon: "🦅", repo: "https://github.com/nestjs/nest" },
  { id: "strapi", name: "Strapi CMS", category: "Headless CMS", icon: "📝", repo: "https://github.com/strapi/strapi" },
  { id: "ghost", name: "Ghost Blog", category: "CMS / Blog", icon: "👻", repo: "https://github.com/TryGhost/Ghost" },
  { id: "n8n", name: "n8n Automation", category: "Automation", icon: "🔄", repo: "https://github.com/n8n-io/n8n" },
  { id: "supabase", name: "Supabase Stack", category: "Backend as a Service", icon: "⚡", repo: "https://github.com/supabase/supabase" },
  { id: "grafana", name: "Grafana", category: "Monitoring", icon: "📊", repo: "https://github.com/grafana/grafana" },
  { id: "wordpress", name: "WordPress", category: "CMS", icon: "🌐", repo: "https://github.com/WordPress/WordPress" },
  { id: "static", name: "Static Site", category: "Frontend", icon: "📄", repo: "" },
]

function NewProjectPalette({
  onClose, onDeploy, step, setStep,
  search, setSearch,
  deployRepo, setDeployRepo, deployRegion, setDeployRegion,
  regions, selectedDb, setSelectedDb, selectedTemplate, setSelectedTemplate,
  dockerImage, setDockerImage, onToast,
}: PaletteProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [step])

  const ROOT_ITEMS = [
    {
      id: "github",
      label: "GitHub Repository",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" fill="#A8A29C"/>
        </svg>
      ),
      desc: "Deploy from a GitHub repository",
      badge: null,
    },
    {
      id: "gitlab",
      label: "GitLab Repository",
      icon: <span className="text-[18px]">🦊</span>,
      desc: "Deploy from GitLab",
      badge: null,
    },
    {
      id: "bitbucket",
      label: "Bitbucket Repository",
      icon: <span className="text-[18px]">🪣</span>,
      desc: "Deploy from Bitbucket",
      badge: null,
    },
    {
      id: "url",
      label: "Public Git URL",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="#A8A29C" strokeWidth="2" strokeLinecap="round"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="#A8A29C" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ),
      desc: "Any public Git repository URL",
      badge: null,
    },
    {
      id: "docker",
      label: "Docker Image",
      icon: <span className="text-[18px]">🐳</span>,
      desc: "Deploy a pre-built Docker image from any registry",
      badge: null,
    },
    {
      id: "database",
      label: "Database",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <ellipse cx="12" cy="5" rx="9" ry="3" stroke="#A8A29C" strokeWidth="1.75"/>
          <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" stroke="#A8A29C" strokeWidth="1.75"/>
          <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" stroke="#A8A29C" strokeWidth="1.75"/>
        </svg>
      ),
      desc: "PostgreSQL, MySQL, Redis, MongoDB & more",
      badge: null,
    },
    {
      id: "template",
      label: "Template",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#A8A29C" strokeWidth="1.75"/>
          <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#A8A29C" strokeWidth="1.75"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#A8A29C" strokeWidth="1.75"/>
          <path d="M14 17.5h7M17.5 14v7" stroke="#A8A29C" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      ),
      desc: "One-click deploys for popular stacks",
      badge: "12 available",
    },
    {
      id: "cli",
      label: "Flame CLI",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#A8A29C" strokeWidth="1.75"/>
          <path d="M7 9l4 4-4 4M13 17h4" stroke="#A8A29C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      desc: "Deploy from your terminal with npx flame",
      badge: null,
    },
    {
      id: "empty",
      label: "Empty Project",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#A8A29C" strokeWidth="1.75" strokeDasharray="4 2"/>
        </svg>
      ),
      desc: "Start with a blank canvas",
      badge: null,
    },
  ]

  const filteredRoot = ROOT_ITEMS.filter(
    (i) =>
      !search ||
      i.label.toLowerCase().includes(search.toLowerCase()) ||
      i.desc.toLowerCase().includes(search.toLowerCase())
  )

  const filteredRepos = GITHUB_REPOS.filter(
    (r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.lang.toLowerCase().includes(search.toLowerCase())
  )

  const filteredDbs = DATABASES.filter(
    (d) => !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.desc.toLowerCase().includes(search.toLowerCase())
  )

  const filteredTemplates = TEMPLATES.filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase())
  )

  const SUGGESTIONS = [
    "Deploy a Next.js + PostgreSQL app",
    "Set up a Redis cache",
    "Deploy a FastAPI backend",
    "Launch a Ghost blog",
  ]

  const stepTitle: Record<PaletteStep, string> = {
    root: "New project",
    github: "GitHub Repository",
    gitlab: "GitLab Repository",
    bitbucket: "Bitbucket Repository",
    docker: "Docker Image",
    database: "Database",
    template: "Template",
    cli: "Flame CLI",
    url: "Public Git URL",
    empty: "Empty Project",
  }

  const handleRootSelect = (id: string) => {
    if (id === "empty") {
      onToast("EMPTY PROJECT · created — add services from the canvas")
      onClose()
    } else {
      setStep(id as PaletteStep)
      setSearch("")
    }
  }

  const handleDbSelect = (db: typeof DATABASES[0]) => {
    setSelectedDb(db.id)
    onToast(`DATABASE · provisioning ${db.name} ${db.version}…`)
    onClose()
  }

  const handleTemplateSelect = (tpl: typeof TEMPLATES[0]) => {
    setSelectedTemplate(tpl.id)
    setDeployRepo(tpl.repo || `templates/${tpl.id}`)
    onToast(`TEMPLATE · ${tpl.name} — configuring…`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#050407]/90 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[600px] rounded-2xl border border-white/[0.1] bg-[#0D0B0E] shadow-[0_32px_80px_rgba(0,0,0,0.7)] overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
          {step !== "root" && (
            <button onClick={() => { setStep("root"); setSearch("") }} className="flex-shrink-0 h-7 w-7 grid place-items-center rounded-md hover:bg-white/[0.06] text-[#6B6560] hover:text-[#E8E6E3] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          {step === "root" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-[#6B6560]"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
            <div className="flex-shrink-0 mono text-[10.5px] tracking-[0.12em] uppercase text-[#FF4D1F] font-[650] bg-[#FF4D1F]/10 border border-[#FF4D1F]/25 px-2 h-5 flex items-center rounded">
              {stepTitle[step]}
            </div>
          )}
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={step === "root" ? "What would you like to create?" : step === "github" ? "Search repositories…" : step === "database" ? "Search databases…" : step === "template" ? "Search templates…" : step === "docker" ? "nginx:alpine, node:20, ghcr.io/..." : "Search…"}
            className="flex-1 bg-transparent text-[14.5px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none"
          />
          <button onClick={onClose} className="flex-shrink-0 h-7 w-7 grid place-items-center rounded-md hover:bg-white/[0.06] text-[#6B6560] hover:text-[#E8E6E3] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Root menu */}
        {step === "root" && (
          <div>
            {/* Suggestions */}
            {!search && (
              <div className="px-3 pt-3 pb-1 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => setSearch(s)} className="mono text-[10px] tracking-[0.08em] px-2.5 h-6 rounded-full border border-white/[0.06] text-[#6B6560] hover:text-[#A8A29C] hover:border-white/[0.12] transition-colors flex items-center gap-1.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 2L14.5 8.5H21L15.5 13L17 20L12 15.5L7 20L8.5 13L3 8.5H9.5L12 2Z" fill="currentColor"/></svg>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="py-2">
              {filteredRoot.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleRootSelect(item.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg border border-white/[0.08] bg-white/[0.02] grid place-items-center flex-shrink-0 group-hover:border-white/[0.16] transition-colors">
                      {item.icon}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-[550] text-[#E8E6E3] tracking-tight">{item.label}</span>
                        {item.badge && (
                          <span className="mono text-[9.5px] tracking-[0.1em] uppercase text-[#FF4D1F] bg-[#FF4D1F]/10 border border-[#FF4D1F]/20 px-1.5 h-4 flex items-center rounded">{item.badge}</span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#6B6560] font-[450] mt-0.5">{item.desc}</div>
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#4a4540] flex-shrink-0 group-hover:text-[#A8A29C] group-hover:translate-x-0.5 transition-all"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              ))}
              {filteredRoot.length === 0 && (
                <div className="px-4 py-8 text-center text-[13px] text-[#6B6560]">No results for "{search}"</div>
              )}
            </div>
          </div>
        )}

        {/* GitHub repos */}
        {step === "github" && (
          <form onSubmit={onDeploy} className="flex flex-col">
            <div className="overflow-y-auto max-h-[340px] divide-y divide-white/[0.04]">
              {filteredRepos.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => setDeployRepo(r.name)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.04] transition-colors text-left ${deployRepo === r.name ? "bg-[#FF4D1F]/[0.06] border-l-2 border-l-[#FF4D1F]" : "border-l-2 border-l-transparent"}`}
                >
                  <div className="flex items-center gap-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 12A10 10 0 0012 2z" fill={deployRepo === r.name ? "#FF4D1F" : "#6B6560"}/></svg>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono text-[13px] font-[600] text-[#E8E6E3]">{r.name}</span>
                        {r.private && <span className="mono text-[9px] tracking-[0.1em] uppercase text-[#FFBD2E] bg-[#FFBD2E]/10 border border-[#FFBD2E]/20 px-1.5 h-4 flex items-center rounded">private</span>}
                      </div>
                      <div className="text-[11px] text-[#6B6560] mt-0.5">{r.lang} · ⭐ {r.stars} · {r.updated}</div>
                    </div>
                  </div>
                  {deployRepo === r.name && (
                    <div className="h-5 w-5 rounded-full bg-[#FF4D1F] grid place-items-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#050407" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                </button>
              ))}
              {filteredRepos.length === 0 && (
                <div className="px-4 py-8 text-center text-[13px] text-[#6B6560]">No repos match "{search}"</div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
              <button type="button" className="mono text-[11px] tracking-[0.1em] uppercase text-[#FF4D1F] hover:underline">+ connect more repos</button>
              {deployRepo && (
                <button type="submit" className="h-9 px-5 rounded-lg bg-[#FF4D1F] text-[#050407] text-[13px] font-[650] hover:bg-[#FF5C2E] transition-colors flex items-center gap-2">
                  Deploy <span className="mono font-normal opacity-70">{deployRepo.split("/").pop()}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                </button>
              )}
            </div>
          </form>
        )}

        {/* GitLab */}
        {(step === "gitlab" || step === "bitbucket") && (
          <div className="px-4 py-6 space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-center">
              <div className="text-[24px] mb-2">{step === "gitlab" ? "🦊" : "🪣"}</div>
              <div className="text-[14px] font-[600] text-[#E8E6E3] mb-1">Connect {step === "gitlab" ? "GitLab" : "Bitbucket"}</div>
              <div className="text-[12px] text-[#6B6560] mb-4">Authorize Flame Core to access your {step === "gitlab" ? "GitLab" : "Bitbucket"} repositories</div>
              <button onClick={() => { onToast(`${step.toUpperCase()} · OAuth not yet configured — paste a Git URL instead`); setStep("url") }} className="h-10 px-5 rounded-lg bg-[#FF4D1F] text-[#050407] text-[13px] font-[650] hover:bg-[#FF5C2E] transition-colors">
                Connect {step === "gitlab" ? "GitLab" : "Bitbucket"} →
              </button>
            </div>
            <div className="text-center">
              <button onClick={() => setStep("url")} className="mono text-[11px] tracking-[0.1em] uppercase text-[#6B6560] hover:text-[#FF4D1F] transition-colors">or paste a Git URL →</button>
            </div>
          </div>
        )}

        {/* Public Git URL */}
        {step === "url" && (
          <form onSubmit={onDeploy} className="px-4 py-4 space-y-4">
            <div>
              <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Git repository URL</label>
              <input
                value={deployRepo}
                onChange={(e) => setDeployRepo(e.target.value)}
                placeholder="https://github.com/org/repo  or  git@gitlab.com:org/repo.git"
                className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3.5 mono text-[13px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50"
                autoFocus
                required
              />
              <div className="mt-1.5 text-[11px] text-[#6B6560]">Supports: GitHub · GitLab · Bitbucket · Gitea · any public HTTPS or SSH URL</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Branch</label>
                <input placeholder="main" className="w-full h-10 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[13px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
              </div>
              <div>
                <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Region</label>
                <select value={deployRegion} onChange={(e) => setDeployRegion(e.target.value)} className="w-full h-10 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[13px] text-[#E8E6E3] focus:outline-none focus:border-[#FF4D1F]/50">
                  {regions.filter(r => r.status === "live").map(r => <option key={r.code} value={r.code} className="bg-[#0a0709]">{r.flag} {r.city.toLowerCase()}-1</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className="w-full h-10 rounded-lg bg-[#FF4D1F] text-[#050407] text-[13px] font-[650] hover:bg-[#FF5C2E] transition-colors">
              Deploy →
            </button>
          </form>
        )}

        {/* Docker image */}
        {step === "docker" && (
          <form onSubmit={(e) => { e.preventDefault(); onToast(`DOCKER · pulling ${dockerImage || "image"}…`); onClose() }} className="px-4 py-4 space-y-4">
            <div>
              <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Image name & tag</label>
              <input
                value={dockerImage}
                onChange={(e) => setDockerImage(e.target.value)}
                placeholder="nginx:alpine"
                className="w-full h-11 rounded-lg border border-white/[0.08] bg-[#050407] px-3.5 mono text-[13px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50"
                autoFocus
                required
              />
              <div className="mt-1.5 text-[11px] text-[#6B6560]">Supports Docker Hub · GitHub GHCR · GitLab Registry · Quay.io · any private registry</div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3">
              <div className="mono text-[10px] tracking-[0.12em] uppercase text-[#6B6560] mb-2.5">Popular images</div>
              <div className="flex flex-wrap gap-1.5">
                {["node:20-alpine","nginx:alpine","python:3.12-slim","redis:7-alpine","postgres:17-alpine","go:1.22-alpine","rust:1-slim"].map((img) => (
                  <button key={img} type="button" onClick={() => setDockerImage(img)} className={`mono text-[11px] px-2.5 h-7 rounded-md border transition-colors ${dockerImage === img ? "border-[#FF4D1F]/50 bg-[#FF4D1F]/10 text-[#FF4D1F]" : "border-white/[0.08] text-[#A8A29C] hover:border-white/[0.2]"}`}>
                    {img}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Port</label>
                <input placeholder="3000" className="w-full h-10 rounded-lg border border-white/[0.08] bg-[#050407] px-3 mono text-[13px] text-[#E8E6E3] placeholder-[#4a4540] focus:outline-none focus:border-[#FF4D1F]/50" />
              </div>
              <div>
                <label className="mono text-[10px] font-[600] tracking-[0.14em] uppercase text-[#6B6560] block mb-2">Region</label>
                <select value={deployRegion} onChange={(e) => setDeployRegion(e.target.value)} className="w-full h-10 rounded-lg border border-white/[0.08] bg-[#050407] px-3 text-[13px] text-[#E8E6E3] focus:outline-none focus:border-[#FF4D1F]/50">
                  {regions.filter(r => r.status === "live").map(r => <option key={r.code} value={r.code} className="bg-[#0a0709]">{r.flag} {r.city.toLowerCase()}-1</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className="w-full h-10 rounded-lg bg-[#FF4D1F] text-[#050407] text-[13px] font-[650] hover:bg-[#FF5C2E] transition-colors">
              Deploy image →
            </button>
          </form>
        )}

        {/* Database selection */}
        {step === "database" && (
          <div className="overflow-y-auto max-h-[400px]">
            <div className="p-3 grid grid-cols-2 gap-2">
              {filteredDbs.map((db) => (
                <button
                  key={db.id}
                  onClick={() => handleDbSelect(db)}
                  className={`rounded-xl border p-4 text-left hover:border-[#FF4D1F]/40 hover:bg-[#FF4D1F]/[0.03] transition-colors group ${selectedDb === db.id ? "border-[#FF4D1F]/50 bg-[#FF4D1F]/[0.06]" : "border-white/[0.06] bg-white/[0.01]"}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-[22px]">{db.icon}</div>
                    <span className="mono text-[9.5px] tracking-[0.1em] uppercase text-[#6B6560] bg-white/[0.04] px-2 h-5 flex items-center rounded border border-white/[0.06]">v{db.version}</span>
                  </div>
                  <div className="text-[13.5px] font-[650] text-[#E8E6E3] mb-1">{db.name}</div>
                  <div className="text-[11px] leading-[1.4] text-[#6B6560] font-[450]">{db.desc}</div>
                </button>
              ))}
              {filteredDbs.length === 0 && (
                <div className="col-span-2 py-8 text-center text-[13px] text-[#6B6560]">No databases match "{search}"</div>
              )}
            </div>
          </div>
        )}

        {/* Template gallery */}
        {step === "template" && (
          <div className="overflow-y-auto max-h-[420px]">
            <div className="p-3 grid grid-cols-2 gap-2">
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleTemplateSelect(tpl)}
                  className={`rounded-xl border p-4 text-left hover:border-[#FF4D1F]/40 hover:bg-[#FF4D1F]/[0.03] transition-colors ${selectedTemplate === tpl.id ? "border-[#FF4D1F]/50 bg-[#FF4D1F]/[0.06]" : "border-white/[0.06] bg-white/[0.01]"}`}
                >
                  <div className="text-[22px] mb-2">{tpl.icon}</div>
                  <div className="text-[13.5px] font-[650] text-[#E8E6E3] mb-0.5">{tpl.name}</div>
                  <div className="mono text-[10px] tracking-[0.1em] uppercase text-[#6B6560]">{tpl.category}</div>
                </button>
              ))}
              {filteredTemplates.length === 0 && (
                <div className="col-span-2 py-8 text-center text-[13px] text-[#6B6560]">No templates match "{search}"</div>
              )}
            </div>
          </div>
        )}

        {/* CLI instructions */}
        {step === "cli" && (
          <div className="px-4 py-5 space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-[#050407] p-4 mono text-[12.5px] leading-[1.9]">
              <div className="text-[#6B6560]"># Install Flame CLI</div>
              <div className="text-[#E8E6E3]">$ <span className="text-[#27D17F]">npm</span> install -g @flamecore/cli</div>
              <div className="text-[#6B6560] mt-2"># Login</div>
              <div className="text-[#E8E6E3]">$ <span className="text-[#27D17F]">flame</span> login</div>
              <div className="text-[#6B6560] mt-2"># Deploy from current directory</div>
              <div className="text-[#E8E6E3]">$ <span className="text-[#27D17F]">flame</span> deploy</div>
              <div className="text-[#6B6560] mt-2"># Or deploy a specific service</div>
              <div className="text-[#E8E6E3]">$ <span className="text-[#27D17F]">flame</span> deploy --service api --region los1</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard?.writeText("npm install -g @flamecore/cli"); onToast("COPIED · npm install -g @flamecore/cli") }} className="flex-1 h-9 rounded-lg border border-white/[0.08] text-[12px] font-[550] text-[#A8A29C] hover:text-[#E8E6E3] hover:border-white/[0.16] transition-colors">
                Copy install command
              </button>
              <button onClick={() => { onToast("CLI DOCS · opening…") }} className="flex-1 h-9 rounded-lg bg-[#FF4D1F] text-[#050407] text-[12px] font-[650] hover:bg-[#FF5C2E] transition-colors">
                View CLI docs →
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-white/[0.05] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 mono text-[10px] tracking-wide text-[#4a4540]">
            {step === "root" && (
              <>
                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border border-white/[0.1] text-[10px]">↑↓</kbd> navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border border-white/[0.1] text-[10px]">↵</kbd> select</span>
                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded border border-white/[0.1] text-[10px]">Esc</kbd> close</span>
              </>
            )}
            {step !== "root" && (
              <button onClick={() => { setStep("root"); setSearch("") }} className="flex items-center gap-1 hover:text-[#A8A29C] transition-colors">
                <kbd className="px-1.5 py-0.5 rounded border border-white/[0.1] text-[10px]">Esc</kbd> back to menu
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded-md bg-[#FF4D1F] grid place-items-center">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M12 2C12 2 7 7 7 12C7 14.5 8.5 16 10 16C10 14 11 13 12 13C13 13 14 14 14 16C15.5 16 17 14.5 17 12C17 7 12 2 12 2Z" fill="#050407"/></svg>
            </div>
            <span className="mono text-[10px] text-[#4a4540]">flamecore.app</span>
          </div>
        </div>
      </div>
    </div>
  )
}
