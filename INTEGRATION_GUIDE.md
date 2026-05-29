# ============================================================
# Flame Core — Integrated Website & Platform Architecture
# ============================================================
#
# This document explains how the FlameCore Technologies main website
# integrates with the Flame Core hosting platform to create a unified
# developer experience.
#

## OVERVIEW
============================================================

The ecosystem consists of two interconnected applications:

### 1. Marketing Website (FlameCore Technologies)
- **Purpose:** Main landing page, service showcase, company information
- **Domain:** flamecoretechltd.com
- **Tech:** React + TypeScript + Tailwind CSS (Vite)
- **Location:** `flamecore-technologies-website-development (1)/`
- **Key page:** "Hosting" section with direct link to platform

### 2. Hosting Platform (Flame Core)
- **Purpose:** Developer console, deployment management, billing
- **Domain:** hosting.flamecoretechltd.com (or /hosting path)
- **Tech:** React + TypeScript + Tailwind CSS (Vite) + Fastify API
- **Location:** `src/` (frontend) and `backend/` (API)
- **Key features:** Deploy from GitHub, manage domains, track metrics

---

## INTEGRATION POINTS
============================================================

### User Journey

```
User visits:
flamecoretechltd.com
         ↓
Browses services
         ↓
Clicks "Hosting" section
         ↓
Sees "Launch your apps with one click" CTA
         ↓
Clicks "Access Hosting Platform" button
         ↓
Redirected to:
hosting.flamecoretechltd.com
         ↓
Logs in with GitHub OAuth
         ↓
Deployed to: https://flame-app-xyz.flame.app
```

### Technical Routing

```
Frontend: Marketing Site                Frontend: Hosting Platform
   (5173)                                   (5174)
     ↓                                         ↓
Nginx/Vite dev                          Nginx/Vite dev
     ↓                                         ↓
flamecoretechltd.com              hosting.flamecoretechltd.com
     ↓                                         ↓
              Both proxy to Backend API
                    ↓
              Fastify (3001) + PostgreSQL + Redis
```

---

## ENVIRONMENT CONFIGURATION
============================================================

### Development Setup

```bash
# Terminal 1: Marketing website
cd flamecore-technologies-website-development\ \(1\)
npm install
npm run dev
# Runs on: http://localhost:5173

# Terminal 2: Hosting platform frontend
cd src
npm install
npm run dev
# Runs on: http://localhost:5174

# Terminal 3: Backend API
cd backend
npm install
docker-compose up -d  # Start PostgreSQL + Redis
npm run dev
# Runs on: http://localhost:3001
```

### Production Setup

See `PRODUCTION_DEPLOYMENT.md` for full VPS setup.

Key differences:
- Both frontends built to static files
- Nginx serves both from different locations
- Single backend API handles both
- Single PostgreSQL database
- All on HTTPS with SSL certificates

---

## DOMAIN ARCHITECTURE
============================================================

### Current Setup (Single VPS)

```
VPS IP: xxx.xxx.xxx.xxx

DNS Records:
- flamecoretechltd.com       A record → VPS IP
- www.flamecoretechltd.com   A record → VPS IP (redirects to root)
- hosting.flamecoretechltd.com A record → VPS IP
- api.flamecoretechltd.com   A record → VPS IP (optional, if separate)

Nginx routing:
- flamecoretechltd.com       → /var/www/flamecore-website/dist
- hosting.flamecoretechltd.com → /var/www/flamecore-hosting/dist
- /api/v1/*                  → Fastify backend (localhost:3001)
```

### Future Setup (Multi-Domain or Multi-Region)

```
Example: Separate API domain
- Marketing: flamecoretechltd.com
- Platform: platform.flamecoretechltd.com (or hosting.flamecoretechltd.com)
- API: api.flamecoretechltd.com (separate server)
- Workers: Region-specific worker nodes

Example: Custom domain for customers
- Customer app: myapp.flame.app
- Wildcard DNS: *.flame.app A record → Nginx
- Nginx routes to customer container based on Host header
```

---

## FILE STRUCTURE
============================================================

```
flame-core/
│
├── .env.production              ← Master production config
├── .env.example                 ← Frontend env template
├── nginx.conf.production        ← Nginx production config
├── PRODUCTION_DEPLOYMENT.md     ← This deployment guide
│
├── flamecore-technologies-website-development (1)/
│   ├── src/
│   │   ├── App.tsx              ← Main marketing site
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── src/                         ← Hosting platform frontend
│   ├── App.tsx                  ← Main console app
│   ├── features/
│   │   ├── console/
│   │   │   ├── Console.tsx
│   │   │   ├── HouseDashboard.tsx
│   │   │   ├── HouseView.tsx
│   │   │   ├── RoomPanel.tsx
│   │   │   ├── useConsole.ts    ← State management
│   │   │   └── types.ts
│   │   └── ...
│   ├── utils/
│   │   └── env-config.ts        ← Domain routing config
│   ├── api/
│   │   └── client.ts            ← API client
│   ├── main.tsx
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── index.ts             ← Fastify server
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── oauth.ts
│   │   │   ├── projects.ts
│   │   │   ├── deployments.ts
│   │   │   └── ...
│   │   ├── engine/
│   │   │   ├── deploymentQueue.ts   ← BullMQ worker (ACTIVE!)
│   │   │   ├── dockerEngine.ts
│   │   │   ├── nginxEngine.ts
│   │   │   └── ...
│   │   └── services/
│   │       ├── projectService.ts
│   │       ├── deploymentService.ts
│   │       └── ...
│   ├── package.json
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── ecosystem.config.js      ← PM2 config (optional)
│
├── ARCHITECTURE.md              ← Technical design
├── MVP_REFINEMENTS.md           ← Implementation details
└── README.md                    ← Quick start
```

---

## KEY FILES FOR INTEGRATION
============================================================

### 1. Environment Configuration

**File:** `src/utils/env-config.ts`
**Purpose:** Single source of truth for domain routing
**Used by:** Marketing site (gets hosting platform URL), Hosting platform (API calls)

```typescript
// Get URL to hosting platform
getHostingConsoleUrl() // → https://hosting.flamecoretechltd.com or localhost:5174

// Get API URL
getApiUrl('/teams/123/projects') // → https://api.flamecoretechltd.com/api/v1/teams/123/projects

// Check which site current user is on
isMarketingSite()  // true if on flamecoretechltd.com
isHostingPlatform() // true if on hosting.flamecoretechltd.com
```

### 2. Marketing Site Hosting Section

**File:** `flamecore-technologies-website-development (1)/src/App.tsx`
**Key section:** Lines ~616-700 (Hosting section)
**Change:** Added prominent CTA button linking to hosting platform:

```typescript
<a href={getHostingConsoleUrl()} target="_blank" rel="noopener noreferrer" className="...">
  Access Hosting Platform →
</a>
```

### 3. Backend API Client

**File:** `src/api/client.ts`
**Purpose:** Handles all HTTP calls to Fastify backend
**Features:**
- Team-scoped endpoints
- Multi-currency support
- OAuth integration
- Deployment management

### 4. Hosting Console State

**File:** `src/features/console/useConsole.ts`
**Purpose:** Centralized state management for hosting platform
**Features:**
- Project/deployment data loading from API
- Navigation between views (dashboard → house → room)
- Deploy modal state
- Environment variable management

---

## DEPLOYMENT FLOW
============================================================

### Development

```bash
# 1. Start all services
Terminal 1: npm run dev (hosting frontend)
Terminal 2: npm run dev (marketing website)
Terminal 3: npm run dev (backend API)

# 2. Access
Marketing: http://localhost:5173
Hosting:   http://localhost:5174
API:       http://localhost:3001

# 3. Test integration
Visit http://localhost:5173
Click "Hosting" button
Should redirect to http://localhost:5174
```

### Production

```bash
# 1. Build both frontends
cd flamecore-technologies-website-development (1) && npm run build
cd src && npm run build

# 2. Copy to server
scp -r dist/* flamecore@vps:/var/www/flamecore-website/dist
scp -r dist/* flamecore@vps:/var/www/flamecore-hosting/dist

# 3. Start backend (on VPS)
cd backend && docker-compose up -d

# 4. Reload Nginx
sudo systemctl reload nginx

# 5. Test
curl https://flamecoretechltd.com
curl https://hosting.flamecoretechltd.com
curl https://api.flamecoretechltd.com/api/health
```

---

## NGINX ROUTING LOGIC
============================================================

### Request flow

```
Client requests: https://flamecoretechltd.com
         ↓
Nginx checks Host header
         ↓
Matches server block for flamecoretechltd.com
         ↓
Serves static files from /var/www/flamecore-website/dist/
         ↓
SPA handles routing (React Router)
         ↓
When user clicks "Hosting" link
         ↓
Browser navigates to: https://hosting.flamecoretechltd.com
         ↓
Nginx checks Host header
         ↓
Matches server block for hosting.flamecoretechltd.com
         ↓
Serves files from /var/www/flamecore-hosting/dist/
         ↓
When app makes API call to /api/v1/projects
         ↓
Nginx location block matches /api/v1
         ↓
Proxy passes to Fastify backend (localhost:3001)
         ↓
Backend returns JSON
```

---

## CORS & SECURITY
============================================================

### CORS Configuration

Both frontends must be allowed to call the backend:

```typescript
// backend/src/index.ts
CORS_ORIGINS = "https://flamecoretechltd.com,https://hosting.flamecoretechltd.com"
```

### Security Headers (Nginx)

All domains get these headers:

```
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
```

### OAuth Flow

1. User clicks "Sign in with GitHub" (on hosting platform)
2. Redirected to GitHub login
3. Callback URL: `https://api.flamecoretechltd.com/api/v1/oauth/github/callback`
4. Backend generates JWT
5. Frontend stores in localStorage
6. All API calls include `Authorization: Bearer JWT`

---

## ENVIRONMENT VARIABLES QUICK REFERENCE
============================================================

### Marketing Website

```bash
VITE_MAIN_DOMAIN=https://flamecoretechltd.com
VITE_HOSTING_DOMAIN=https://hosting.flamecoretechltd.com
VITE_API_URL=https://api.flamecoretechltd.com
```

### Hosting Platform

```bash
VITE_HOSTING_DOMAIN=https://hosting.flamecoretechltd.com
VITE_API_URL=https://api.flamecoretechltd.com
```

### Backend

```bash
API_URL_PUBLIC=https://api.flamecoretechltd.com
CORS_ORIGINS=https://flamecoretechltd.com,https://hosting.flamecoretechltd.com
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
GITHUB_CALLBACK_URL=https://api.flamecoretechltd.com/api/v1/oauth/github/callback
```

---

## TROUBLESHOOTING
============================================================

### "Cannot reach hosting platform"

```bash
# Check if both frontends built correctly
ls /var/www/flamecore-website/dist/index.html
ls /var/www/flamecore-hosting/dist/index.html

# Check Nginx config
sudo nginx -t

# Check Nginx is running
sudo systemctl status nginx

# Check backend is running
curl http://localhost:3001/api/health
```

### "API calls return 403 (CORS)"

```bash
# Verify CORS_ORIGINS in .env
echo $CORS_ORIGINS

# Make sure both domain HTTPS URLs are included:
# https://flamecoretechltd.com
# https://hosting.flamecoretechltd.com

# Restart backend
docker-compose restart api
```

### "Marketing site links to wrong hosting URL"

```bash
# Check env-config.ts logic
cat src/utils/env-config.ts

# Verify VITE_HOSTING_DOMAIN env var
grep VITE_HOSTING_DOMAIN .env.production

# Rebuild frontend
npm run build

# Clear browser cache (Cmd+Shift+Delete)
```

### "SSL certificate not working"

```bash
# Check certificate validity
sudo certbot certificates

# View SSL config in Nginx
grep ssl_certificate /etc/nginx/sites-available/flamecore

# Force renewal
sudo certbot renew --force-renewal
```

---

## MONITORING & UPDATES
============================================================

### Daily checks

```bash
# Website availability
curl -I https://flamecoretechltd.com
curl -I https://hosting.flamecoretechltd.com

# API health
curl https://api.flamecoretechltd.com/api/health

# Service status
docker-compose ps
systemctl status nginx
```

### Deployment updates

```bash
# Pull latest code
git pull origin main

# Rebuild frontend
npm run build

# Copy to production
sudo cp -r dist/* /var/www/flamecore-website/dist/
sudo cp -r dist/* /var/www/flamecore-hosting/dist/

# Rebuild backend (if changes)
docker-compose up -d --build

# Reload Nginx
sudo systemctl reload nginx
```

---

## SUCCESS CRITERIA
============================================================

- [ ] Marketing website accessible at flamecoretechltd.com
- [ ] "Hosting" section visible and clickable
- [ ] Clicking "Access Hosting Platform" navigates to hosting.flamecoretechltd.com
- [ ] Hosting platform loads and shows login page
- [ ] GitHub OAuth works (connects to flamecore GitHub account)
- [ ] Can create new project and trigger deployment
- [ ] Deployments appear in real-time in console
- [ ] All HTTPS with valid SSL certificates
- [ ] No console errors (F12 → Console tab)
- [ ] API calls succeed (F12 → Network tab)
- [ ] Performance: LCP < 2.5s, FID < 100ms

---

## NEXT STEPS
============================================================

1. ✅ Set up domain DNS records (point to VPS IP)
2. ✅ Configure .env.production with all credentials
3. ✅ Provision SSL certificates
4. ✅ Deploy applications to VPS
5. ✅ Configure Nginx routing
6. ✅ Test all integration points
7. [ ] Set up monitoring & alerts
8. [ ] Configure backups
9. [ ] Write API documentation
10. [ ] Plan scaling strategy

---

Generated: May 2026
Version: 1.0.0
Maintained by: FlameCore Team
