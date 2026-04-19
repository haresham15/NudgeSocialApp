// ============================================================================
// Circles Module — Service Layer
// ============================================================================

import { Errors } from '../../utils/errors.js';

export async function createCircle(db, ownerId, data) {
  const result = await db.query(
    `INSERT INTO circles (owner_id, name, emoji, color, proximity_threshold)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, emoji, color, proximity_threshold, created_at`,
    [ownerId, data.name, data.emoji || null, data.color || null, data.proximityThreshold || 500],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    proximityThreshold: row.proximity_threshold,
    memberCount: 0,
    createdAt: row.created_at,
  };
}

export async function listCircles(db, ownerId) {
  const result = await db.query(
    `SELECT c.id, c.name, c.emoji, c.color, c.proximity_threshold, c.created_at,
            COUNT(cm.user_id)::int AS member_count
     FROM circles c
     LEFT JOIN circle_members cm ON cm.circle_id = c.id
     WHERE c.owner_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [ownerId],
  );

  return {
    circles: result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      color: r.color,
      proximityThreshold: r.proximity_threshold,
      memberCount: r.member_count,
      createdAt: r.created_at,
    })),
    total: result.rowCount,
  };
}

export async function getCircleDetail(db, userId, circleId) {
  // Verify ownership
  const circleResult = await db.query(
    `SELECT id, name, emoji, color, proximity_threshold, created_at
     FROM circles WHERE id = $1 AND owner_id = $2`,
    [circleId, userId],
  );

  if (circleResult.rowCount === 0) {
    throw Errors.notFound('Circle');
  }

  // Fetch members
  const members = await db.query(
    `SELECT u.id, u.display_name, u.username, u.avatar_url, cm.joined_at
     FROM circle_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.circle_id = $1
     ORDER BY cm.joined_at DESC`,
    [circleId],
  );

  const c = circleResult.rows[0];
  return {
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    proximityThreshold: c.proximity_threshold,
    memberCount: members.rowCount,
    createdAt: c.created_at,
    members: members.rows.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      username: m.username,
      avatarUrl: m.avatar_url,
      joinedAt: m.joined_at,
    })),
  };
}

export async function updateCircle(db, userId, circleId, data) {
  // Build dynamic SET clause
  const fields = [];
  const values = [];
  let paramIdx = 1;

  for (const [key, col] of [['name', 'name'], ['emoji', 'emoji'], ['color', 'color'], ['proximityThreshold', 'proximity_threshold']]) {
    if (data[key] !== undefined) {
      fields.push(`${col} = $${paramIdx}`);
      values.push(data[key]);
      paramIdx++;
    }
  }

  values.push(circleId, userId);

  const result = await db.query(
    `UPDATE circles SET ${fields.join(', ')}
     WHERE id = $${paramIdx} AND owner_id = $${paramIdx + 1}
     RETURNING id, name, emoji, color, proximity_threshold, created_at`,
    values,
  );

  if (result.rowCount === 0) {
    throw Errors.notFound('Circle');
  }

  const r = result.rows[0];
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    proximityThreshold: r.proximity_threshold,
    memberCount: 0, // Caller can refetch if needed
    createdAt: r.created_at,
  };
}

export async function deleteCircle(db, userId, circleId) {
  const result = await db.query(
    `DELETE FROM circles WHERE id = $1 AND owner_id = $2 RETURNING id`,
    [circleId, userId],
  );

  if (result.rowCount === 0) {
    throw Errors.notFound('Circle');
  }

  return { message: 'Circle deleted' };
}

export async function addMember(db, userId, circleId, memberId) {
  // Verify circle ownership
  const circle = await db.query(
    'SELECT id FROM circles WHERE id = $1 AND owner_id = $2',
    [circleId, userId],
  );
  if (circle.rowCount === 0) throw Errors.notFound('Circle');

  // Verify the member is an accepted friend
  const friendship = await db.query(
    `SELECT id FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1))`,
    [userId, memberId],
  );
  if (friendship.rowCount === 0) throw Errors.badRequest('User must be an accepted friend');

  try {
    const result = await db.query(
      `INSERT INTO circle_members (circle_id, user_id)
       VALUES ($1, $2)
       RETURNING circle_id, user_id, joined_at`,
      [circleId, memberId],
    );

    const row = result.rows[0];
    return {
      circleId: row.circle_id,
      userId: row.user_id,
      joinedAt: row.joined_at,
    };
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      throw Errors.conflict('User is already in this circle');
    }
    throw err;
  }
}

export async function removeMember(db, userId, circleId, memberId) {
  // Verify circle ownership
  const circle = await db.query(
    'SELECT id FROM circles WHERE id = $1 AND owner_id = $2',
    [circleId, userId],
  );
  if (circle.rowCount === 0) throw Errors.notFound('Circle');

  const result = await db.query(
    'DELETE FROM circle_members WHERE circle_id = $1 AND user_id = $2 RETURNING circle_id',
    [circleId, memberId],
  );

  if (result.rowCount === 0) throw Errors.notFound('Circle member');

  return { message: 'Member removed from circle' };
}
