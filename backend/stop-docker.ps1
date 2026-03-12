# LearnX Platform Docker Stop Script
# Run this script from the backend directory

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  LearnX Platform Docker Stop" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Select action:" -ForegroundColor Yellow
Write-Host "1. Stop services (keep data)" -ForegroundColor Gray
Write-Host "2. Stop and remove volumes (WARNING: deletes all data)" -ForegroundColor Gray
Write-Host "3. Just stop a specific service" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter choice (1-3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Stopping all services..." -ForegroundColor Yellow
        docker-compose --profile admin --profile legacy down
        Write-Host "✓ Services stopped. Data volumes preserved." -ForegroundColor Green
    }
    "2" {
        Write-Host ""
        Write-Host "WARNING: This will delete all data!" -ForegroundColor Red
        $confirm = Read-Host "Are you sure? Type 'yes' to confirm"
        
        if ($confirm -eq "yes") {
            Write-Host "Stopping services and removing volumes..." -ForegroundColor Yellow
            docker-compose --profile admin --profile legacy down -v
            Write-Host "✓ Services stopped and volumes removed." -ForegroundColor Green
        } else {
            Write-Host "Cancelled." -ForegroundColor Yellow
        }
    }
    "3" {
        Write-Host ""
        Write-Host "Available services:" -ForegroundColor Yellow
        docker-compose ps --format "table {{.Service}}\t{{.Status}}"
        Write-Host ""
        
        $service = Read-Host "Enter service name to stop"
        Write-Host "Stopping $service..." -ForegroundColor Yellow
        docker-compose stop $service
        Write-Host "✓ Service $service stopped." -ForegroundColor Green
    }
    default {
        Write-Host "Invalid choice." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
