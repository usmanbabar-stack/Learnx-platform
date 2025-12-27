// CRITICAL: Load .env FIRST before any other imports that might use env vars
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Now import everything else AFTER env is loaded
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { connectPostgres, getPostgresPool } from './config/postgres';
import { connectQdrant } from './config/qdrant';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler, notFound, setupGlobalErrorHandlers } from './middleware/errorMiddleware';
import videoRoutes from './routes/videoRoutes';

// 🛡️ Setup global error handlers FIRST
setupGlobalErrorHandlers();
import searchRoutes from './routes/searchRoutes';
import transcriptRoutes from './routes/transcriptRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import askRoutes from './routes/askRoutes';
import authRoutes from './routes/authRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import progressRoutes from './routes/progressRoutes';
import chatRoutes from './routes/chatRoutes';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com"],
    },
  },
}));

// Rate limiting - relaxed for development
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute for development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for progress updates (frequent during video playback)
    return req.path.includes('/progress/');
  }
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Health check endpoint (with DB status)
app.get('/api/health', async (req, res) => {
  let postgresOk = false;
  let qdrantOk = false;
  
  try {
    const pool = getPostgresPool();
    await pool.query('SELECT 1');
    postgresOk = true;
  } catch {
    postgresOk = false;
  }

  try {
    const { getQdrantClient } = await import('./config/qdrant');
    await getQdrantClient().getCollections();
    qdrantOk = true;
  } catch {
    qdrantOk = false;
  }

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    databases: {
      postgres: postgresOk,
      qdrant: qdrantOk,
    },
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ask', askRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/chat', chatRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  const { disconnectPostgres } = await import('./config/postgres');
  await disconnectPostgres();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  const { disconnectPostgres } = await import('./config/postgres');
  await disconnectPostgres();
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Try to connect to PostgreSQL
    let postgresConnected = false;
    try {
      await connectPostgres();
      postgresConnected = true;
      logger.info('✅ PostgreSQL connected successfully');
      
      // Run migrations
      try {
        const { runMigrations } = await import('./db/migrate');
        await runMigrations();
      } catch (migrationError) {
        logger.warn('⚠️ Migration failed (continuing):', migrationError);
      }
    } catch (dbError) {
      logger.error('❌ PostgreSQL connection failed:', dbError);
      logger.warn('⚠️ Server will start but database features will be unavailable');
      logger.info('💡 To fix: Check POSTGRES_URL or DATABASE_URL in .env or start PostgreSQL locally');
    }

    // Try to connect to Qdrant
    let qdrantConnected = false;
    try {
      await connectQdrant();
      qdrantConnected = true;
      logger.info('✅ Qdrant connected successfully');
    } catch (qdrantError) {
      logger.error('❌ Qdrant connection failed:', qdrantError);
      logger.warn('⚠️ Vector search will fall back to in-memory embeddings');
      logger.info('💡 To fix: Check QDRANT_URL in .env or start Qdrant locally (docker run -p 6333:6333 qdrant/qdrant)');
    }

    // Try to connect to Redis (non-blocking for development)
    try {
      await connectRedis();
      logger.info('✅ Redis connected successfully');
    } catch (redisError) {
      logger.warn('⚠️ Redis connection failed, continuing without Redis:', redisError);
    }

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`📊 Health check available at http://localhost:${PORT}/api/health`);
      if (!postgresConnected || !qdrantConnected) {
        logger.info(`🔧 Note: Some features may be limited without database connections`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
