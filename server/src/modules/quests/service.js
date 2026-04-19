// ============================================================================
// Quests Module — Service Layer
// ============================================================================
// AI-driven social challenges with progress tracking and XP rewards.
// ============================================================================

import { Errors } from '../../utils/errors.js';

export async function listActiveQuests(db, userId) {
  const result = await db.query(
    `SELECT id, title, description, type, progress, goal, xp_reward, completed_at, expires_at, created_at
     FROM quests
     WHERE user_id = $1
       AND completed_at IS NULL
       AND expires_at > NOW()
     ORDER BY expires_at ASC`,
    [userId],
  );

  // Total XP earned from completed quests
  const xpResult = await db.query(
    'SELECT COALESCE(SUM(xp_reward), 0)::int AS total FROM quests WHERE user_id = $1 AND completed_at IS NOT NULL',
    [userId],
  );

  return {
    quests: result.rows.map(mapQuestRow),
    totalXpEarned: xpResult.rows[0].total,
  };
}

export async function listCompletedQuests(db, userId, { limit = 20, offset = 0 }) {
  const result = await db.query(
    `SELECT id, title, description, type, progress, goal, xp_reward, completed_at, expires_at, created_at
     FROM quests
     WHERE user_id = $1 AND completed_at IS NOT NULL
     ORDER BY completed_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  const countResult = await db.query(
    'SELECT COUNT(*)::int AS total FROM quests WHERE user_id = $1 AND completed_at IS NOT NULL',
    [userId],
  );

  const xpResult = await db.query(
    'SELECT COALESCE(SUM(xp_reward), 0)::int AS total FROM quests WHERE user_id = $1 AND completed_at IS NOT NULL',
    [userId],
  );

  return {
    quests: result.rows.map(mapQuestRow),
    total: countResult.rows[0].total,
    totalXpEarned: xpResult.rows[0].total,
  };
}

export async function incrementProgress(db, userId, questId, amount = 1) {
  // Fetch the quest and verify ownership + active status
  const quest = await db.query(
    `SELECT id, progress, goal, completed_at, expires_at
     FROM quests
     WHERE id = $1 AND user_id = $2`,
    [questId, userId],
  );

  if (quest.rowCount === 0) throw Errors.notFound('Quest');

  const q = quest.rows[0];

  if (q.completed_at) throw Errors.badRequest('Quest is already completed');
  if (new Date(q.expires_at) < new Date()) throw Errors.badRequest('Quest has expired');

  // Calculate new progress (capped at goal)
  const newProgress = Math.min(q.progress + amount, q.goal);
  const justCompleted = newProgress >= q.goal;

  const result = await db.query(
    `UPDATE quests
     SET progress = $1, completed_at = $2
     WHERE id = $3
     RETURNING id, title, description, type, progress, goal, xp_reward, completed_at, expires_at, created_at`,
    [newProgress, justCompleted ? new Date() : null, questId],
  );

  const row = result.rows[0];
  return {
    ...mapQuestRow(row),
    justCompleted,
  };
}

function mapQuestRow(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    progress: r.progress,
    goal: r.goal,
    xpReward: r.xp_reward,
    completedAt: r.completed_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}
