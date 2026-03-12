# LearnX Docker Setup - Complete Summary

## ✅ Setup Complete!

All Docker services are now running successfully:

### Services Status
- ✅ **PostgreSQL** (Port 5432) - Healthy, migrations applied
- ✅ **Redis** (Port 6379) - Healthy
- ✅ **Qdrant** (Port 6333-6334) - Running
- ✅ **ASR Server** (Port 8000) - Healthy, models loaded
- ✅ **Backend API** (Port 3001) - Running, all databases connected

## What Was Done

### 1. Enhanced docker-compose.yml
- Added PostgreSQL 16 service
- Added Qdrant vector database
- Added ASR server configuration
- Configured health checks for all services
- Set up named volumes for data persistence
- Removed obsolete MongoDB dependency

### 2. Created ASR Server Dockerfile
- Python 3.11-slim base image
- Installed ffmpeg and system dependencies
- Added health check endpoint
- Configured Vosk models support

### 3. Fixed Backend API Container Issues

**Problem**: Container kept restarting with "nodemon: not found" error (exit code 127)

**Root Cause**: 
- Node.js 18 incompatible with newer dependencies (undici@7.16.0, cheerio@1.1.2 require Node 20.18.1+)
- Windows-built node_modules incompatible with Alpine Linux container

**Solutions Implemented**:
1. **Upgraded to Node.js 20**: Changed Dockerfile from `node:18-alpine` to `node:20-alpine`
2. **Created docker-entrypoint.sh**: Ensures dependencies are installed in container before starting
3. **Added nodemon.json**: Configured nodemon to use `node --require ts-node/register` instead of direct ts-node
4. **Named volume for node_modules**: Changed from anonymous to named volume (`api_node_modules`) to persist container-built dependencies

### 4. Applied Database Migrations
Migrations automatically executed on startup:
- ✅ 001_initial_schema.sql
- ✅ 002_progress_without_fk.sql  
- ✅ 003_video_summaries_glossaries.sql
- ✅ 004_chat_history.sql

### 5. Created Helper Scripts

#### .\start-docker.ps1
Interactive startup script that:
- Verifies Docker is running
- Checks Vosk models are present
- Lets you choose service profiles (core/admin/legacy/all)
- Monitors service health
- Offers to start frontend

#### .\stop-docker.ps1
Graceful shutdown with options to:
- Keep or remove volumes
- View final logs
- Clean up resources

#### .\status-docker.ps1
Shows resource usage and health of all services

#### .\check-docker-status.ps1
Quick status check showing:
- Container status
- API health (uptime, database connections)
- ASR server health  
- Service URLs
- Quick commands reference

### 6. Documentation
Created comprehensive DOCKER_SETUP.md with:
- Prerequisites
- Quick start guide
- Service configuration details
- Troubleshooting section
- Development workflow
- Production considerations

## How to Use

### Daily Usage

**Start Services**:
```powershell
cd backend
.\start-docker.ps1  # Interactive
# OR
docker-compose up -d  # Direct
```

**Check Status**:
```powershell
.\check-docker-status.ps1
```

**View Logs**:
```powershell
docker-compose logs -f api        # Backend API
docker-compose logs -f postgres   # Database
docker-compose logs -f asr-server # Speech recognition
```

**Stop Services**:
```powershell
.\stop-docker.ps1  # Interactive
# OR
docker-compose down  # Direct
```

### Testing the API

**Health endpoint**:
```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2026-03-07T21:22:03.000Z",
  "uptime": 123.45,
  "environment": "development",
  "databases": {
    "postgres": true,
    "qdrant": true
  }
}
```

### Testing ASR Server

**Health endpoint**:
```powershell
Invoke-RestMethod http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "models_loaded": true
}
```

## Technical Details

### Node.js Version Requirement
**IMPORTANT**: The backend requires Node.js 20+ due to:
- `undici@7.16.0` (used by cheerio) requires Node.js >= 20.18.1
- `cheerio@1.1.2` requires Node.js >= 20.18.1

The Dockerfile now uses `node:20-alpine` to satisfy these requirements.

### Nodemon Configuration
Created `nodemon.json` to work around ts-node PATH issues:
```json
{
  "watch": ["src"],
  "ext": "ts,json",
  "ignore": ["src/**/*.spec.ts"],
  "exec": "node --require ts-node/register src/server.ts"
}
```

### Docker Entrypoint
The `docker-entrypoint.sh` ensures node_modules are installed before starting:
```bash
#!/bin/sh
echo "Checking node_modules..."
if [ ! -d "node_modules/nodemon" ]; then
  echo "Installing dependencies..."
  npm ci --include=dev
fi
exec "$@"
```

### Volume Strategy
- **Named volumes** for databases (postgres_data, redis_data, qdrant_storage)
- **Named volume** for API node_modules (api_node_modules) to isolate from host
- **Bind mount** for API source code (.) to enable hot reload

## Service URLs Reference

| Service | URL | Credentials |
|---------|-----|-------------|
| Backend API | http://localhost:3001 | - |
| PostgreSQL | localhost:5432 | postgres / 1234 |
| Redis | localhost:6379 | redis123 |
| Qdrant | http://localhost:6333 | - |
| ASR Server | http://localhost:8000 | - |

### Admin UIs (--profile admin)
| Service | URL | Credentials |
|---------|-----|-------------|
| pgAdmin | http://localhost:5050 | admin@learnx.com / admin123 |
| Redis Commander | http://localhost:8082 | - |

## Next Steps

### 1. Start the Frontend
```powershell
cd ..  # Back to project root
pnpm install
pnpm dev
```
Access at: http://localhost:3000

### 2. Test Video Upload
- Navigate to http://localhost:3000/teacher/upload
- Upload a video to test the full pipeline

### 3. Test Learning Features
- View video at http://localhost:3000/learn/[videoId]
- Try the AI tools (quiz, flashcards, summary, etc.)

## Troubleshooting

### If API Container Restarts
```powershell
# View logs
docker logs backend-api-1 --tail=50

# Rebuild from scratch
docker-compose down api
docker volume rm backend_api_node_modules
docker-compose build --no-cache api
docker-compose up -d api
```

### If Dependencies Issue Persists
The container needs to use its own node_modules built with Alpine Linux, not Windows modules. The named volume ensures this separation.

### Database Connection Issues
Wait 10-20 seconds after startup. The API automatically retries connections.

### Memory Issues
Increase Docker Desktop memory allocation to 8GB+ in Settings.

## Files Created/Modified

### Created
- `backend/Dockerfile` (enhanced for Node 20)
- `backend/docker-entrypoint.sh` (dependency check)
- `backend/nodemon.json` (TypeScript config)
- `backend/DOCKER_SETUP.md` (comprehensive guide)
- `backend/start-docker.ps1` (interactive startup)
- `backend/stop-docker.ps1` (graceful shutdown)
- `backend/status-docker.ps1` (health monitoring)
- `backend/check-docker-status.ps1` (quick status)
- `asr-server/Dockerfile` (ASR containerization)
- `asr-server/.gitignore` (exclude models)

### Modified
- `backend/docker-compose.yml` (added services, fixed dependencies, Node 20)
- `backend/.env` (added Docker networking comments)
- `asr-server/server.py` (added /health endpoint)

## Key Learnings

1. **Node.js Version Matters**: Modern packages require Node 20+
2. **Cross-Platform Issues**: Windows node_modules don't work in Alpine Linux containers
3. **Volume Isolation**: Named volumes for node_modules prevent host/container conflicts
4. **Health Checks**: Essential for Docker Compose dependencies
5. **Entrypoint Scripts**: Useful for ensuring environment is ready before main process

## Support

- **Documentation**: See `backend/DOCKER_SETUP.md`
- **Logs**: `docker-compose logs -f [service]`
- **Status**: `.\check-docker-status.ps1`
- **Rebuild**: `docker-compose build --no-cache [service]`

---

**Setup completed successfully on**: March 7, 2026
**Docker Compose Version**: 5.0.2
**Node.js Version (Container)**: 20
**PostgreSQL Version**: 16-alpine
**Python Version (ASR)**: 3.11-slim
