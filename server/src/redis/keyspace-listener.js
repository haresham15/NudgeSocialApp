// ============================================================================
// Redis Keyspace Notifications — Geo Set Cleanup
// ============================================================================
// When a user's TTL marker key expires (after 30 seconds), we need to
// remove their entry from the Redis GEO sorted set to prevent stale
// distance calculations.
//
// This module subscribes to Redis keyspace notifications for expired keys
// matching the pattern `nudge:loc:*`. When a key expires, it extracts the
// userId and removes them from the geo set.
//
// Requires Redis CONFIG SET notify-keyspace-events Ex (or set in redis.conf).
// The plugin automatically attempts to configure this on startup.
//
// IMPORTANT: This uses a separate Redis connection for the subscriber,
// because a connection in subscribe mode cannot execute normal commands.
// ============================================================================

import Redis from 'ioredis';
import {
  REDIS_KEY_PREFIX_GEO,
  REDIS_KEY_PREFIX_LOCATION,
} from '../utils/constants.js';

/**
 * Starts the keyspace notification listener for expired location keys.
 * Creates a dedicated subscriber connection.
 *
 * @param {string} redisUrl — Redis connection URL
 * @param {import('ioredis').Redis} redisClient — Main Redis client (for ZREM)
 * @param {import('pino').Logger} log
 * @returns {Promise<import('ioredis').Redis>} — The subscriber connection (for cleanup)
 */
export async function startKeyspaceListener(redisUrl, redisClient, log) {
  // Create a dedicated connection for subscribing
  const subscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Subscribers should retry indefinitely
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
    lazyConnect: true,
  });

  try {
    await subscriber.connect();
  } catch (err) {
    log.warn('Could not connect subscriber for keyspace notifications — geo cleanup disabled');
    return subscriber;
  }

  // Enable keyspace notifications for expired events (if not already enabled)
  try {
    await redisClient.config('SET', 'notify-keyspace-events', 'Ex');
    log.info('Redis keyspace notifications enabled (expired events)');
  } catch (err) {
    // This can fail on managed Redis (ElastiCache) where CONFIG is disabled.
    // In that case, notifications must be enabled via the parameter group.
    log.warn(
      { err: err.message },
      'Could not set notify-keyspace-events — ensure it is enabled in Redis config',
    );
  }

  // Subscribe to expired events on database 0
  const channel = '__keyevent@0__:expired';
  await subscriber.subscribe(channel);

  log.info({ channel }, 'Subscribed to Redis keyspace notifications');

  // Handle expired key events
  subscriber.on('message', async (ch, expiredKey) => {
    // Only process our location TTL keys
    if (!expiredKey.startsWith(`${REDIS_KEY_PREFIX_LOCATION}:`)) return;

    // Extract userId from the key: "nudge:loc:<userId>" → "<userId>"
    const userId = expiredKey.slice(REDIS_KEY_PREFIX_LOCATION.length + 1);

    if (!userId) return;

    try {
      // Remove the user from the geo set
      const removed = await redisClient.zrem(REDIS_KEY_PREFIX_GEO, userId);

      if (removed > 0) {
        log.debug(
          { userId: userId.slice(0, 8) + '…' },
          'Evicted expired location from geo set',
        );
      }
    } catch (err) {
      log.error(
        { err, userId: userId.slice(0, 8) + '…' },
        'Failed to evict expired location from geo set',
      );
    }
  });

  // Handle subscriber errors (don't crash the server)
  subscriber.on('error', (err) => {
    log.error({ err }, 'Redis subscriber error');
  });

  return subscriber;
}
