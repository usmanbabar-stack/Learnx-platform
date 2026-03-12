# LearnX Platform - Docker Setup Guide

## Overview

This docker-compose configuration includes all necessary services for the LearnX platform:

- **postgres**: PostgreSQL 16 (Primary Database) - Port 5432
- **mongodb**: MongoDB 7 (Legacy/Optional) - Port 27017
- **redis**: Redis 7 (Caching) - Port 6379
- **qdrant**: Qdrant (Vector Database) - Port 6333
- **asr-server**: Vosk ASR (Speech Recognition) - Port 8000
- **api**: Backend Express API - Port 3001

### Admin Interfaces (Optional)
- **pgadmin**: PostgreSQL Admin - Port 5050
- **mongo-express**: MongoDB Admin - Port 8081
- **redis-commander**: Redis Admin - Port 8082

## Prerequisites

1. **Docker Desktop** installed and running
2. **WSL2** enabled (for Windows)
3. **At least 8GB RAM** allocated to Docker
4. **Vosk Models** downloaded (see ASR Setup below)
5. **PowerShell** (for helper scripts)

## Quick Start with Helper Scripts

### Use the Interactive Setup Script

```powershell
cd backend
.\start-docker.ps1
```

The script will:
- Check Docker is running
- Verify Vosk models are installed
- Let you choose which services to start
- Check service health
- Offer to start the frontend

### Check Status

```powershell
.\check-docker-status.ps1
```

### Manual Setup (Alternative)

### 1. Download ASR Models (Required First Time)

```powershell
cd asr-server

# Download models from https://alphacephei.com/vosk/models

# Create models directory
New-Item -ItemType Directory -Force -Path models

# Extract the following models to asr-server/models/:
# - vosk-model-small-en-us-0.15/
# - vosk-model-small-en-in-0.4/
```

Models should be structured as:
```
asr-server/
  models/
    vosk-model-small-en-us-0.15/
      am/
      conf/
      graph/
      ivector/
      README
    vosk-model-small-en-in-0.4/
      am/
      conf/
      graph/
      ivector/
      README
```

### 2. Start All Services

```powershell
cd backend

# Start core services (postgres, redis, qdrant, asr-server, api)
docker-compose up -d

# Or start with admin interfaces
docker-compose --profile admin up -d

# Or include MongoDB (legacy)
docker-compose --profile legacy up -d

# Or start everything
docker-compose --profile admin --profile legacy up -d
```

### 3. View Logs

```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f asr-server
```

### 4. Check Service Health

```powershell
# List running containers
docker-compose ps

# Check backend health
curl http://localhost:3001/api/health

# Check ASR server health
curl http://localhost:8000/health

# Check Qdrant health
curl http://localhost:6333/health
```

## Service Details

### PostgreSQL (Primary Database)
- **Port**: 5432
- **User**: postgres
- **Password**: 1234
- **Database**: learnx
- **Admin UI**: http://localhost:5050 (with --profile admin)
  - Email: admin@learnx.com
  - Password: admin123

### Redis (Cache)
- **Port**: 6379
- **Password**: redis123
- **Admin UI**: http://localhost:8082 (with --profile admin)

### Qdrant (Vector DB)
- **Port**: 6333 (HTTP), 6334 (gRPC)
- **Dashboard**: http://localhost:6333/dashboard
- **No authentication** required in development

### ASR Server (Vosk)
- **Port**: 8000
- **Endpoint**: POST /transcribe
- **Health**: GET /health
- **Models**: US English & Indian English

### Backend API
- **Port**: 3001
- **Health**: http://localhost:3001/api/health
- **Auto-runs migrations** on startup

## Database Migrations

Migrations run automatically when the backend service starts. To run manually:

```powershell
# Connect to running container
docker-compose exec api sh

# Run migrations
npm run build
node dist/db/migrate.js
```

## Environment Variables

The docker-compose.yml overrides environment variables for Docker networking.

For local development (without Docker), use the values in `.env`.
For Docker deployment, the compose file sets proper service names.

## Stopping Services

```powershell
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Stop specific service
docker-compose stop api
```

## Troubleshooting

### API Container Restarting

**Issue**: Backend API container shows exit code 127 or "nodemon: not found"

**Root Cause**: Node.js version mismatch - some dependencies (undici, cheerio) require Node.js 20+

**Solution**: The issue has been resolved in the current setup by:
1. Upgrading Dockerfile to use `node:20-alpine`
2. Creating `docker-entrypoint.sh` that ensures dependencies are installed
3. Adding `nodemon.json` config for proper TypeScript execution
4. Using named volume `api_node_modules` to persist dependencies

If you encounter this error, rebuild from scratch:
```powershell
docker-compose down api
docker volume rm backend_api_node_modules
docker-compose build --no-cache api
docker-compose up -d api
```

### ASR Server Won't Start
- **Cause**: Missing Vosk models
- **Solution**: Download and extract models to `asr-server/models/`

### Backend Can't Connect to PostgreSQL
- **Cause**: PostgreSQL not ready
- **Solution**: Wait 10-20 seconds, backend will retry automatically

### Out of Memory
- **Cause**: Docker memory limit too low
- **Solution**: Increase Docker Desktop memory to 8GB+

### Port Already in Use
- **Cause**: Service already running on host
- **Solution**: Stop local services or change ports in docker-compose.yml

## Development Workflow

### Backend Development
```powershell
# Backend auto-reloads on file changes
docker-compose logs -f api
```

### View Database
```powershell
# PostgreSQL
docker-compose --profile admin up -d pgadmin
# Visit http://localhost:5050

# MongoDB (if using legacy profile)
docker-compose --profile admin --profile legacy up -d mongo-express
# Visit http://localhost:8081
```

### Reset Database
```powershell
# Remove volume and restart
docker-compose down
docker volume rm backend_postgres_data
docker-compose up -d
```

## Production Considerations

1. **Change passwords** in docker-compose.yml
2. **Set secure JWT_SECRET** in environment
3. **Use secrets management** for API keys
4. **Enable SSL/TLS** for databases
5. **Configure backups** for volumes
6. **Set resource limits** for containers
7. **Use production Dockerfile target** for api service

## Frontend Setup

The frontend (Next.js) runs separately:

```powershell
cd ..  # Return to project root
pnpm install
pnpm dev
```

Access at: http://localhost:3000

## Useful Commands

```powershell
# Restart specific service
docker-compose restart api

# Rebuild service after Dockerfile changes
docker-compose build api
docker-compose up -d api

# Execute command in container
docker-compose exec api npm run build

# View container resource usage
docker stats

# Clean up unused Docker resources
docker system prune -a
```

## Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | - |
| Backend API | http://localhost:3001 | - |
| PostgreSQL | localhost:5432 | postgres/1234 |
| pgAdmin | http://localhost:5050 | admin@learnx.com/admin123 |
| Redis | localhost:6379 | Password: redis123 |
| Redis Commander | http://localhost:8082 | - |
| Qdrant | http://localhost:6333 | - |
| ASR Server | http://localhost:8000 | - |
| MongoDB* | localhost:27017 | admin/password123 |
| Mongo Express* | http://localhost:8081 | admin/admin123 |

*Only available with `--profile legacy`

## Support

For issues or questions, refer to:
- Backend README: `backend/README.md`
- ASR Server README: `asr-server/README.md`
- Main README: `README.md`
