-- ============================================================================
-- Lua Script: Nudge Deduplication Check
-- ============================================================================
-- Prevents duplicate nudges between the same pair within a cooldown window.
-- Uses a sorted set with timestamps to track recent nudge pairs.
--
-- KEYS[1] = dedup set key (e.g. "nudge:dedup")
--
-- ARGV[1] = pair key (sorted concatenation of user IDs: "id1:id2")
-- ARGV[2] = current timestamp (epoch seconds)
-- ARGV[3] = cooldown window in seconds
--
-- Returns: 1 if nudge should be sent (not duplicate), 0 if duplicate
-- ============================================================================

local dedupKey = KEYS[1]
local pairKey = ARGV[1]
local now = tonumber(ARGV[2])
local cooldown = tonumber(ARGV[3])

-- Clean up expired entries (older than cooldown window)
redis.call("ZREMRANGEBYSCORE", dedupKey, "-inf", now - cooldown)

-- Check if this pair already has a recent nudge
local exists = redis.call("ZSCORE", dedupKey, pairKey)

if exists then
    return 0  -- Duplicate — do not send
end

-- Mark this pair as nudged
redis.call("ZADD", dedupKey, now, pairKey)

-- Set expiration on the whole set to auto-cleanup (2x cooldown as safety margin)
redis.call("EXPIRE", dedupKey, cooldown * 2)

return 1  -- Not duplicate — send the nudge
