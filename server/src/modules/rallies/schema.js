// ============================================================================
// Rallies Module — JSON Schema Definitions
// ============================================================================

const rallyItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    creatorId: { type: 'string', format: 'uuid' },
    creatorName: { type: 'string' },
    circleId: { type: 'string', format: 'uuid' },
    circleName: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    venueName: { type: 'string', nullable: true },
    venueAddress: { type: 'string', nullable: true },
    scheduledAt: { type: 'string', format: 'date-time' },
    status: { type: 'string' },
    rsvpCounts: {
      type: 'object',
      properties: {
        going: { type: 'integer' },
        maybe: { type: 'integer' },
        declined: { type: 'integer' },
      },
    },
    myRsvp: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const createRallySchema = {
  body: {
    type: 'object',
    required: ['circleId', 'title', 'scheduledAt'],
    properties: {
      circleId: { type: 'string', format: 'uuid' },
      title: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      venueId: { type: 'string' },
      venueName: { type: 'string', maxLength: 200 },
      venueAddress: { type: 'string' },
      venueLat: { type: 'number', minimum: -90, maximum: 90 },
      venueLng: { type: 'number', minimum: -180, maximum: 180 },
      scheduledAt: { type: 'string', format: 'date-time' },
    },
    additionalProperties: false,
  },
  response: { 201: rallyItem },
};

export const listRalliesSchema = {
  querystring: {
    type: 'object',
    properties: {
      circleId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['proposed', 'confirmed', 'cancelled'] },
      upcoming: { type: 'boolean', default: true },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        rallies: { type: 'array', items: rallyItem },
        total: { type: 'integer' },
      },
    },
  },
};

export const getRallyDetailSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        ...rallyItem.properties,
        rsvps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              avatarUrl: { type: 'string', nullable: true },
              status: { type: 'string' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
};

export const updateRallyStatusSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['confirmed', 'cancelled'] },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const rsvpSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['going', 'maybe', 'declined'] },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        rallyId: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};
