// ============================================================================
// Redis Scripts Manager
// ============================================================================
// Loads Lua scripts from disk, registers them with Redis via EVALSHA for
// optimal performance (scripts are cached server-side by SHA), and provides
// a clean API for calling each script.
//
// Using EVALSHA instead of EVAL means:
//   - Scripts are transmitted to Redis only once (on first call or NOSCRIPT)
//   - Subsequent calls send only the SHA1 hash (~40 bytes vs full script)
//   - Redis caches compiled Lua bytecode for near-native performance
// ============================================================================

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  REDIS_KEY_PREFIX_GEO,
  REDIS_KEY_PREFIX_LOCATION,
  REDIS_LOCATION_TTL_SECONDS,
  REDIS_KEY_PREFIX_DEDUP,
  NUDGE_DEDUP_COOLDOWN_SECONDS,
} from '../utils/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUA_DIR = join(__dirname, 'lua');

/** @type {Map<string, string>} script name → SHA1 hash */
const scriptSHAs = new Map();

/** @type {Map<string, string>} script name → source code (fallback) */
const scriptSources = new Map();

/**
 * Loads all Lua scripts from disk and registers them with Redis.
 * Call this once during server startup (from the Redis plugin).
 *
 * @param {import('ioredis').Redis} redis
 * @param {import('pino').Logger} log
 */
export async function loadLuaScripts(redis, log) {
  const scripts = [
    { name: 'proximityCheck', file: 'proximity-check.lua' },
    { name: 'locationStore', file: 'location-store.lua' },
    { name: 'nudgeDedup', file: 'nudge-dedup.lua' },
  ];

  for (const script of scripts) {
    const source = await readFile(join(LUA_DIR, script.file), 'utf-8');
    scriptSources.set(script.name, source);

    // SCRIPT LOAD returns the SHA1 hash for EVALSHA
    const sha = await redis.script('LOAD', source);
    scriptSHAs.set(script.name, sha);

    log.info({ script: script.name, sha: sha.slice(0, 12) + '…' },
      'Lua script loaded');
  }
}

/**
 * Executes a loaded Lua script via EVALSHA with automatic fallback to EVAL
 * if Redis has evicted the cached script (e.g., after SCRIPT FLUSH).
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} scriptName
 * @param {number} numKeys
 * @param  {...any} args — KEYS followed by ARGV
 * @returns {Promise<any>}
 */
async function execScript(redis, scriptName, numKeys, ...args) {
  const sha = scriptSHAs.get(scriptName);
  const source = scriptSources.get(scriptName);

  if (!sha || !source) {
    throw new Error(`Lua script "${scriptName}" not loaded. Call loadLuaScripts() first.`);
  }

  try {
    return await redis.evalsha(sha, numKeys, ...args);
  } catch (err) {
    // NOSCRIPT error — Redis has evicted the cached script; fallback to EVAL
    if (err.message?.includes('NOSCRIPT')) {
      const result = await redis.eval(source, numKeys, ...args);
      // Re-cache the SHA for next time
      const newSha = await redis.script('LOAD', source);
      scriptSHAs.set(scriptName, newSha);
      return result;
    }
    throw err;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Atomically stores a user's location in Redis GEO set with a TTL marker.
 * Single round-trip, single atomic operation.
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} userId
 * @param {number} lat
 * @param {number} lng
 */
export async function atomicLocationStore(redis, userId, lat, lng) {
  const ttlKey = `${REDIS_KEY_PREFIX_LOCATION}:${userId}`;
  const metadata = JSON.stringify({ lat, lng, ts: Date.now() });

  return execScript(
    redis,
    'locationStore',
    2,                             // numKeys
    REDIS_KEY_PREFIX_GEO,          // KEYS[1]
    ttlKey,                        // KEYS[2]
    lng,                           // ARGV[1]
    lat,                           // ARGV[2]
    userId,                        // ARGV[3]
    REDIS_LOCATION_TTL_SECONDS,    // ARGV[4]
    metadata,                      // ARGV[5]
  );
}

/**
 * Atomically checks proximity for a user against a batch of friends.
 * Runs entirely inside Redis — zero network round-trips per friend.
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} userId
 * @param {Array<{friendId: string, threshold: number}>} friends
 * @returns {Promise<Array<{friendId: string, distanceMeters: number}>>}
 */
export async function atomicProximityCheck(redis, userId, friends) {
  if (friends.length === 0) return [];

  const friendsPayload = JSON.stringify(friends);

  const resultJson = await execScript(
    redis,
    'proximityCheck',
    2,                             // numKeys
    REDIS_KEY_PREFIX_GEO,          // KEYS[1]
    REDIS_KEY_PREFIX_LOCATION,     // KEYS[2]
    userId,                        // ARGV[1]
    friendsPayload,               // ARGV[2]
  );

  return JSON.parse(resultJson);
}

/**
 * Checks whether a nudge between two users is a duplicate (already sent
 * within the cooldown window). If not a duplicate, marks it as sent.
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} userId1
 * @param {string} userId2
 * @returns {Promise<boolean>} — true if nudge should be sent, false if duplicate
 */
export async function checkNudgeDedup(redis, userId1, userId2) {
  // Create a canonical pair key (sorted) to handle bidirectional checks
  const pairKey = [userId1, userId2].sort().join(':');
  const now = Math.floor(Date.now() / 1000);

  const result = await execScript(
    redis,
    'nudgeDedup',
    1,                              // numKeys
    REDIS_KEY_PREFIX_DEDUP,         // KEYS[1]
    pairKey,                        // ARGV[1]
    now,                            // ARGV[2]
    NUDGE_DEDUP_COOLDOWN_SECONDS,   // ARGV[3]
  );

  return result === 1;
}
