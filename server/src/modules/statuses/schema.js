// ============================================================================
// Statuses Module — JSON Schema Definitions
// ============================================================================

export const postStatusSchema = {
  body: {
    type: 'object',
    required: ['emoji', 'text'],
    properties: {
      emoji: { type: 'string', minLength: 1, maxLength: 10 },
      text: { type: 'string', minLength: 1, maxLength: 100 },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        emoji: { type: 'string' },
        text: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const getMyStatusSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        status: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string', format: 'uuid' },
            emoji: { type: 'string' },
            text: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
};

export const friendStatusesSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        statuses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              avatarUrl: { type: 'string', nullable: true },
              emoji: { type: 'string' },
              text: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
};

export const clearStatusSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};
