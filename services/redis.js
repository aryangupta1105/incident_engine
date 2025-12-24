/**
 * Redis Connection Manager
 * 
 * Provides reliable Redis connection with:
 * - Connection pooling
 * - Error handling
 * - Graceful shutdown
 * - Health checks
 */

const redis = require('redis');

let client = null;
let isConnected = false;

/**
 * Initialize Redis connection
 * @returns {object} Redis client
 */
async function initializeRedis() {
  if (client && isConnected) {
    return client;
  }

  try {
    client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis reconnection failed after 10 attempts');
            return new Error('Max retries exceeded');
          }
          return Math.min(retries * 50, 500);
        }
      }
    });

    // Event handlers
    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
      isConnected = false;
    });

    client.on('connect', () => {
      console.log('[Redis] Connected successfully');
      isConnected = true;
    });

    client.on('ready', () => {
      console.log('[Redis] Ready for commands');
      isConnected = true;
    });

    // Connect to Redis
    await client.connect();
    isConnected = true;

    return client;
  } catch (err) {
    console.error('[Redis] Initialization failed:', err.message);
    isConnected = false;
    throw err;
  }
}

/**
 * Get Redis client (assumes already initialized)
 * @returns {object} Redis client
 */
function getClient() {
  if (!client) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return client;
}

/**
 * Check if Redis is connected
 * @returns {boolean}
 */
function isRedisConnected() {
  return isConnected && client && client.isOpen;
}

/**
 * Gracefully shutdown Redis
 */
async function shutdown() {
  if (client && isConnected) {
    try {
      console.log('[Redis] Shutting down...');
      await client.quit();
      isConnected = false;
      client = null;
      console.log('[Redis] Shutdown complete');
    } catch (err) {
      console.error('[Redis] Shutdown error:', err.message);
      throw err;
    }
  }
}

/**
 * Health check - verify Redis is working
 * @returns {boolean}
 */
async function healthCheck() {
  try {
    if (!client || !isConnected) {
      return false;
    }
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (err) {
    console.error('[Redis] Health check failed:', err.message);
    return false;
  }
}

module.exports = {
  initializeRedis,
  getClient,
  isRedisConnected,
  shutdown,
  healthCheck
};
