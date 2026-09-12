import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

let redisClient = null;

export const initializeRedis = async () => {
  try {
    if (!process.env.REDIS_URL) {
      logger.info('Redis URL not configured. Caching will use in-memory fallback.');
      return null;
    }

        redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis not available - using in-memory cache fallback');
            return false; // Stop retrying - return false, not null
          }
          return Math.min(retries * 50, 500);
        }
      }
    });


    redisClient.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.warn('Redis connection ended');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    return null;
  }
};

export const getRedisClient = () => {
  return redisClient;
};

export const closeRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }
};