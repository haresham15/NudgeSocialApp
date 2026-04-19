// ============================================================================
// Database Context Fetcher
// ============================================================================
// Queries PostgreSQL to enrich the proximity match with user context:
//   - Display names, avatars, and statuses for both users
//   - Push tokens for notification delivery
//   - Recent location metadata (approximate area, NOT GPS coordinates)
//
// This module uses the pg driver directly (no Fastify dependency) since it
// runs inside the Lambda function.
// ============================================================================

import pg from 'pg';

const { Pool } = pg;

let pool = null;

/**
 * Returns a shared PostgreSQL pool instance.
 * Lazy-initialized on first call. Lambda may reuse the pool across
 * warm invocations.
 *
 * @param {string} connectionString
 * @returns {import('pg').Pool}
 */
function getPool(connectionString) {
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 3, // Lambda has limited connections; keep pool small
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

/**
 * @typedef {object} UserContext
 * @property {string}      id           — UUID
 * @property {string}      displayName
 * @property {string|null} avatarUrl
 * @property {string|null} statusEmoji
 * @property {string|null} statusText
 * @property {string|null} pushToken    — APNs device token
 */

/**
 * Fetches context for both users in a proximity match.
 *
 * @param {string} connectionString
 * @param {string} senderId
 * @param {string} receiverId
 * @returns {Promise<{sender: UserContext, receiver: UserContext}>}
 */
export async function fetchMatchContext(connectionString, senderId, receiverId) {
  const db = getPool(connectionString);

  const result = await db.query(
    `SELECT
       id,
       display_name,
       avatar_url,
       status_emoji,
       status_text,
       push_token
     FROM users
     WHERE id = ANY($1)`,
    [[senderId, receiverId]],
  );

  const users = new Map(result.rows.map((u) => [u.id, u]));

  const toContext = (row) => ({
    id: row?.id || null,
    displayName: row?.display_name || 'Friend',
    avatarUrl: row?.avatar_url || null,
    statusEmoji: row?.status_emoji || null,
    statusText: row?.status_text || null,
    pushToken: row?.push_token || null,
  });

  return {
    sender: toContext(users.get(senderId)),
    receiver: toContext(users.get(receiverId)),
  };
}

/**
 * Updates a nudge event with AI suggestion and context data.
 * This writes the AI-generated suggestion, venue context, and weather
 * context back to the nudge_events table as JSONB.
 *
 * @param {string} connectionString
 * @param {string} matchId — nudge_events.id
 * @param {object} data
 * @param {object} data.aiSuggestion   — Claude's structured response
 * @param {object} data.venueContext   — Yelp venue data
 * @param {object} data.weatherContext — WeatherKit data
 */
export async function updateNudgeEvent(connectionString, matchId, data) {
  const db = getPool(connectionString);

  await db.query(
    `UPDATE nudge_events
     SET
       ai_suggestion = $1,
       venue_context = $2,
       weather_context = $3
     WHERE id = $4`,
    [
      JSON.stringify(data.aiSuggestion),
      JSON.stringify(data.venueContext),
      JSON.stringify(data.weatherContext),
      matchId,
    ],
  );
}

/**
 * Cleans up the connection pool. Call this if the Lambda is being
 * explicitly terminated (not commonly needed due to Lambda lifecycle).
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
