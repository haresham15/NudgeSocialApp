// ============================================================================
// Statuses Module — Service Layer
// ============================================================================
// Ephemeral 2-hour statuses with cooldown enforcement.
// Statuses are also synced to the users table for fast proximity lookups.
// ============================================================================

import { Errors } from '../../utils/errors.js';
import { STATUS_COOLDOWN_HOURS } from '../../utils/constants.js';

export async function postStatus(db, userId, data) {
  // Check for active cooldown (non-expired status)
  const active = await db.query(
    `SELECT id, expires_at FROM statuses
     WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY expires_at DESC LIMIT 1`,
    [userId],
  );

  if (active.rowCount > 0) {
    throw Errors.cooldownActive(active.rows[0].expires_at);
  }

  const expiresAt = new Date(Date.now() + STATUS_COOLDOWN_HOURS * 60 * 60 * 1000);

  // Insert status record AND update user's inline status fields atomically
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const statusResult = await client.query(
      `INSERT INTO statuses (user_id, emoji, text, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, emoji, text, expires_at, created_at`,
      [userId, data.emoji, data.text, expiresAt],
    );

    // Sync to users table for fast lookups during proximity checks
    await client.query(
      `UPDATE users SET status_emoji = $1, status_text = $2, status_expires_at = $3
       WHERE id = $4`,
      [data.emoji, data.text, expiresAt, userId],
    );

    await client.query('COMMIT');

    const row = statusResult.rows[0];
    return {
      id: row.id,
      emoji: row.emoji,
      text: row.text,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getMyStatus(db, userId) {
  const result = await db.query(
    `SELECT id, emoji, text, expires_at, created_at
     FROM statuses
     WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY expires_at DESC LIMIT 1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return { status: null };
  }

  const row = result.rows[0];
  return {
    status: {
      id: row.id,
      emoji: row.emoji,
      text: row.text,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    },
  };
}

export async function getFriendStatuses(db, userId) {
  const result = await db.query(
    `SELECT
       u.id AS user_id,
       u.display_name,
       u.avatar_url,
       u.status_emoji AS emoji,
       u.status_text AS text,
       u.status_expires_at AS expires_at
     FROM friendships f
     JOIN users u ON u.id = CASE
       WHEN f.requester_id = $1 THEN f.addressee_id
       ELSE f.requester_id
     END
     WHERE f.status = 'accepted'
       AND (f.requester_id = $1 OR f.addressee_id = $1)
       AND u.status_expires_at > NOW()
       AND u.status_emoji IS NOT NULL
     ORDER BY u.status_expires_at DESC`,
    [userId],
  );

  return {
    statuses: result.rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      emoji: r.emoji,
      text: r.text,
      expiresAt: r.expires_at,
    })),
  };
}

export async function clearStatus(db, userId) {
  // Clear the inline status fields on the user
  await db.query(
    `UPDATE users SET status_emoji = NULL, status_text = NULL, status_expires_at = NULL
     WHERE id = $1`,
    [userId],
  );

  // Expire the active status record
  await db.query(
    `UPDATE statuses SET expires_at = NOW()
     WHERE user_id = $1 AND expires_at > NOW()`,
    [userId],
  );

  return { message: 'Status cleared' };
}
