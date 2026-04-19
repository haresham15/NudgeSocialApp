// ============================================================================
// Rallies Module — Service Layer
// ============================================================================

import { Errors } from '../../utils/errors.js';

export async function createRally(db, userId, data) {
  // Verify circle ownership or membership
  const circle = await db.query(
    `SELECT c.id, c.name FROM circles c
     WHERE c.id = $1
       AND (c.owner_id = $2 OR EXISTS (
         SELECT 1 FROM circle_members cm WHERE cm.circle_id = c.id AND cm.user_id = $2
       ))`,
    [data.circleId, userId],
  );

  if (circle.rowCount === 0) throw Errors.notFound('Circle');

  // Must be in the future
  if (new Date(data.scheduledAt) <= new Date()) {
    throw Errors.badRequest('Rally must be scheduled in the future');
  }

  const result = await db.query(
    `INSERT INTO rallies (creator_id, circle_id, title, description, venue_id, venue_name, venue_address, venue_lat, venue_lng, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, creator_id, circle_id, title, description, venue_name, venue_address, scheduled_at, status, created_at`,
    [userId, data.circleId, data.title, data.description || null,
     data.venueId || null, data.venueName || null, data.venueAddress || null,
     data.venueLat || null, data.venueLng || null, data.scheduledAt],
  );

  const r = result.rows[0];
  return {
    id: r.id,
    creatorId: r.creator_id,
    creatorName: '', // Will be resolved in route
    circleId: r.circle_id,
    circleName: circle.rows[0].name,
    title: r.title,
    description: r.description,
    venueName: r.venue_name,
    venueAddress: r.venue_address,
    scheduledAt: r.scheduled_at,
    status: r.status,
    rsvpCounts: { going: 0, maybe: 0, declined: 0 },
    myRsvp: null,
    createdAt: r.created_at,
  };
}

export async function listRallies(db, userId, filters = {}) {
  let conditions = [`(c.owner_id = $1 OR EXISTS (
    SELECT 1 FROM circle_members cm WHERE cm.circle_id = c.id AND cm.user_id = $1
  ))`];
  const params = [userId];
  let paramIdx = 2;

  if (filters.circleId) {
    conditions.push(`r.circle_id = $${paramIdx}`);
    params.push(filters.circleId);
    paramIdx++;
  }

  if (filters.status) {
    conditions.push(`r.status = $${paramIdx}`);
    params.push(filters.status);
    paramIdx++;
  }

  if (filters.upcoming !== false) {
    conditions.push('r.scheduled_at > NOW()');
  }

  const result = await db.query(
    `SELECT
       r.id, r.creator_id, r.circle_id, r.title, r.description,
       r.venue_name, r.venue_address, r.scheduled_at, r.status, r.created_at,
       u.display_name AS creator_name,
       c.name AS circle_name,
       rsvp.status AS my_rsvp,
       COALESCE((SELECT COUNT(*) FROM rally_rsvps WHERE rally_id = r.id AND status = 'going')::int, 0) AS going,
       COALESCE((SELECT COUNT(*) FROM rally_rsvps WHERE rally_id = r.id AND status = 'maybe')::int, 0) AS maybe,
       COALESCE((SELECT COUNT(*) FROM rally_rsvps WHERE rally_id = r.id AND status = 'declined')::int, 0) AS declined
     FROM rallies r
     JOIN users u ON u.id = r.creator_id
     JOIN circles c ON c.id = r.circle_id
     LEFT JOIN rally_rsvps rsvp ON rsvp.rally_id = r.id AND rsvp.user_id = $1
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.scheduled_at ASC`,
    params,
  );

  return {
    rallies: result.rows.map(mapRallyRow),
    total: result.rowCount,
  };
}

export async function getRallyDetail(db, userId, rallyId) {
  const result = await db.query(
    `SELECT
       r.id, r.creator_id, r.circle_id, r.title, r.description,
       r.venue_name, r.venue_address, r.scheduled_at, r.status, r.created_at,
       u.display_name AS creator_name,
       c.name AS circle_name,
       rsvp.status AS my_rsvp,
       COALESCE((SELECT COUNT(*) FROM rally_rsvps WHERE rally_id = r.id AND status = 'going')::int, 0) AS going,
       COALESCE((SELECT COUNT(*) FROM rally_rsvps WHERE rally_id = r.id AND status = 'maybe')::int, 0) AS maybe,
       COALESCE((SELECT COUNT(*) FROM rally_rsvps WHERE rally_id = r.id AND status = 'declined')::int, 0) AS declined
     FROM rallies r
     JOIN users u ON u.id = r.creator_id
     JOIN circles c ON c.id = r.circle_id
     LEFT JOIN rally_rsvps rsvp ON rsvp.rally_id = r.id AND rsvp.user_id = $1
     WHERE r.id = $2
       AND (c.owner_id = $1 OR EXISTS (
         SELECT 1 FROM circle_members cm WHERE cm.circle_id = c.id AND cm.user_id = $1
       ))`,
    [userId, rallyId],
  );

  if (result.rowCount === 0) throw Errors.notFound('Rally');

  // Fetch all RSVPs
  const rsvps = await db.query(
    `SELECT rr.user_id, u.display_name, u.avatar_url, rr.status, rr.updated_at
     FROM rally_rsvps rr
     JOIN users u ON u.id = rr.user_id
     WHERE rr.rally_id = $1
     ORDER BY rr.updated_at DESC`,
    [rallyId],
  );

  const detail = mapRallyRow(result.rows[0]);
  detail.rsvps = rsvps.rows.map((v) => ({
    userId: v.user_id,
    displayName: v.display_name,
    avatarUrl: v.avatar_url,
    status: v.status,
    updatedAt: v.updated_at,
  }));

  return detail;
}

export async function updateRallyStatus(db, userId, rallyId, newStatus) {
  const result = await db.query(
    `UPDATE rallies SET status = $1
     WHERE id = $2 AND creator_id = $3
     RETURNING id, status, updated_at`,
    [newStatus, rallyId, userId],
  );

  if (result.rowCount === 0) throw Errors.notFound('Rally');

  const r = result.rows[0];
  return {
    id: r.id,
    status: r.status,
    updatedAt: r.updated_at,
  };
}

export async function rsvpToRally(db, userId, rallyId, rsvpStatus) {
  // Verify user has access to the rally (circle member or owner)
  const rally = await db.query(
    `SELECT r.id FROM rallies r
     JOIN circles c ON c.id = r.circle_id
     WHERE r.id = $1
       AND r.status != 'cancelled'
       AND (c.owner_id = $2 OR EXISTS (
         SELECT 1 FROM circle_members cm WHERE cm.circle_id = c.id AND cm.user_id = $2
       ))`,
    [rallyId, userId],
  );

  if (rally.rowCount === 0) throw Errors.notFound('Rally');

  // Upsert RSVP (INSERT on conflict UPDATE)
  const result = await db.query(
    `INSERT INTO rally_rsvps (rally_id, user_id, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (rally_id, user_id) DO UPDATE SET status = $3
     RETURNING rally_id, user_id, status, updated_at`,
    [rallyId, userId, rsvpStatus],
  );

  const r = result.rows[0];
  return {
    rallyId: r.rally_id,
    userId: r.user_id,
    status: r.status,
    updatedAt: r.updated_at,
  };
}

function mapRallyRow(r) {
  return {
    id: r.id,
    creatorId: r.creator_id,
    creatorName: r.creator_name,
    circleId: r.circle_id,
    circleName: r.circle_name,
    title: r.title,
    description: r.description,
    venueName: r.venue_name,
    venueAddress: r.venue_address,
    scheduledAt: r.scheduled_at,
    status: r.status,
    rsvpCounts: {
      going: r.going || 0,
      maybe: r.maybe || 0,
      declined: r.declined || 0,
    },
    myRsvp: r.my_rsvp || null,
    createdAt: r.created_at,
  };
}
