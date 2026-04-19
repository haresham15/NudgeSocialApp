// ============================================================================
// Constants — Application-wide magic numbers and configuration defaults
// ============================================================================

/** Redis TTL for cached location data (seconds). Per privacy mandate. */
export const REDIS_LOCATION_TTL_SECONDS = 30;

/** Default proximity threshold in meters for friend matching. */
export const DEFAULT_PROXIMITY_THRESHOLD_METERS = 500;

/** Maximum proximity threshold a circle can configure (meters). */
export const MAX_PROXIMITY_THRESHOLD_METERS = 5000;

/** Status cooldown duration in hours. Users cannot post a new status until
 *  their current one expires. */
export const STATUS_COOLDOWN_HOURS = 2;

/** Redis key prefix for geo-location data. */
export const REDIS_KEY_PREFIX_GEO = 'nudge:geo';

/** Redis key prefix for individual user location metadata. */
export const REDIS_KEY_PREFIX_LOCATION = 'nudge:loc';

/** Maximum number of matches to return from a single location check. */
export const MAX_PROXIMITY_MATCHES = 50;

/** Redis key prefix for nudge deduplication sorted set. */
export const REDIS_KEY_PREFIX_DEDUP = 'nudge:dedup';

/** Cooldown between duplicate nudges for the same friend pair (seconds).
 *  15 minutes prevents spam while allowing reasonable re-nudging. */
export const NUDGE_DEDUP_COOLDOWN_SECONDS = 900;


/** AI engine latency budget (milliseconds). */
export const AI_LATENCY_BUDGET_MS = 4000;

/** Apple JWKS endpoint for Sign-in with Apple token validation. */
export const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

/** Apple token issuer for validation. */
export const APPLE_TOKEN_ISSUER = 'https://appleid.apple.com';
