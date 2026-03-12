# LearnX Platform Docker Setup Script
# Run this script from the backend directory

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  LearnX Platform Docker Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker installed: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "  Please install Docker Desktop from https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
    exit 1
}

try {
    $composeVersion = docker-compose --version
    Write-Host "✓ Docker Compose installed: $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker Compose is not installed" -ForegroundColor Red
    exit 1
}

# Check if Docker is running
try {
    docker ps | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not running" -ForegroundColor Red
    Write-Host "  Please start Docker Desktop" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check for Vosk models
Write-Host "Checking ASR models..." -ForegroundColor Yellow
$modelsPath = Join-Path $PSScriptRoot "..\asr-server\models"
$usModelPath = Join-Path $modelsPath "vosk-model-small-en-us-0.15"
$inModelPath = Join-Path $modelsPath "vosk-model-small-en-in-0.4"

$modelsExist = $false
if (Test-Path $usModelPath) {
    Write-Host "✓ US English model found" -ForegroundColor Green
    $modelsExist = $true
} else {
    Write-Host "✗ US English model not found" -ForegroundColor Yellow
    Write-Host "  Expected at: $usModelPath" -ForegroundColor Gray
}

if (Test-Path $inModelPath) {
    Write-Host "✓ Indian English model found" -ForegroundColor Green
    $modelsExist = $true
} else {
    Write-Host "✗ Indian English model not found" -ForegroundColor Yellow
    Write-Host "  Expected at: $inModelPath" -ForegroundColor Gray
}

if (-not $modelsExist) {
    Write-Host ""
    Write-Host "WARNING: No Vosk models found!" -ForegroundColor Red
    Write-Host "ASR Server will fail to start without models." -ForegroundColor Red
    Write-Host ""
    Write-Host "To download models:" -ForegroundColor Yellow
    Write-Host "1. Visit: https://alphacephei.com/vosk/models" -ForegroundColor Gray
    Write-Host "2. Download: vosk-model-small-en-us-0.15.zip" -ForegroundColor Gray
    Write-Host "3. Download: vosk-model-small-en-in-0.4.zip" -ForegroundColor Gray
    Write-Host "4. Extract to: asr-server\models\" -ForegroundColor Gray
    Write-Host ""
    
    $continue = Read-Host "Continue without ASR models? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 0
    }
}

Write-Host ""
Write-Host "Select startup configuration:" -ForegroundColor Yellow
Write-Host "1. Core services only (Recommended)" -ForegroundColor Gray
Write-Host "   - PostgreSQL, Redis, Qdrant, ASR Server, Backend API" -ForegroundColor Gray
Write-Host "2. Core + Admin interfaces" -ForegroundColor Gray
Write-Host "   - Core services + pgAdmin, Redis Commander" -ForegroundColor Gray
Write-Host "3. Core + Legacy MongoDB" -ForegroundColor Gray
Write-Host "   - Core services + MongoDB, Mongo Express" -ForegroundColor Gray
Write-Host "4. All services" -ForegroundColor Gray
Write-Host "   - Everything including admin interfaces and MongoDB" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter choice (1-4)"

$composeCommand = "docker-compose up -d"

switch ($choice) {
    "1" {
        Write-Host "Starting core services..." -ForegroundColor Cyan
        # No profile needed for core
    }
    "2" {
        Write-Host "Starting core services + admin interfaces..." -ForegroundColor Cyan
        $composeCommand = "docker-compose --profile admin up -d"
    }
    "3" {
        Write-Host "Starting core services + MongoDB..." -ForegroundColor Cyan
        $composeCommand = "docker-compose --profile legacy up -d"
    }
    "4" {
        Write-Host "Starting all services..." -ForegroundColor Cyan
        $composeCommand = "docker-compose --profile admin --profile legacy up -d"
    }
    default {
        Write-Host "Invalid choice. Starting core services..." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Executing: $composeCommand" -ForegroundColor Gray
Invoke-Expression $composeCommand

Write-Host ""
Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Checking service health..." -ForegroundColor Yellow

# Check API health
try {
    $apiHealth = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "✓ Backend API is healthy" -ForegroundColor Green
} catch {
    Write-Host "⚠ Backend API is starting up (this is normal)..." -ForegroundColor Yellow
}

# Check ASR health
if ($modelsExist) {
    try {
        $asrHealth = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
        Write-Host "✓ ASR Server is healthy" -ForegroundColor Green
    } catch {
        Write-Host "⚠ ASR Server is starting up..." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Services Started Successfully!" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access your services at:" -ForegroundColor Yellow
Write-Host "  Backend API:      http://localhost:3001" -ForegroundColor Gray
Write-Host "  PostgreSQL:       localhost:5432" -ForegroundColor Gray
Write-Host "  Redis:            localhost:6379" -ForegroundColor Gray
Write-Host "  Qdrant:           http://localhost:6333/dashboard" -ForegroundColor Gray

if ($modelsExist) {
    Write-Host "  ASR Server:       http://localhost:8000" -ForegroundColor Gray
}

if ($choice -eq "2" -or $choice -eq "4") {
    Write-Host ""
    Write-Host "Admin Interfaces:" -ForegroundColor Yellow
    Write-Host "  pgAdmin:          http://localhost:5050" -ForegroundColor Gray
    Write-Host "                    (admin@learnx.com / admin123)" -ForegroundColor DarkGray
    Write-Host "  Redis Commander:  http://localhost:8082" -ForegroundColor Gray
}

if ($choice -eq "3" -or $choice -eq "4") {
    Write-Host ""
    Write-Host "Legacy Services:" -ForegroundColor Yellow
    Write-Host "  MongoDB:          localhost:27017" -ForegroundColor Gray
    Write-Host "  Mongo Express:    http://localhost:8081" -ForegroundColor Gray
    Write-Host "                    (admin / admin123)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "To view logs:         docker-compose logs -f" -ForegroundColor Cyan
Write-Host "To stop services:     docker-compose down" -ForegroundColor Cyan
Write-Host "For more info:        See DOCKER_SETUP.md" -ForegroundColor Cyan
Write-Host ""

# Offer to start frontend
Write-Host "Would you like to start the frontend now? (y/N)" -ForegroundColor Yellow
$startFrontend = Read-Host

if ($startFrontend -eq "y" -or $startFrontend -eq "Y") {
    Write-Host ""
    Write-Host "Starting frontend..." -ForegroundColor Cyan
    Write-Host "Make sure you have pnpm installed!" -ForegroundColor Yellow
    Write-Host ""
    
    $frontendPath = Join-Path $PSScriptRoot ".."
    Set-Location $frontendPath
    
    # Check if node_modules exists
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies..." -ForegroundColor Yellow
        pnpm install
    }
    
    Write-Host "Starting dev server..." -ForegroundColor Yellow
    Write-Host "Frontend will be available at: http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    pnpm dev
}
