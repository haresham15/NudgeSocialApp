// ============================================================================
// Friends Module — JSON Schema Definitions
// ============================================================================

export const sendRequestSchema = {
  body: {
    type: 'object',
    required: ['addresseeId'],
    properties: {
      addresseeId: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        requesterId: { type: 'string', format: 'uuid' },
        addresseeId: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const acceptRequestSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        acceptedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const blockUserSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export const removeFriendSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export const listFriendsSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        friends: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              username: { type: 'string', nullable: true },
              avatarUrl: { type: 'string', nullable: true },
              statusEmoji: { type: 'string', nullable: true },
              statusText: { type: 'string', nullable: true },
              acceptedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'integer' },
      },
    },
  },
};

export const listPendingSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        incoming: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              friendshipId: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              username: { type: 'string', nullable: true },
              avatarUrl: { type: 'string', nullable: true },
              sentAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        outgoing: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              friendshipId: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              username: { type: 'string', nullable: true },
              avatarUrl: { type: 'string', nullable: true },
              sentAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
};
