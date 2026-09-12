import NodeCache from 'node-cache';
import { getRedisClient } from '../config/redis.js';
import { logger } from './logger.js';

// In-memory cache fallback
const memoryCache = new NodeCache({
  stdTTL: 600, // 10 minutes default
  checkperiod: 120, // Check for expired keys every 2 minutes
  maxKeys: 1000
});

class CacheManager {
  constructor() {
    this.redisClient = null;
    this.useRedis = false;
  }

  async initialize() {
    this.redisClient = getRedisClient();
    this.useRedis = this.redisClient !== null;
    
    if (this.useRedis) {
      logger.info('Cache initialized with Redis');
    } else {
      logger.info('Cache initialized with in-memory fallback');
    }
  }

  async get(key) {
    try {
      if (this.useRedis && this.redisClient) {
        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        return memoryCache.get(key) || null;
      }
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key, value, ttl = 600) {
    try {
      if (this.useRedis && this.redisClient) {
        await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      } else {
        memoryCache.set(key, value, ttl);
      }
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key) {
    try {
      if (this.useRedis && this.redisClient) {
        await this.redisClient.del(key);
      } else {
        memoryCache.del(key);
      }
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async flush() {
    try {
      if (this.useRedis && this.redisClient) {
        await this.redisClient.flushAll();
      } else {
        memoryCache.flushAll();
      }
      logger.info('Cache flushed successfully');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      if (this.useRedis && this.redisClient) {
        return await this.redisClient.exists(key) === 1;
      } else {
        return memoryCache.has(key);
      }
    } catch (error) {
      logger.error(`Cache exists check error for key ${key}:`, error);
      return false;
    }
  }

  // Pattern-based key deletion (Redis only)
  async deletePattern(pattern) {
    try {
      if (this.useRedis && this.redisClient) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
        return keys.length;
      } else {
        // For memory cache, we'll get all keys and filter
        const keys = memoryCache.keys().filter(key => 
          new RegExp(pattern.replace(/\*/g, '.*')).test(key)
        );
        keys.forEach(key => memoryCache.del(key));
        return keys.length;
      }
    } catch (error) {
      logger.error(`Cache pattern delete error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  // Get cache statistics
  getStats() {
    if (this.useRedis) {
      return { type: 'redis', client: 'connected' };
    } else {
      return {
        type: 'memory',
        keys: memoryCache.getStats().keys,
        hits: memoryCache.getStats().hits,
        misses: memoryCache.getStats().misses
      };
    }
  }
}

export const cache = new CacheManager();