// ============================================================================
// Location Module — JSON Schema Definitions (v2)
// ============================================================================
// Includes schemas for both the proximity check and location evict endpoints.
// Response schema now includes queued/deduplicated counts and friend context.
// ============================================================================

export const locationCheckSchema = {
  body: {
    type: 'object',
    required: ['lat', 'lng'],
    properties: {
      lat: {
        type: 'number',
        minimum: -90,
        maximum: 90,
        description: 'Latitude in decimal degrees (WGS 84)',
      },
      lng: {
        type: 'number',
        minimum: -180,
        maximum: 180,
        description: 'Longitude in decimal degrees (WGS 84)',
      },
      accuracy: {
        type: 'number',
        minimum: 0,
        description: 'GPS accuracy in meters (informational)',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              friendId: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              avatarUrl: { type: 'string', nullable: true },
              statusEmoji: { type: 'string', nullable: true },
              statusText: { type: 'string', nullable: true },
              distanceMeters: { type: 'number' },
              circleId: { type: 'string', format: 'uuid', nullable: true },
              circleName: { type: 'string', nullable: true },
              proximityThreshold: { type: 'integer' },
            },
          },
        },
        checkedAt: { type: 'string', format: 'date-time' },
        friendsChecked: { type: 'integer' },
        queued: {
          type: 'integer',
          description: 'Number of matches enqueued to SQS for AI processing',
        },
        deduplicated: {
          type: 'integer',
          description: 'Number of matches skipped due to recent nudge dedup',
        },
      },
    },
  },
};

export const locationEvictSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        evicted: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  },
};
