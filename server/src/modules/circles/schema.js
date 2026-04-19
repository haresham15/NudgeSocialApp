// ============================================================================
// Circles Module — JSON Schema Definitions
// ============================================================================

const circleItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    emoji: { type: 'string', nullable: true },
    color: { type: 'string', nullable: true },
    proximityThreshold: { type: 'integer' },
    memberCount: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const createCircleSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      emoji: { type: 'string', maxLength: 10 },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      proximityThreshold: { type: 'integer', minimum: 50, maximum: 5000, default: 500 },
    },
    additionalProperties: false,
  },
  response: { 201: circleItem },
};

export const listCirclesSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        circles: { type: 'array', items: circleItem },
        total: { type: 'integer' },
      },
    },
  },
};

export const updateCircleSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      emoji: { type: 'string', maxLength: 10 },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      proximityThreshold: { type: 'integer', minimum: 50, maximum: 5000 },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  response: { 200: circleItem },
};

export const deleteCircleSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
  },
};

export const addMemberSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        circleId: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        joinedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const removeMemberSchema = {
  params: {
    type: 'object',
    required: ['id', 'userId'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
  },
};

export const getCircleDetailSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        ...circleItem.properties,
        members: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              displayName: { type: 'string' },
              username: { type: 'string', nullable: true },
              avatarUrl: { type: 'string', nullable: true },
              joinedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
};
