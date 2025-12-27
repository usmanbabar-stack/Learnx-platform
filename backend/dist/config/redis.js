"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectRedis = exports.getRedisClient = exports.connectRedis = void 0;
const redis_1 = require("redis");
const logger_1 = require("../utils/logger");
let redisClient = null;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ENABLE_REDIS = process.env.ENABLE_REDIS?.toLowerCase() === 'true';
const connectRedis = async () => {
    // 🚀 OPTIMIZATION: Enable Redis for caching (critical for response time)
    if (!ENABLE_REDIS) {
        logger_1.logger.info('Redis connection skipped (ENABLE_REDIS not set to true)');
        return Promise.resolve();
    }
    try {
        redisClient = (0, redis_1.createClient)({ url: REDIS_URL });
        redisClient.on('error', (err) => {
            logger_1.logger.warn('Redis connection error (will continue without cache):', err.message);
        });
        redisClient.on('connect', () => {
            logger_1.logger.info('✅ Redis connected successfully');
        });
        await redisClient.connect();
        logger_1.logger.info(`✅ Redis connected at ${REDIS_URL}`);
    }
    catch (error) {
        logger_1.logger.warn(`Redis connection failed (continuing without cache): ${error.message}`);
        redisClient = null;
    }
};
exports.connectRedis = connectRedis;
const getRedisClient = () => {
    return redisClient;
};
exports.getRedisClient = getRedisClient;
const disconnectRedis = async () => {
    if (redisClient) {
        try {
            await redisClient.quit();
            logger_1.logger.info('Redis disconnected');
        }
        catch (error) {
            logger_1.logger.warn('Error disconnecting Redis:', error);
        }
        redisClient = null;
    }
};
exports.disconnectRedis = disconnectRedis;
//# sourceMappingURL=redis.js.map