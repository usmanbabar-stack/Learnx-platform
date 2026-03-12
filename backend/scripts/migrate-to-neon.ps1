param(
    [Parameter(Mandatory = $true)]
    [string]$NeonDatabaseUrl,

    [string]$SourceContainer = "backend-postgres-1",
    [string]$SourceDatabase = "learnx",
    [string]$SourceUser = "postgres",
    [string]$DumpFile = "learnx-neon-export.sql"
)

$ErrorActionPreference = "Stop"

Write-Host "Exporting local PostgreSQL database '$SourceDatabase' from container '$SourceContainer'..."
docker exec $SourceContainer pg_dump -U $SourceUser -d $SourceDatabase --no-owner --no-privileges --clean --if-exists > $DumpFile

if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed. Make sure Docker is running and the source container exists."
}

Write-Host "Importing dump into Neon..."
Get-Content -Raw $DumpFile | docker run --rm -i postgres:16-alpine psql "$NeonDatabaseUrl"

if ($LASTEXITCODE -ne 0) {
    throw "Import into Neon failed. Check the Neon connection string and network access."
}

Write-Host "Neon migration complete. Dump file saved to $DumpFile"
