# 🚀 VPS QUICK START - Docker Backend Fix

## Current Status
🔴 **BLOCKER**: Backend API container restarting with `Cannot find module '/app/dist/index.js'`

✅ **COMPLETED**: Enhanced Dockerfile with debugging, created .dockerignore, comprehensive guides pushed to GitHub

---

## ⚡ Execute These 6 Commands on Your VPS

### 1. Pull Latest Code
```bash
cd ~/flame-core
git pull origin main
```

### 2. Stop Everything
```bash
cd backend
docker-compose down
```

### 3. Clean Docker (Remove Cached Layers)
```bash
docker system prune -a --volumes
```
⚠️ This removes ALL unused Docker images/volumes - safe if only using Docker for this project.

### 4. Rebuild Without Cache
```bash
docker-compose build --no-cache
```
Should see verbose output with "Build complete" and "dist/index.js exists!"

### 5. Start Containers
```bash
docker-compose up -d
```

### 6. Verify Success
```bash
# Should show: flamecore-api  Up (not "Restarting")
docker-compose ps

# Should see build verification messages
docker-compose logs api | head -40

# Check dist/ folder exists in container
docker-compose exec api ls -la dist/
```

---

## ✅ Success Looks Like
- `docker-compose ps` shows `flamecore-api` with status `Up` ✅
- Container is NOT restarting
- `docker-compose logs api` shows no error messages
- `docker-compose exec api ls -la dist/` shows many .js files ✅

---

## ❌ If Still Failing

Read `DOCKER_DEBUGGING_GUIDE.md` in the repository for:
- Advanced debugging techniques
- Manual build troubleshooting
- Container inspection commands
- Common issues checklist

---

## 📋 After API is Fixed

Once backend API is running:

```bash
# 1. Initialize database
npm run db:init

# 2. Build frontend (from repo root)
cd ../src
npm install
npm run build

# 3. Copy to webroot
sudo cp -r dist/* /var/www/hosting/

# 4. Reload Nginx
sudo systemctl reload nginx
```

---

## 🔍 Key Files Updated
- `backend/Dockerfile` - Added verbose build logging + verification
- `backend/.dockerignore` - Proper Docker build context control
- `DOCKER_DEBUGGING_GUIDE.md` - Comprehensive troubleshooting guide
- `SESSION_SUMMARY.md` - Full session documentation

All committed and pushed to GitHub!

---

**Next Action**: Execute the 6 commands above on your VPS and report the output.
