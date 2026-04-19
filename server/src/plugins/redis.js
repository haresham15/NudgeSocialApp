// ============================================================================
// Plugin — Redis (ioredis)
// ============================================================================
// Creates an ioredis client from REDIS_URL and decorates the Fastify instance
// with `fastify.redis`. Used for ephemeral location caching with strict TTLs.
//
// Step 2 additions:
//   - Loads Lua scripts (proximity check, location store, nudge dedup)
//   - Starts keyspace notification listener for geo set auto-cleanup
//
// Connection is tested at startup; graceful disconnect on server shutdown.
// ============================================================================

import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { loadLuaScripts } from '../redis/scripts.js';
import { startKeyspaceListener } from '../redis/keyspace-listener.js';

async function redisPlugin(fastify) {
  const redis = new Redis(fastify.config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      fastify.log.warn(`Redis reconnecting… attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    lazyConnect: true,
  });

  let connected = false;
  let subscriber = null;

  // Connect and verify
  try {
    await redis.connect();
    const pong = await redis.ping();
    fastify.log.info(`Redis connected — PING → ${pong}`);
    connected = true;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      fastify.log.warn(
        'Redis not available — server will start but location features will fail. ' +
        'Start Redis and restart the server.',
      );
    } else {
      fastify.log.error(err, 'Failed to connect to Redis');
      throw err;
    }
  }

  // Load Lua scripts and start keyspace listener (only if connected)
  if (connected) {
    try {
      await loadLuaScripts(redis, fastify.log);
      fastify.log.info('All Lua scripts loaded successfully');
    } catch (err) {
      fastify.log.error(err, 'Failed to load Lua scripts');
      if (process.env.NODE_ENV !== 'development') throw err;
    }

    try {
      subscriber = await startKeyspaceListener(
        fastify.config.REDIS_URL,
        redis,
        fastify.log,
      );
      fastify.log.info('Keyspace notification listener started');
    } catch (err) {
      fastify.log.warn(
        { err: err.message },
        'Keyspace listener failed to start — geo set cleanup will not be automatic',
      );
    }
  }

  fastify.decorate('redis', redis);

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting Redis…');

    // Close the subscriber connection first
    if (subscriber) {
      try {
        await subscriber.quit();
        fastify.log.info('Redis subscriber disconnected');
      } catch (err) {
        fastify.log.warn({ err: err.message }, 'Error closing Redis subscriber');
      }
    }

    await redis.quit();
  });
}

export default fp(redisPlugin, {
  name: 'redis',
});
