# LearnX Platform Docker Status Check
# Run this script from the backend directory

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  LearnX Platform Status" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker
Write-Host "Docker Status:" -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not running" -ForegroundColor Red
    exit 1
}

Write-Host ""

# List containers
Write-Host "Running Containers:" -ForegroundColor Yellow
docker-compose ps

Write-Host ""
Write-Host "Service Health Checks:" -ForegroundColor Yellow

# Check PostgreSQL
Write-Host -NoNewline "PostgreSQL:        "
try {
    $pgHealth = docker-compose exec -T postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Healthy" -ForegroundColor Green
    } else {
        Write-Host "✗ Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Not running" -ForegroundColor Red
}

# Check Redis
Write-Host -NoNewline "Redis:             "
try {
    $redisHealth = docker-compose exec -T redis redis-cli -a redis123 ping 2>&1
    if ($redisHealth -match "PONG") {
        Write-Host "✓ Healthy" -ForegroundColor Green
    } else {
        Write-Host "✗ Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Not running" -ForegroundColor Red
}

# Check Qdrant
Write-Host -NoNewline "Qdrant:            "
try {
    $qdrantHealth = Invoke-WebRequest -Uri "http://localhost:6333/health" -UseBasicParsing -TimeoutSec 2 2>&1
    if ($qdrantHealth.StatusCode -eq 200) {
        Write-Host "✓ Healthy" -ForegroundColor Green
    } else {
        Write-Host "✗ Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Not running" -ForegroundColor Red
}

# Check ASR Server
Write-Host -NoNewline "ASR Server:        "
try {
    $asrHealth = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 2 2>&1
    if ($asrHealth.StatusCode -eq 200) {
        $healthData = $asrHealth.Content | ConvertFrom-Json
        if ($healthData.models_loaded) {
            Write-Host "✓ Healthy (Models loaded)" -ForegroundColor Green
        } else {
            Write-Host "⚠ Running (No models)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Not running" -ForegroundColor Red
}

# Check Backend API
Write-Host -NoNewline "Backend API:       "
try {
    $apiHealth = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 2 2>&1
    if ($apiHealth.StatusCode -eq 200) {
        Write-Host "✓ Healthy" -ForegroundColor Green
    } else {
        Write-Host "✗ Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "⚠ Starting or not running" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Resource Usage:" -ForegroundColor Yellow
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

Write-Host ""
Write-Host "Access URLs:" -ForegroundColor Yellow
Write-Host "  Backend API:      http://localhost:3001/api/health" -ForegroundColor Gray
Write-Host "  Qdrant Dashboard: http://localhost:6333/dashboard" -ForegroundColor Gray
Write-Host "  pgAdmin:          http://localhost:5050 (if running with --profile admin)" -ForegroundColor Gray
Write-Host "  Redis Commander:  http://localhost:8082 (if running with --profile admin)" -ForegroundColor Gray

Write-Host ""
Write-Host "Commands:" -ForegroundColor Yellow
Write-Host "  View logs:        docker-compose logs -f [service]" -ForegroundColor Gray
Write-Host "  Restart service:  docker-compose restart [service]" -ForegroundColor Gray
Write-Host "  Stop all:         .\stop-docker.ps1" -ForegroundColor Gray

Write-Host ""
