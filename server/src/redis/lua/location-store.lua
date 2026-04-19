-- ============================================================================
-- Lua Script: Atomic Location Store with TTL
-- ============================================================================
-- Atomically stores a user's location in the geo set AND sets a TTL marker.
-- This ensures both operations happen together or not at all.
--
-- KEYS[1] = geo set key (e.g. "nudge:geo")
-- KEYS[2] = per-user TTL marker key (e.g. "nudge:loc:<userId>")
--
-- ARGV[1] = longitude
-- ARGV[2] = latitude
-- ARGV[3] = userId (member name in geo set)
-- ARGV[4] = TTL in seconds
-- ARGV[5] = metadata JSON (lat, lng, timestamp)
--
-- Returns: "OK"
-- ============================================================================

local geoKey = KEYS[1]
local ttlKey = KEYS[2]
local lng = ARGV[1]
local lat = ARGV[2]
local userId = ARGV[3]
local ttl = tonumber(ARGV[4])
local metadata = ARGV[5]

-- Add to geo set (GEOADD key longitude latitude member)
redis.call("GEOADD", geoKey, lng, lat, userId)

-- Set the TTL marker with expiration
redis.call("SETEX", ttlKey, ttl, metadata)

return "OK"
