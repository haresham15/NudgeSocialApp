// ============================================================================
// Nudges Module — JSON Schema Definitions
// ============================================================================

export const listNudgesSchema = {
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        nudges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              friendId: { type: 'string', format: 'uuid' },
              friendName: { type: 'string' },
              friendAvatar: { type: 'string', nullable: true },
              direction: { type: 'string', enum: ['sent', 'received'] },
              proximityMeters: { type: 'number', nullable: true },
              aiSuggestion: { type: 'object', nullable: true },
              vibeResponse: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'integer' },
      },
    },
  },
};

export const getNudgeDetailSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        senderId: { type: 'string', format: 'uuid' },
        senderName: { type: 'string' },
        receiverId: { type: 'string', format: 'uuid' },
        receiverName: { type: 'string' },
        proximityMeters: { type: 'number', nullable: true },
        aiSuggestion: { type: 'object', nullable: true },
        venueContext: { type: 'object', nullable: true },
        weatherContext: { type: 'object', nullable: true },
        vibeChecks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              responderId: { type: 'string', format: 'uuid' },
              responderName: { type: 'string' },
              response: { type: 'string' },
              respondedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const vibeCheckSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    required: ['response'],
    properties: {
      response: { type: 'string', enum: ['yes', 'maybe_later', 'not_today'] },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        nudgeEventId: { type: 'string', format: 'uuid' },
        response: { type: 'string' },
        respondedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};
