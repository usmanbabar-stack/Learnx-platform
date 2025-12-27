import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | null = null;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ENABLE_REDIS = process.env.ENABLE_REDIS?.toLowerCase() === 'true';

export const connectRedis = async (): Promise<void> => {
  // 🚀 OPTIMIZATION: Enable Redis for caching (critical for response time)
  if (!ENABLE_REDIS) {
    logger.info('Redis connection skipped (ENABLE_REDIS not set to true)');
    return Promise.resolve();
  }
  
  try {
    redisClient = createClient({ url: REDIS_URL });
    
    redisClient.on('error', (err) => {
      logger.warn('Redis connection error (will continue without cache):', err.message);
    });
    
    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully');
    });
    
    await redisClient.connect();
    logger.info(`✅ Redis connected at ${REDIS_URL}`);
  } catch (error: any) {
    logger.warn(`Redis connection failed (continuing without cache): ${error.message}`);
    redisClient = null;
  }
};

export const getRedisClient = (): RedisClientType | null => {
  return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis disconnected');
    } catch (error) {
      logger.warn('Error disconnecting Redis:', error);
    }
    redisClient = null;
  }
};
