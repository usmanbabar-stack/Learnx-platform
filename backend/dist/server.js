"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// CRITICAL: Load .env FIRST before any other imports that might use env vars
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const envPath = path_1.default.join(__dirname, '..', '.env');
dotenv_1.default.config({ path: envPath });
// Now import everything else AFTER env is loaded
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const postgres_1 = require("./config/postgres");
const qdrant_1 = require("./config/qdrant");
const redis_1 = require("./config/redis");
const logger_1 = require("./utils/logger");
const errorMiddleware_1 = require("./middleware/errorMiddleware");
const videoRoutes_1 = __importDefault(require("./routes/videoRoutes"));
// 🛡️ Setup global error handlers FIRST
(0, errorMiddleware_1.setupGlobalErrorHandlers)();
const searchRoutes_1 = __importDefault(require("./routes/searchRoutes"));
const transcriptRoutes_1 = __importDefault(require("./routes/transcriptRoutes"));
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const askRoutes_1 = __importDefault(require("./routes/askRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const progressRoutes_1 = __importDefault(require("./routes/progressRoutes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Security middleware
app.use((0, helmet_1.default)({
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
const limiter = (0, express_rate_limit_1.default)({
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
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Compression middleware
app.use((0, compression_1.default)());
// Logging middleware
app.use((0, morgan_1.default)('combined', {
    stream: {
        write: (message) => logger_1.logger.info(message.trim())
    }
}));
// Health check endpoint (with DB status)
app.get('/api/health', async (req, res) => {
    let postgresOk = false;
    let qdrantOk = false;
    try {
        const pool = (0, postgres_1.getPostgresPool)();
        await pool.query('SELECT 1');
        postgresOk = true;
    }
    catch {
        postgresOk = false;
    }
    try {
        const { getQdrantClient } = await Promise.resolve().then(() => __importStar(require('./config/qdrant')));
        await getQdrantClient().getCollections();
        qdrantOk = true;
    }
    catch {
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
app.use('/api/auth', authRoutes_1.default);
app.use('/api/videos', videoRoutes_1.default);
app.use('/api/search', searchRoutes_1.default);
app.use('/api/transcripts', transcriptRoutes_1.default);
app.use('/api/analytics', analyticsRoutes_1.default);
app.use('/api/ask', askRoutes_1.default);
app.use('/api/dashboard', dashboardRoutes_1.default);
app.use('/api/progress', progressRoutes_1.default);
// Error handling middleware
app.use(errorMiddleware_1.notFound);
app.use(errorMiddleware_1.errorHandler);
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    const { disconnectPostgres } = await Promise.resolve().then(() => __importStar(require('./config/postgres')));
    await disconnectPostgres();
    process.exit(0);
});
process.on('SIGINT', async () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    const { disconnectPostgres } = await Promise.resolve().then(() => __importStar(require('./config/postgres')));
    await disconnectPostgres();
    process.exit(0);
});
// Start server
const startServer = async () => {
    try {
        // Try to connect to PostgreSQL
        let postgresConnected = false;
        try {
            await (0, postgres_1.connectPostgres)();
            postgresConnected = true;
            logger_1.logger.info('✅ PostgreSQL connected successfully');
            // Run migrations
            try {
                const { runMigrations } = await Promise.resolve().then(() => __importStar(require('./db/migrate')));
                await runMigrations();
            }
            catch (migrationError) {
                logger_1.logger.warn('⚠️ Migration failed (continuing):', migrationError);
            }
        }
        catch (dbError) {
            logger_1.logger.error('❌ PostgreSQL connection failed:', dbError);
            logger_1.logger.warn('⚠️ Server will start but database features will be unavailable');
            logger_1.logger.info('💡 To fix: Check POSTGRES_URL or DATABASE_URL in .env or start PostgreSQL locally');
        }
        // Try to connect to Qdrant
        let qdrantConnected = false;
        try {
            await (0, qdrant_1.connectQdrant)();
            qdrantConnected = true;
            logger_1.logger.info('✅ Qdrant connected successfully');
        }
        catch (qdrantError) {
            logger_1.logger.error('❌ Qdrant connection failed:', qdrantError);
            logger_1.logger.warn('⚠️ Vector search will fall back to in-memory embeddings');
            logger_1.logger.info('💡 To fix: Check QDRANT_URL in .env or start Qdrant locally (docker run -p 6333:6333 qdrant/qdrant)');
        }
        // Try to connect to Redis (non-blocking for development)
        try {
            await (0, redis_1.connectRedis)();
            logger_1.logger.info('✅ Redis connected successfully');
        }
        catch (redisError) {
            logger_1.logger.warn('⚠️ Redis connection failed, continuing without Redis:', redisError);
        }
        // Start HTTP server
        app.listen(PORT, () => {
            logger_1.logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
            logger_1.logger.info(`📊 Health check available at http://localhost:${PORT}/api/health`);
            if (!postgresConnected || !qdrantConnected) {
                logger_1.logger.info(`🔧 Note: Some features may be limited without database connections`);
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
exports.default = app;
//# sourceMappingURL=server.js.map