# 🚀 LearnX Backend - Quick Start Guide

## Starting Backend with Logs

### Option 1: API Logs Only (Recommended)
```powershell
.\start-with-logs.ps1
```
Shows only the backend API logs - cleaner output, easier to debug.

### Option 2: All Services Logs
```powershell
.\start-all-logs.ps1
```
Shows logs from all services (API, PostgreSQL, Redis, Qdrant, ASR Server).

### Option 3: Manual Start + Logs
```powershell
docker-compose up -d
docker-compose logs -f --tail=50 api
```

## Useful Commands

### View Logs
```powershell
# API logs only
docker-compose logs -f api

# All services
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100 api

# Since last 10 minutes
docker-compose logs --since=10m api
```

### Container Management
```powershell
# Check status
docker-compose ps

# Restart API
docker-compose restart api

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Debugging
```powershell
# Check specific service logs
docker-compose logs postgres
docker-compose logs redis
docker-compose logs qdrant
docker-compose logs asr-server

# Execute command in container
docker-compose exec api sh

# Check container stats
docker stats
```

## Notes

- **Ctrl+C** stops viewing logs but services continue running
- Services run in background (detached mode)
- Logs are streamed live with `-f` flag
- `--tail=N` shows last N lines before streaming
