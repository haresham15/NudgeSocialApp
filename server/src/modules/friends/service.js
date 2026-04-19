// ============================================================================
// Friends Module — Service Layer
// ============================================================================

import { Errors } from '../../utils/errors.js';

export async function sendFriendRequest(db, requesterId, addresseeId) {
  if (requesterId === addresseeId) {
    throw Errors.badRequest('Cannot send a friend request to yourself');
  }

  // Check if the target user exists
  const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [addresseeId]);
  if (userCheck.rowCount === 0) {
    throw Errors.notFound('User');
  }

  // Check for existing friendship in either direction
  const existing = await db.query(
    `SELECT id, status FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)`,
    [requesterId, addresseeId],
  );

  if (existing.rowCount > 0) {
    const { status } = existing.rows[0];
    if (status === 'accepted') throw Errors.conflict('Already friends');
    if (status === 'pending') throw Errors.conflict('Friend request already pending');
    if (status === 'blocked') throw Errors.forbidden('Cannot send request to this user');
  }

  const result = await db.query(
    `INSERT INTO friendships (requester_id, addressee_id)
     VALUES ($1, $2)
     RETURNING id, requester_id, addressee_id, status, created_at`,
    [requesterId, addresseeId],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function acceptFriendRequest(db, userId, friendshipId) {
  // Only the addressee can accept
  const result = await db.query(
    `UPDATE friendships
     SET status = 'accepted', accepted_at = NOW()
     WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
     RETURNING id, status, accepted_at`,
    [friendshipId, userId],
  );

  if (result.rowCount === 0) {
    throw Errors.notFound('Pending friend request');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    acceptedAt: row.accepted_at,
  };
}

export async function blockUser(db, userId, friendshipId) {
  // Either party can block
  const result = await db.query(
    `UPDATE friendships
     SET status = 'blocked'
     WHERE id = $1
       AND (requester_id = $2 OR addressee_id = $2)
       AND status != 'blocked'
     RETURNING id`,
    [friendshipId, userId],
  );

  if (result.rowCount === 0) {
    throw Errors.notFound('Friendship');
  }

  return { message: 'User blocked' };
}

export async function removeFriend(db, userId, friendshipId) {
  const result = await db.query(
    `DELETE FROM friendships
     WHERE id = $1
       AND (requester_id = $2 OR addressee_id = $2)
     RETURNING id`,
    [friendshipId, userId],
  );

  if (result.rowCount === 0) {
    throw Errors.notFound('Friendship');
  }

  return { message: 'Friend removed' };
}

export async function listFriends(db, userId) {
  const result = await db.query(
    `SELECT
       u.id,
       u.display_name,
       u.username,
       u.avatar_url,
       u.status_emoji,
       u.status_text,
       f.accepted_at
     FROM friendships f
     JOIN users u ON u.id = CASE
       WHEN f.requester_id = $1 THEN f.addressee_id
       ELSE f.requester_id
     END
     WHERE f.status = 'accepted'
       AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY f.accepted_at DESC`,
    [userId],
  );

  return {
    friends: result.rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      username: r.username,
      avatarUrl: r.avatar_url,
      statusEmoji: r.status_emoji,
      statusText: r.status_text,
      acceptedAt: r.accepted_at,
    })),
    total: result.rowCount,
  };
}

export async function listPending(db, userId) {
  // Incoming requests (where I am the addressee)
  const incoming = await db.query(
    `SELECT f.id AS friendship_id, u.id AS user_id, u.display_name, u.username, u.avatar_url, f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId],
  );

  // Outgoing requests (where I am the requester)
  const outgoing = await db.query(
    `SELECT f.id AS friendship_id, u.id AS user_id, u.display_name, u.username, u.avatar_url, f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.addressee_id
     WHERE f.requester_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId],
  );

  const mapRow = (r) => ({
    friendshipId: r.friendship_id,
    userId: r.user_id,
    displayName: r.display_name,
    username: r.username,
    avatarUrl: r.avatar_url,
    sentAt: r.created_at,
  });

  return {
    incoming: incoming.rows.map(mapRow),
    outgoing: outgoing.rows.map(mapRow),
  };
}
