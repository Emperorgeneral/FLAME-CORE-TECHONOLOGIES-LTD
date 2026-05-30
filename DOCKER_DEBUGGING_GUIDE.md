# Docker dist/ Module Not Found - Complete Debugging Guide

## Problem Statement
🔴 **CRITICAL BLOCKER**: Backend API container keeps restarting with:
```
Error: Cannot find module '/app/dist/index.js'
```

The Docker build succeeds, TypeScript compiles without errors, but at runtime the compiled files cannot be found.

---

## Root Cause Analysis

### What We Know ✅
- `npm run build` (tsc) completes successfully in Dockerfile
- TypeScript compiles locally without errors
- Docker build reports all 12 stages as FINISHED
- PostgreSQL and Redis containers start healthy
- .dockerignore file exists and doesn't exclude dist/

### Likely Causes 🔍
1. **Docker layer caching** - Old image used instead of rebuilt version
2. **File ownership/permissions** - dist/ created as root but not readable by app
3. **Volume mounting issue** - dist/ created but not persisted to final layer
4. **TypeScript build output issue** - tsc not creating expected files
5. **Working directory mismatch** - Build runs in /app but CMD tries different location

---

## Solution: VPS Execution Steps

### Step 1: Pull Latest Code Changes
Your local changes have been pushed to GitHub with verbose debugging output in Dockerfile.

```bash
cd ~/flame-core
git pull origin main
```

Changes included:
- Updated Dockerfile with detailed build logging
- New `.dockerignore` file to properly manage what Docker copies
- Added verification steps to confirm dist/index.js exists

### Step 2: Clean Docker Environment
This removes cached layers that might have old build results:

```bash
cd backend
docker-compose down                    # Stop containers
docker system prune -a --volumes       # Remove old images/volumes (DESTRUCTIVE)
```

⚠️ **WARNING**: `docker system prune -a` removes ALL unused images/volumes. If you have other projects using Docker, this will affect them.

### Step 3: Force Fresh Build (No Cache)
```bash
docker-compose build --no-cache
```

This will:
- Pull fresh node:20-alpine base image
- Install dependencies fresh
- Compile TypeScript fresh
- Create dist/ folder fresh
- **NOT** use any cached layers

### Step 4: Start Containers
```bash
docker-compose up -d
```

### Step 5: Monitor Build Verification Output
```bash
# Watch logs in real-time
docker-compose logs -f api

# Or grep for specific messages
docker-compose logs api | grep -E "(Source files|Build complete|dist/index.js exists|ERROR)" | head -20
```

**Expected to see**:
```
Source files:
total X
drwxr-xr-x ...
-rw-r--r-- ... index.ts
Build complete
... (ls -la output showing many compiled .js files)
dist/index.js exists!
```

### Step 6: Verify dist/ in Running Container
```bash
# Check that dist/ exists inside the container
docker-compose exec api ls -la dist/

# Verify index.js is there
docker-compose exec api cat dist/index.js | head -10
```

---

## If API Still Restarting

### Option A: Check Full Logs
```bash
docker-compose logs api --tail=100
```

Look for:
- "Build complete" message (confirms build ran)
- "ERROR: dist/index.js not found!" (confirms verification failed)
- "Cannot find module" (confirms runtime failure)

### Option B: Manual Build Inside Container
```bash
# Start a shell in the container without starting the app
docker-compose run api /bin/sh

# Inside the container, run these:
npm install                    # Reinstall dependencies
npm run build                  # Rebuild TypeScript
ls -la dist/                   # Check if dist/ created
cat tsconfig.json              # Verify TypeScript config
```

### Option C: Check Image Directly (Without Container)
```bash
# Build the image but don't run it
docker build -t test-api backend/

# Run a one-off container with that image
docker run --rm test-api ls -la dist/
```

### Option D: Detailed Build Output
```bash
# Rebuild and capture ALL output
docker-compose build --no-cache --progress=plain api 2>&1 | tee build.log

# Search for any errors
grep -i error build.log

# Search for TypeScript output
grep -i "tsc\|typescript" build.log
```

---

## Verification Checklist

- [ ] `git pull origin main` completed on VPS
- [ ] `docker-compose down` stopped all containers
- [ ] `docker system prune -a --volumes` cleaned environment
- [ ] `docker-compose build --no-cache` completed without errors
- [ ] `docker-compose up -d` started containers
- [ ] `docker-compose logs api | head -50` shows build verification output
- [ ] `docker-compose exec api ls -la dist/` shows files exist
- [ ] `docker ps` shows api container in "Up" state (not Restarting)
- [ ] `curl http://localhost:3001/api/health` returns 200 OK

---

## Next Steps After Fix

Once API container is stable (running, not restarting):

1. **Initialize Database**:
   ```bash
   cd backend
   npm run db:init
   ```

2. **Build Frontend Apps**:
   ```bash
   cd ../src
   npm install
   npm run build
   
   # Build marketing website (path depends on your setup)
   ```

3. **Deploy to Nginx**:
   ```bash
   sudo cp -r ../src/dist/* /var/www/hosting/
   sudo systemctl reload nginx
   ```

4. **Setup SSL**:
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com
   ```

---

## Debugging Tips

### Real-time Monitoring
```bash
# Terminal 1: Watch logs
docker-compose logs -f api

# Terminal 2: Check container status
while true; do docker-compose ps; sleep 5; done

# Terminal 3: Run debug commands
docker-compose exec api sh
```

### Common Issues Checklist

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Cannot find module" | dist/ not created | Check build logs for tsc errors |
| Container exits with 0 | Entry not starting | Check node dist/index.js manually |
| Permission denied on dist/ | File permissions | `docker-compose exec api chmod -R 755 dist/` |
| Build seems cached | Old layer used | Add `--no-cache` flag to build |
| Files missing after build | .dockerignore excludes them | Check .dockerignore contents |

---

## Dockerfile Changes Made

The updated Dockerfile now includes:

```dockerfile
# Before copying source, install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Add diagnostic output
RUN echo "Source files:" && ls -la src/ && echo "Package.json:" && head -5 package.json

# Build TypeScript
RUN npm run build && echo "Build complete" && ls -la

# Verify build succeeded (will FAIL if dist/index.js doesn't exist)
RUN test -f dist/index.js || (echo "ERROR: dist/index.js not found!" && ls -la dist/ 2>&1 && exit 1) && echo "dist/index.js exists!"

# Start the server
CMD ["node", "dist/index.js"]
```

The key addition is the verification step that will fail the entire Docker build if dist/index.js doesn't exist, making issues visible during build instead of runtime.

---

## For Advanced Debugging

### Get Into the Docker Builder
```bash
# Start a debugging container that mirrors the build environment
docker run -it --rm -v $(pwd)/backend:/workspace node:20-alpine /bin/sh

# Inside that container:
cd /workspace
npm install
npm run build
ls -la dist/
```

### Compare Local vs Docker Build
```bash
# Local build (runs on your VPS machine directly)
cd backend
npm install
npm run build
ls -la dist/

# This tells you if the issue is Docker-specific or build-specific
```

### Check Docker Version Compatibility
```bash
docker version
docker-compose version  # or docker compose version for V2

# Check if there are known issues with your Docker version
docker-compose build --help | grep -i cache
```

---

## Success Criteria

The fix is successful when:
1. ✅ `docker-compose ps` shows `flamecore-api` with status `Up`
2. ✅ Container is NOT in "Restarting" state
3. ✅ `docker-compose logs api` shows no "Cannot find module" errors
4. ✅ `curl http://localhost:3001/api/health` returns a response (any status code, not a connection error)
5. ✅ Container has been running for > 10 seconds without restarting

---

## Questions to Answer If Issues Persist

1. What's the exact error message from `docker-compose logs api`?
2. Does `docker-compose exec api ls -la dist/` show files?
3. Does `docker-compose exec api npm run build` work inside the container?
4. What's the output of `docker-compose build --no-cache --progress=plain api 2>&1 | grep -i "RUN npm run build" -A 20`?
5. Is there a `.dockerignore` file that might be excluding dist/?

---

**Last Updated**: After pushing Dockerfile changes to GitHub
**Files Modified**: backend/Dockerfile, backend/.dockerignore
**Commits**: 0d746f3 (Add .dockerignore and verbose build debugging)
