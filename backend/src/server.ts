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
import { initProxyPool, getPoolStatus } from './utils/proxyPool';
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
import mockInterviewRoutes from './routes/mockInterviewRoutes';
import teacherRoutes from './routes/teacherRoutes';
import pastPaperRoutes from './routes/pastPaperRoutes';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URLS,
  process.env.CORS_ORIGINS,
]
  .filter(Boolean)
  .flatMap((value) => (value as string).split(','))
  .map((value) => value.trim())
  .filter(Boolean);

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
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
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
    proxyPool: getPoolStatus(),
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
app.use('/api/mock-interview', mockInterviewRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/past-papers', pastPaperRoutes);

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
  // Bind to port FIRST so Render detects it immediately (before DB connections)
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`📊 Health check available at http://localhost:${PORT}/api/health`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.error(`❌ Failed to bind port ${PORT}:`, { code: err.code, message: err.message });
    process.exit(1);
  });

  // Connect to all services after port is open (non-blocking startup)
  try {
    // PostgreSQL
    try {
      await connectPostgres();
      logger.info('✅ PostgreSQL connected successfully');
      try {
        const { runMigrations } = await import('./db/migrate');
        await runMigrations();
      } catch (migrationError) {
        logger.warn('⚠️ Migration failed (continuing):', migrationError);
      }
    } catch (dbError) {
      logger.error('❌ PostgreSQL connection failed:', dbError);
      logger.warn('⚠️ Database features will be unavailable');
    }

    // Qdrant
    try {
      await connectQdrant();
      logger.info('✅ Qdrant connected successfully');
    } catch (qdrantError) {
      logger.error('❌ Qdrant connection failed:', qdrantError);
      logger.warn('⚠️ Vector search unavailable');
    }

    // Redis
    try {
      await connectRedis();
      logger.info('✅ Redis connected successfully');
    } catch (redisError) {
      logger.warn('⚠️ Redis connection failed, continuing without cache:', redisError);
    }

    // Proxy Pool
    try {
      await initProxyPool();
      const status = getPoolStatus();
      if (status.enabled) {
        logger.info(`✅ Proxy pool ready: ${status.total} proxies (${status.webshare} webshare, ${status.go2proxy} go2proxy)`);
      }
    } catch (proxyError) {
      logger.warn('⚠️ Proxy pool init failed (continuing without proxies):', proxyError);
    }

    logger.info('✅ All service connections attempted');
  } catch (error) {
    logger.error('Unexpected error during service connections:', error);
  }
};

startServer();

export default app;

