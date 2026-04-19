-- ============================================================================
-- Lua Script: Atomic Proximity Batch Check
-- ============================================================================
-- Executes entirely within Redis as a single atomic operation.
-- For a given user, checks all provided friend IDs for:
--   1. TTL marker key still alive (location not expired)
--   2. Both members present in the geo set
--   3. Haversine distance via GEODIST ≤ per-friend threshold
--
-- Returns a JSON array of matched friends with distances.
--
-- KEYS[1] = geo set key (e.g. "nudge:geo")
-- KEYS[2] = location key prefix (e.g. "nudge:loc")
--
-- ARGV[1] = requesting user ID
-- ARGV[2] = JSON-encoded array of { friendId, threshold } objects
--
-- Returns: JSON string of matches [{ friendId, distanceMeters }, ...]
-- ============================================================================

local geoKey = KEYS[1]
local locPrefix = KEYS[2]
local userId = ARGV[1]
local friendsJson = ARGV[2]

-- Parse the friends array
local friends = cjson.decode(friendsJson)
local matches = {}

for i, friend in ipairs(friends) do
    local friendId = friend.friendId
    local threshold = tonumber(friend.threshold)

    -- 1. Check if the friend's TTL marker key is still alive
    local ttlKey = locPrefix .. ":" .. friendId
    local alive = redis.call("EXISTS", ttlKey)

    if alive == 1 then
        -- 2. Compute Haversine distance via GEODIST (meters)
        local dist = redis.call("GEODIST", geoKey, userId, friendId, "m")

        if dist then
            local distNum = tonumber(dist)

            -- 3. Check against the per-friend proximity threshold
            if distNum <= threshold then
                table.insert(matches, {
                    friendId = friendId,
                    distanceMeters = math.floor(distNum + 0.5)
                })
            end
        end
    end
end

return cjson.encode(matches)
