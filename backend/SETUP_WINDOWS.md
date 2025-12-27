# Windows Setup Guide for PostgreSQL & Qdrant

## Option 1: Install PostgreSQL Directly (Recommended for Windows)

### Step 1: Download PostgreSQL

1. Visit: https://www.postgresql.org/download/windows/
2. Click "Download the installer" from EnterpriseDB
3. Download the latest version (e.g., PostgreSQL 16.x)

### Step 2: Install PostgreSQL

1. Run the installer (`postgresql-16.x-windows-x64.exe`)
2. **Important settings during installation:**
   - Installation Directory: `C:\Program Files\PostgreSQL\16` (default is fine)
   - Data Directory: `C:\Program Files\PostgreSQL\16\data` (default is fine)
   - **Password**: Set a password for the `postgres` superuser (remember this!)
   - Port: `5432` (default)
   - Locale: `Default locale` (or your preference)

3. **Stack Builder**: Uncheck "Launch Stack Builder" (not needed)

### Step 3: Verify Installation

Open PowerShell or Command Prompt and test:

```powershell
# Check if PostgreSQL is running
psql --version

# If the above doesn't work, add PostgreSQL to PATH:
# Add this to your PATH environment variable:
# C:\Program Files\PostgreSQL\16\bin
```

### Step 4: Create Database

```powershell
# Connect to PostgreSQL (use the password you set during installation)
psql -U postgres

# In psql prompt, run:
CREATE DATABASE learnx;
CREATE USER learnx_user WITH PASSWORD 'learnx_password_123';
GRANT ALL PRIVILEGES ON DATABASE learnx TO learnx_user;
\q
```

### Step 5: Update .env

```env
POSTGRES_URL=postgresql://learnx_user:learnx_password_123@localhost:5432/learnx
```

---

## Option 2: Install via Chocolatey (If you want package manager)

### Step 1: Install Chocolatey

Run PowerShell as **Administrator**:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### Step 2: Install PostgreSQL

```powershell
choco install postgresql -y
```

### Step 3: Follow steps 3-5 from Option 1

---

## Option 3: Use Docker (If you have Docker Desktop)

### Step 1: Install Docker Desktop

Download from: https://www.docker.com/products/docker-desktop/

### Step 2: Run PostgreSQL in Docker

```powershell
docker run --name learnx-postgres `
  -e POSTGRES_USER=learnx_user `
  -e POSTGRES_PASSWORD=learnx_password_123 `
  -e POSTGRES_DB=learnx `
  -p 5432:5432 `
  -d postgres:16
```

### Step 3: Update .env

```env
POSTGRES_URL=postgresql://learnx_user:learnx_password_123@localhost:5432/learnx
```

---

## Install Qdrant

### Option A: Docker (Recommended)

```powershell
docker run -p 6333:6333 -p 6334:6334 --name learnx-qdrant qdrant/qdrant
```

### Option B: Download Binary

1. Visit: https://github.com/qdrant/qdrant/releases
2. Download `qdrant-windows-amd64.exe` (or latest release)
3. Run it:
   ```powershell
   .\qdrant-windows-amd64.exe
   ```

### Verify Qdrant

```powershell
# Check if Qdrant is running
curl http://localhost:6333/collections
```

---

## Quick Start Script

Create a file `start-services.ps1`:

```powershell
# Start PostgreSQL (if using Docker)
docker start learnx-postgres

# Start Qdrant (if using Docker)
docker start learnx-qdrant

# Or if installed locally, they should start automatically as Windows services
```

---

## Troubleshooting

### PostgreSQL not found in PATH

1. Open "Environment Variables" (search in Start menu)
2. Edit "Path" under "System variables"
3. Add: `C:\Program Files\PostgreSQL\16\bin`
4. Restart PowerShell

### Can't connect to PostgreSQL

```powershell
# Check if PostgreSQL service is running
Get-Service postgresql*

# Start service if stopped
Start-Service postgresql-x64-16
```

### Port 5432 already in use

```powershell
# Find what's using port 5432
netstat -ano | findstr :5432

# Or change PostgreSQL port in postgresql.conf
# Location: C:\Program Files\PostgreSQL\16\data\postgresql.conf
# Change: port = 5433
```

### Qdrant not starting

```powershell
# Check if port 6333 is available
netstat -ano | findstr :6333

# Use different port
docker run -p 6335:6333 qdrant/qdrant
# Then update .env: QDRANT_URL=http://localhost:6335
```

---

## Next Steps

1. ✅ PostgreSQL installed and database created
2. ✅ Qdrant running
3. ✅ Update `backend/.env` with connection strings
4. ✅ Start backend: `cd backend && npm run dev`
5. ✅ Migrations will run automatically

