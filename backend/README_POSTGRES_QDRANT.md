# PostgreSQL + Qdrant Integration Guide

This document explains the new database architecture using PostgreSQL (primary database) and Qdrant (vector database for RAG).

## Architecture Overview

- **PostgreSQL**: Stores all structured data (videos, transcripts, users, etc.)
- **Qdrant**: Stores vector embeddings of transcript chunks for fast semantic search
- **Redis**: Optional caching layer (unchanged)

## Setup Instructions

### 1. Install PostgreSQL

**Windows:**
```bash
# Option A: Direct Installer (Recommended)
# 1. Download from https://www.postgresql.org/download/windows/
# 2. Run installer, set password for 'postgres' user
# 3. Default port: 5432

# Option B: Chocolatey (if installed)
choco install postgresql

# Option C: Docker
docker run --name learnx-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=learnx -p 5432:5432 -d postgres:16

# See SETUP_WINDOWS.md for detailed Windows instructions
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Linux:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE learnx;
CREATE USER learnx_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE learnx TO learnx_user;
\q
```

### 3. Install Qdrant

**Using Docker (Recommended):**
```bash
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

**Or download binary:**
- Visit https://qdrant.tech/documentation/guides/installation/
- Download for your OS

### 4. Configure Environment Variables

Update `backend/.env`:

```env
# PostgreSQL
POSTGRES_URL=postgresql://learnx_user:your_password@localhost:5432/learnx
# Or use DATABASE_URL if your provider uses that
# DATABASE_URL=postgresql://user:password@host:port/database

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=  # Optional, leave empty for local
USE_QDRANT=true

# Keep existing Redis, Gemini, etc. configs
```

### 5. Run Migrations

The migrations will run automatically on server start, or manually:

```bash
cd backend
npm run build
node dist/db/migrate.js
```

### 6. Start Backend

```bash
cd backend
npm run dev
```

## Database Schema

### Key Tables

- **videos**: Main video metadata
- **transcript_items**: Normalized transcript segments (indexed for fast retrieval)
- **video_keywords**: Search keywords (GIN index for full-text search)
- **users**: User accounts for authentication
- **user_progress**: Track user video progress
- **watch_history**: Analytics data

### Indexes (Optimized for Speed)

- `idx_videos_video_id`: Unique index on video_id (fast lookups)
- `idx_videos_subject_quality`: Composite index for subject + quality queries
- `idx_transcript_items_video_sequence`: Fast transcript retrieval
- `idx_video_keywords_keyword`: Fast keyword search
- Full-text search indexes on title, description, and transcript text

## Qdrant Collection

- **Collection Name**: `video_transcript_chunks`
- **Vector Dimension**: 768 (text-embedding-004)
- **Distance Metric**: Cosine
- **Filter**: `videoId` (ensures video-scoped search)

## API Changes

### New Endpoints

- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration
- `GET /api/auth/me` - Get current user

### Updated Endpoints

All existing endpoints work the same, but now use PostgreSQL:
- `/api/videos/*` - Uses PostgreSQL
- `/api/ask` - Uses Qdrant for vector search (if enabled)
- `/api/search` - Uses PostgreSQL full-text search

## Migration from MongoDB

If you have existing MongoDB data:

1. Export data from MongoDB
2. Transform to PostgreSQL format
3. Import using `psql` or migration script

**Note**: The system will work without MongoDB - all new data goes to PostgreSQL.

## Performance Optimizations

1. **Batch Inserts**: Transcript items inserted in batches
2. **Connection Pooling**: PostgreSQL pool size: 20
3. **Indexes**: Strategic indexes on all query patterns
4. **Vector Search**: Qdrant handles vector similarity efficiently
5. **Caching**: Redis still used for hot data

## Troubleshooting

### PostgreSQL Connection Failed

```bash
# Check if PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Check connection string in .env
# Ensure database exists
```

### Qdrant Connection Failed

```bash
# Check if Qdrant is running
curl http://localhost:6333/collections

# Start Qdrant if not running
docker run -p 6333:6333 qdrant/qdrant
```

### Migration Errors

```bash
# Check PostgreSQL logs
# Ensure user has CREATE TABLE permissions
# Run migrations manually: node dist/db/migrate.js
```

## Frontend Integration

The frontend API service (`lib/api.ts`) has been updated with:
- `login(email, password)` - Authenticate user
- `signup(data)` - Register new user
- `getMe()` - Get current user
- `logout()` - Clear auth token

All API calls automatically include the JWT token if available.

## Next Steps

1. Update frontend login/signup pages to use real API
2. Add JWT token refresh logic
3. Implement protected routes
4. Add user profile management

