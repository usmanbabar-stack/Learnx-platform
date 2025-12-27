# LearnX Backend - Educational Video Platform

A professional, scalable backend for the LearnX educational platform that scrapes YouTube videos without using official APIs, extracts transcripts, and provides intelligent search capabilities.

## 🚀 Features

### Module 1: Foundation
- **Web Scraping**: Automated collection of educational content from YouTube
- **Video Integration**: Seamless video metadata extraction and processing
- **Transcript Extraction**: Automatic transcript extraction and processing
- **Intelligent Search**: Fast, relevant search across educational content
- **Caching System**: Redis-based caching for optimal performance
- **Analytics**: Comprehensive analytics and insights

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│   (Next.js)     │◄──►│   (Express)     │◄──►│   (MongoDB)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │
                       ┌─────────────────┐
                       │   Redis Cache   │
                       └─────────────────┘
                               │
                       ┌─────────────────┐
                       │   Puppeteer     │
                       │   (Scraping)    │
                       └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB 5+
- Redis 6+
- Docker & Docker Compose (optional)

## 🛠️ Installation

### Option 1: Docker (Recommended)

1. **Clone and setup**:
   ```bash
   cd backend
   cp env.example .env
   # Edit .env with your configurations
   ```

2. **Start with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

3. **Access services**:
   - API: http://localhost:3001
   - MongoDB Admin: http://localhost:8081
   - Redis Admin: http://localhost:8082

### Option 2: Manual Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup environment**:
   ```bash
   cp env.example .env
   # Configure your .env file
   ```

3. **Start services**:
   ```bash
   # Start MongoDB and Redis locally
   # Then start the application
   npm run dev
   ```

## 🔧 Configuration

Key environment variables:

```env
# Core Settings
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/learnx
REDIS_URL=redis://localhost:6379

# Scraping Configuration
PUPPETEER_HEADLESS=true
SCRAPER_DELAY_MS=1000
MAX_CONCURRENT_SCRAPERS=3

# Caching
CACHE_TTL_SHORT=300
CACHE_TTL_MEDIUM=1800
CACHE_TTL_LONG=7200
```

## 📚 API Endpoints

### Video Operations
```
GET    /api/videos/search              # Search videos
GET    /api/videos/trending            # Get trending videos
GET    /api/videos/:videoId            # Get video details
GET    /api/videos/:videoId/transcript # Get video transcript
POST   /api/videos/batch-process       # Batch process videos
GET    /api/videos/subject/:subject    # Get videos by subject
```

### Search Operations
```
GET    /api/search                     # General search
GET    /api/search/suggestions         # Get search suggestions
GET    /api/search/trending-topics     # Get trending topics
GET    /api/search/subjects            # Get available subjects
```

### Transcript Operations
```
GET    /api/transcripts/:videoId              # Get transcript
GET    /api/transcripts/:videoId/search       # Search in transcript
GET    /api/transcripts/:videoId/summary      # Generate summary
```

### Analytics Operations
```
GET    /api/analytics/overview         # Platform overview
GET    /api/analytics/popular-videos   # Popular videos
GET    /api/analytics/search-trends    # Search trends
GET    /api/analytics/subjects         # Subject analytics
GET    /api/analytics/video/:videoId   # Video analytics
```

## 🎯 Usage Examples

### Search Educational Videos
```bash
curl "http://localhost:3001/api/videos/search?query=machine learning&limit=10"
```

### Get Video with Transcript
```bash
curl "http://localhost:3001/api/videos/dQw4w9WgXcQ"
```

### Search Within Transcript
```bash
curl "http://localhost:3001/api/transcripts/dQw4w9WgXcQ/search?query=neural networks"
```

### Batch Process Videos
```bash
curl -X POST "http://localhost:3001/api/videos/batch-process" \
  -H "Content-Type: application/json" \
  -d '{"videoIds": ["dQw4w9WgXcQ", "jNQXAC9IVRw"]}'
```

## 🔍 How It Works

### 1. YouTube Scraping (No API Required)
- Uses Puppeteer for dynamic content scraping
- Extracts video metadata, thumbnails, and descriptions
- Bypasses rate limits through intelligent request spacing
- Handles anti-bot measures with realistic browsing patterns

### 2. Transcript Extraction
- Primary: Uses `youtube-transcript` library
- Fallback: Manual scraping of transcript elements
- Supports multiple formats (JSON, SRT, plain text)
- Timestamps and duration tracking

### 3. Intelligent Processing
- Automatic subject classification
- Difficulty level detection
- Quality scoring algorithm
- Educational content filtering

### 4. Caching Strategy
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   L1 Cache  │  │   L2 Cache  │  │  Database   │
│  (Memory)   │  │   (Redis)   │  │  (MongoDB)  │
│   < 1min    │  │   1-24hrs   │  │  Permanent  │
└─────────────┘  └─────────────┘  └─────────────┘
```

## 🚦 Performance Features

- **Concurrent Processing**: Multiple videos processed simultaneously
- **Smart Caching**: Multi-layer caching strategy
- **Rate Limiting**: Prevents abuse and ensures stability  
- **Connection Pooling**: Efficient database connections
- **Compression**: Response compression for faster transfers

## 🔒 Security Features

- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Per-IP request limiting
- **Error Handling**: Secure error responses
- **CORS Protection**: Configurable CORS policies
- **Helmet Security**: Security headers and protections

## 📊 Monitoring & Logging

- **Winston Logging**: Structured logging with rotation
- **Health Checks**: Built-in health monitoring
- **Analytics**: Comprehensive usage analytics
- **Error Tracking**: Detailed error logging and tracking

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run linting
npm run lint

# Type checking
npm run type-check
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Stateless API design
- Redis for shared caching
- Load balancer ready
- Docker container support

### Performance Optimization
- Database indexing strategy
- Query optimization
- Caching at multiple levels
- Batch processing capabilities

### Resource Management
- Memory usage monitoring
- Connection pool management
- Graceful shutdowns
- Resource cleanup

## 🐛 Troubleshooting

### Common Issues

1. **Puppeteer Issues**:
   ```bash
   # Install system dependencies
   apt-get update && apt-get install -y chromium-browser
   ```

2. **MongoDB Connection**:
   ```bash
   # Check MongoDB status
   systemctl status mongod
   ```

3. **Redis Connection**:
   ```bash
   # Test Redis connection
   redis-cli ping
   ```

### Debug Mode
```bash
NODE_ENV=development LOG_LEVEL=debug npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- Create an issue for bug reports
- Join our Discord for discussions
- Check the wiki for detailed documentation

---

Built with ❤️ for educational technology advancement
