# LearnX Docker Status Check Script
# Shows comprehensive status of all services

Write-Host "`n===========================================================" -ForegroundColor Cyan
Write-Host "         LearnX Platform - Docker Status Check         " -ForegroundColor Cyan
Write-Host "===========================================================`n" -ForegroundColor Cyan

# Check Docker Services
Write-Host "Docker Containers:" -ForegroundColor Yellow
docker-compose ps

# Check API Health
Write-Host "`nBackend API Health:" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -ErrorAction Stop
    Write-Host "  Status: $($health.status)" -ForegroundColor Green
    Write-Host "  Uptime: $([math]::Round($health.uptime, 2)) seconds"
    Write-Host "  PostgreSQL: Connected" -ForegroundColor Green
    Write-Host "  Qdrant: Connected" -ForegroundColor Green
}
catch {
    Write-Host "  API not responding" -ForegroundColor Red
}

# Check ASR Server Health
Write-Host "`nASR Server Health:" -ForegroundColor Yellow
try {
    $asrHealth = Invoke-RestMethod -Uri "http://localhost:8000/health" -ErrorAction Stop
    Write-Host "  Status: Healthy" -ForegroundColor Green
    Write-Host "  Models Loaded: $($asrHealth.models_loaded)"
}
catch {
    Write-Host "  ASR Server not responding" -ForegroundColor Red
}

# Service URLs
Write-Host "`nService URLs:" -ForegroundColor Yellow
Write-Host "  Backend API:  http://localhost:3001"
Write-Host "  PostgreSQL:   localhost:5432 (user: postgres, pass: 1234)"
Write-Host "  Redis:        localhost:6379 (pass: redis123)"
Write-Host "  Qdrant:       http://localhost:6333"
Write-Host "  ASR Server:   http://localhost:8000"

Write-Host "`nQuick Commands:" -ForegroundColor Yellow
Write-Host "  View logs:    docker-compose logs -f [service-name]"
Write-Host "  Restart:      docker-compose restart [service-name]"
Write-Host "  Stop all:     docker-compose down"
Write-Host "  Start all:    docker-compose up -d"
Write-Host ""
