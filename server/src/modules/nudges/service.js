// ============================================================================
// Nudges Module — Service Layer
// ============================================================================

import { Errors } from '../../utils/errors.js';

export async function listNudges(db, userId, { limit = 20, offset = 0 }) {
  const result = await db.query(
    `SELECT
       ne.id,
       CASE WHEN ne.sender_id = $1 THEN ne.receiver_id ELSE ne.sender_id END AS friend_id,
       CASE WHEN ne.sender_id = $1 THEN 'sent' ELSE 'received' END AS direction,
       u.display_name AS friend_name,
       u.avatar_url AS friend_avatar,
       ne.proximity_meters,
       ne.ai_suggestion,
       vc.response AS vibe_response,
       ne.created_at
     FROM nudge_events ne
     JOIN users u ON u.id = CASE
       WHEN ne.sender_id = $1 THEN ne.receiver_id
       ELSE ne.sender_id
     END
     LEFT JOIN vibe_checks vc ON vc.nudge_event_id = ne.id AND vc.responder_id = $1
     WHERE ne.sender_id = $1 OR ne.receiver_id = $1
     ORDER BY ne.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  // Get total count
  const countResult = await db.query(
    'SELECT COUNT(*)::int AS total FROM nudge_events WHERE sender_id = $1 OR receiver_id = $1',
    [userId],
  );

  return {
    nudges: result.rows.map((r) => ({
      id: r.id,
      friendId: r.friend_id,
      friendName: r.friend_name,
      friendAvatar: r.friend_avatar,
      direction: r.direction,
      proximityMeters: r.proximity_meters,
      aiSuggestion: r.ai_suggestion,
      vibeResponse: r.vibe_response,
      createdAt: r.created_at,
    })),
    total: countResult.rows[0].total,
  };
}

export async function getNudgeDetail(db, userId, nudgeId) {
  const result = await db.query(
    `SELECT
       ne.id, ne.sender_id, ne.receiver_id,
       ne.proximity_meters, ne.ai_suggestion, ne.venue_context, ne.weather_context,
       ne.created_at,
       s.display_name AS sender_name,
       r.display_name AS receiver_name
     FROM nudge_events ne
     JOIN users s ON s.id = ne.sender_id
     JOIN users r ON r.id = ne.receiver_id
     WHERE ne.id = $1
       AND (ne.sender_id = $2 OR ne.receiver_id = $2)`,
    [nudgeId, userId],
  );

  if (result.rowCount === 0) {
    throw Errors.notFound('Nudge event');
  }

  const nudge = result.rows[0];

  // Fetch vibe checks for this nudge
  const vibeResult = await db.query(
    `SELECT vc.responder_id, u.display_name AS responder_name, vc.response, vc.responded_at
     FROM vibe_checks vc
     JOIN users u ON u.id = vc.responder_id
     WHERE vc.nudge_event_id = $1
     ORDER BY vc.responded_at ASC`,
    [nudgeId],
  );

  return {
    id: nudge.id,
    senderId: nudge.sender_id,
    senderName: nudge.sender_name,
    receiverId: nudge.receiver_id,
    receiverName: nudge.receiver_name,
    proximityMeters: nudge.proximity_meters,
    aiSuggestion: nudge.ai_suggestion,
    venueContext: nudge.venue_context,
    weatherContext: nudge.weather_context,
    vibeChecks: vibeResult.rows.map((v) => ({
      responderId: v.responder_id,
      responderName: v.responder_name,
      response: v.response,
      respondedAt: v.responded_at,
    })),
    createdAt: nudge.created_at,
  };
}

export async function respondToNudge(db, userId, nudgeId, responseVal) {
  // Verify the nudge exists and user is involved
  const nudge = await db.query(
    `SELECT id FROM nudge_events
     WHERE id = $1 AND (sender_id = $2 OR receiver_id = $2)`,
    [nudgeId, userId],
  );

  if (nudge.rowCount === 0) {
    throw Errors.notFound('Nudge event');
  }

  try {
    const result = await db.query(
      `INSERT INTO vibe_checks (nudge_event_id, responder_id, response)
       VALUES ($1, $2, $3)
       RETURNING id, nudge_event_id, response, responded_at`,
      [nudgeId, userId, responseVal],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      nudgeEventId: row.nudge_event_id,
      response: row.response,
      respondedAt: row.responded_at,
    };
  } catch (err) {
    if (err.code === '23505') { // Unique violation — already responded
      throw Errors.conflict('Already responded to this nudge');
    }
    throw err;
  }
}
