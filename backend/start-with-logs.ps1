# LearnX Backend - Start with Logs
# This script starts all Docker services and follows the API logs

Write-Host "🚀 Starting LearnX Backend Services..." -ForegroundColor Cyan

# Start all services in detached mode
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start services" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Services started successfully" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Container Status:" -ForegroundColor Cyan
docker-compose ps

Write-Host ""
Write-Host "📋 Following API logs (Ctrl+C to stop viewing logs, services will continue running)..." -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# Follow API logs
docker-compose logs -f --tail=50 api
