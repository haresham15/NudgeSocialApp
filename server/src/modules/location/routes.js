// ============================================================================
// Location Module — Route Handlers (v2)
// ============================================================================
// POST /api/v1/location/check   — Full proximity check with SQS queueing
// DELETE /api/v1/location/evict — Immediately remove user's cached location
//
// This is the heart of Nudge's privacy-first proximity system.
// The /check endpoint:
//   1. Receives a lat/lng from the iOS client (triggered by CLRegion boundary)
//   2. Atomically caches it in Redis GEO with a 30-second TTL (Lua script)
//   3. Queries mutual friends and batch-checks proximity (single Lua call)
//   4. Deduplicates against recently nudged pairs (Lua sorted set)
//   5. Enqueues unique matches to SQS for AI processing (Claude Sonnet)
//   6. Returns proximity matches to the client
//
// No GPS data ever reaches PostgreSQL. The entire flow is in-memory.
// ============================================================================

import { locationCheckSchema, locationEvictSchema } from './schema.js';
import {
  cacheUserLocation,
  evictUserLocation,
  getMutualFriendsWithCircles,
  checkProximityMatches,
  processProximityMatches,
} from './service.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function locationRoutes(fastify) {
  // ─── POST /check — Full Proximity Check ────────────────────────────────────
  fastify.post('/check', {
    schema: locationCheckSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { lat, lng, accuracy } = request.body;
      const userId = request.user.sub;
      const checkedAt = new Date().toISOString();

      fastify.log.info(
        { userId, accuracy },
        'Location check initiated (coordinates not logged for privacy)',
      );

      // 1. Atomically cache user's location in Redis GEO with 30s TTL
      await cacheUserLocation(fastify.redis, userId, lat, lng);

      // 2. Fetch mutual friends with their circle memberships
      const friends = await getMutualFriendsWithCircles(fastify.db, userId);

      if (friends.length === 0) {
        return {
          matches: [],
          checkedAt,
          friendsChecked: 0,
          queued: 0,
          deduplicated: 0,
        };
      }

      // 3. Atomic batch proximity check via Lua script (single Redis round-trip)
      const matches = await checkProximityMatches(
        fastify.redis,
        userId,
        friends,
      );

      // 4. Deduplicate and enqueue matches to SQS
      let queued = 0;
      let deduplicated = 0;

      if (matches.length > 0) {
        // Pass approximate location (rounded to ~1km precision for privacy)
        // This is used by the Lambda for venue/weather lookups only
        const approximateLat = Math.round(lat * 100) / 100; // ~1.1km precision
        const approximateLng = Math.round(lng * 100) / 100;

        const result = await processProximityMatches(
          {
            redis: fastify.redis,
            db: fastify.db,
            sqs: fastify.sqs,
            log: fastify.log,
          },
          userId,
          matches,
          checkedAt,
          { approximateLat, approximateLng },
        );
        queued = result.queued;
        deduplicated = result.deduplicated;
      }

      fastify.log.info(
        {
          userId,
          friendsChecked: friends.length,
          matchCount: matches.length,
          queued,
          deduplicated,
        },
        'Location check completed',
      );

      return {
        matches,
        checkedAt,
        friendsChecked: friends.length,
        queued,
        deduplicated,
      };
    },
  });

  // ─── DELETE /evict — Immediately Remove Cached Location ────────────────────
  fastify.delete('/evict', {
    schema: locationEvictSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.sub;

      await evictUserLocation(fastify.redis, userId);

      fastify.log.info({ userId }, 'Location evicted by user request');

      return {
        evicted: true,
        message: 'Location data removed from cache',
      };
    },
  });
}
