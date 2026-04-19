// ============================================================================
// Location Module — Service Layer (Proximity Engine v2)
// ============================================================================
// Production-grade privacy-first location processing:
//
//   1. STORE:  Atomic Lua script caches lat/lng in Redis GEO + TTL marker
//              in a single round-trip (zero race conditions).
//   2. FETCH:  CTE query retrieves mutual-consent friends with per-circle
//              proximity thresholds from PostgreSQL.
//   3. CHECK:  Atomic Lua script batch-checks all friends in one Redis
//              round-trip — validates TTL liveness, computes GEODIST
//              (Haversine), and filters by per-friend thresholds.
//   4. DEDUP:  Lua deduplication script prevents duplicate nudges between
//              the same pair within a 15-minute cooldown window.
//   5. QUEUE:  Matched pairs are enqueued to AWS SQS for async AI processing
//              (venue suggestions via Claude Sonnet, weather context, etc.)
//   6. EVICT:  Redis keyspace notifications auto-remove stale geo entries
//              when TTL markers expire (30 seconds).
//
// GPS data exists only in Redis RAM for a maximum of 30 seconds.
// No coordinates ever reach PostgreSQL. Zero persistent location data.
// ============================================================================

import { randomUUID } from 'node:crypto';
import {
  atomicLocationStore,
  atomicProximityCheck,
  checkNudgeDedup,
} from '../../redis/scripts.js';
import {
  REDIS_KEY_PREFIX_GEO,
  REDIS_KEY_PREFIX_LOCATION,
  REDIS_LOCATION_TTL_SECONDS,
  DEFAULT_PROXIMITY_THRESHOLD_METERS,
  MAX_PROXIMITY_MATCHES,
} from '../../utils/constants.js';

/**
 * Stores a user's location in Redis with strict 30-second TTL.
 * Uses an atomic Lua script to ensure GEO add and TTL marker are set
 * in a single operation — no race conditions possible.
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} userId — UUID
 * @param {number} lat    — Latitude (WGS 84)
 * @param {number} lng    — Longitude (WGS 84)
 */
export async function cacheUserLocation(redis, userId, lat, lng) {
  await atomicLocationStore(redis, userId, lat, lng);
}

/**
 * Removes a user's location from Redis immediately (e.g., on logout or
 * explicit privacy action). Removes both the geo set entry and TTL marker.
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} userId
 */
export async function evictUserLocation(redis, userId) {
  const pipeline = redis.pipeline();
  pipeline.zrem(REDIS_KEY_PREFIX_GEO, userId);
  pipeline.del(`${REDIS_KEY_PREFIX_LOCATION}:${userId}`);
  await pipeline.exec();
}

/**
 * Fetches all mutually-consented friend IDs for a user, along with their
 * shared circle memberships and per-circle proximity thresholds.
 *
 * A "mutual friend" is a row in `friendships` with status = 'accepted'.
 * The friendship is bidirectional, so we check both requester and addressee.
 *
 * The query also checks both directions of circle membership — circles
 * the user owns AND circles the friend owns — to gather all applicable
 * proximity thresholds.
 *
 * @param {import('pg').Pool} db
 * @param {string} userId — UUID
 * @returns {Promise<Array<{friendId: string, displayName: string, avatarUrl: string|null, statusEmoji: string|null, statusText: string|null, circles: Array<{circleId: string, circleName: string, proximityThreshold: number}>}>>}
 */
export async function getMutualFriendsWithCircles(db, userId) {
  const query = `
    WITH mutual_friends AS (
      SELECT
        CASE
          WHEN f.requester_id = $1 THEN f.addressee_id
          ELSE f.requester_id
        END AS friend_id
      FROM friendships f
      WHERE f.status = 'accepted'
        AND (f.requester_id = $1 OR f.addressee_id = $1)
    )
    SELECT
      mf.friend_id,
      u.display_name,
      u.avatar_url,
      u.status_emoji,
      u.status_text,
      COALESCE(
        json_agg(
          json_build_object(
            'circleId', c.id,
            'circleName', c.name,
            'proximityThreshold', c.proximity_threshold
          )
        ) FILTER (WHERE c.id IS NOT NULL),
        '[]'::json
      ) AS circles
    FROM mutual_friends mf
    JOIN users u ON u.id = mf.friend_id
    LEFT JOIN circle_members cm ON cm.user_id = mf.friend_id
    LEFT JOIN circles c ON c.id = cm.circle_id AND c.owner_id = $1
    GROUP BY mf.friend_id, u.display_name, u.avatar_url, u.status_emoji, u.status_text
  `;

  const result = await db.query(query, [userId]);
  return result.rows.map((row) => ({
    friendId: row.friend_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    statusEmoji: row.status_emoji,
    statusText: row.status_text,
    circles: row.circles,
  }));
}

/**
 * Resolves the best proximity threshold for a friend based on their circle
 * memberships. Uses the smallest circle threshold for tighter matching.
 *
 * @param {Array<{circleId: string, circleName: string, proximityThreshold: number}>} circles
 * @returns {{threshold: number, circleId: string|null, circleName: string|null}}
 */
function resolveThreshold(circles) {
  if (!circles || circles.length === 0) {
    return {
      threshold: DEFAULT_PROXIMITY_THRESHOLD_METERS,
      circleId: null,
      circleName: null,
    };
  }

  let best = circles[0];
  for (const circle of circles) {
    if (circle.proximityThreshold < best.proximityThreshold) {
      best = circle;
    }
  }

  return {
    threshold: best.proximityThreshold || DEFAULT_PROXIMITY_THRESHOLD_METERS,
    circleId: best.circleId,
    circleName: best.circleName,
  };
}

/**
 * Checks proximity for a user against all their mutual friends in a single
 * atomic Redis operation. Uses the Lua proximity-check script for:
 *   - Zero per-friend network round-trips
 *   - Atomic TTL liveness checks + GEODIST computation
 *   - Server-side threshold filtering
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} userId
 * @param {Array<{friendId: string, displayName: string, circles: Array}>} friends
 * @returns {Promise<Array<{friendId: string, displayName: string, distanceMeters: number, circleId: string|null, circleName: string|null, proximityThreshold: number}>>}
 */
export async function checkProximityMatches(redis, userId, friends) {
  // Build the per-friend threshold map for the Lua script
  const friendThresholds = friends.map((f) => {
    const { threshold } = resolveThreshold(f.circles);
    return { friendId: f.friendId, threshold };
  });

  // Execute atomic proximity check (single Redis round-trip)
  const rawMatches = await atomicProximityCheck(redis, userId, friendThresholds);

  // Enrich raw matches with display names, circle context, and cap results
  const enriched = [];
  const friendMap = new Map(friends.map((f) => [f.friendId, f]));

  for (const match of rawMatches) {
    if (enriched.length >= MAX_PROXIMITY_MATCHES) break;

    const friend = friendMap.get(match.friendId);
    if (!friend) continue;

    const { threshold, circleId, circleName } = resolveThreshold(friend.circles);

    enriched.push({
      friendId: match.friendId,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl || null,
      statusEmoji: friend.statusEmoji || null,
      statusText: friend.statusText || null,
      distanceMeters: match.distanceMeters,
      circleId,
      circleName,
      proximityThreshold: threshold,
    });
  }

  return enriched;
}

/**
 * Processes proximity matches: deduplicates and enqueues to SQS.
 *
 * For each match:
 *   1. Check dedup (Lua sorted set with 15-min cooldown)
 *   2. If not duplicate, generate a matchId and enqueue to SQS
 *   3. Record the nudge event in PostgreSQL for audit trail
 *
 * @param {object} deps — Injected dependencies
 * @param {import('ioredis').Redis} deps.redis
 * @param {import('pg').Pool} deps.db
 * @param {object} deps.sqs — SQS client from fastify.sqs
 * @param {import('pino').Logger} deps.log
 * @param {string} userId — Sender
 * @param {Array<object>} matches — Proximity matches to process
 * @param {string} checkedAt — ISO8601 timestamp
 * @param {object} [approxLocation] — Privacy-rounded approximate location
 * @param {number} [approxLocation.approximateLat] — Latitude rounded to ~1km
 * @param {number} [approxLocation.approximateLng] — Longitude rounded to ~1km
 * @returns {Promise<{queued: number, deduplicated: number}>}
 */
export async function processProximityMatches(deps, userId, matches, checkedAt, approxLocation = {}) {
  const { redis, db, sqs, log } = deps;
  let queued = 0;
  let deduplicated = 0;

  for (const match of matches) {
    // 1. Deduplication check (atomic Lua script)
    const shouldSend = await checkNudgeDedup(redis, userId, match.friendId);

    if (!shouldSend) {
      deduplicated++;
      log.debug(
        { senderId: userId, receiverId: match.friendId },
        'Nudge deduplicated (within cooldown window)',
      );
      continue;
    }

    // 2. Generate unique match ID for idempotency
    const matchId = randomUUID();

    // 3. Record nudge event in PostgreSQL (audit trail, no GPS stored)
    try {
      await db.query(
        `INSERT INTO nudge_events (id, sender_id, receiver_id, proximity_meters, circle_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [matchId, userId, match.friendId, match.distanceMeters, match.circleId],
      );
    } catch (err) {
      log.error({ err, matchId }, 'Failed to record nudge event — continuing');
    }

    // 4. Enqueue to SQS for AI processing
    //    Includes approximate location for Lambda venue/weather lookups
    //    (rounded to ~1km precision — not exact GPS)
    try {
      await sqs.sendProximityMatch({
        matchId,
        senderId: userId,
        receiverId: match.friendId,
        senderName: null, // Will be fetched by Lambda
        receiverName: match.displayName,
        distanceMeters: match.distanceMeters,
        circleId: match.circleId,
        circleName: match.circleName,
        timestamp: checkedAt,
        // Approximate location for venue/weather context (privacy-rounded)
        approximateLat: approxLocation.approximateLat || null,
        approximateLng: approxLocation.approximateLng || null,
      });
      queued++;
    } catch (err) {
      log.error({ err, matchId }, 'Failed to enqueue proximity match — continuing');
    }
  }

  return { queued, deduplicated };
}
