// ============================================================================
// Quests Module — JSON Schema Definitions
// ============================================================================

const questItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['daily', 'weekly', 'streak'] },
    progress: { type: 'integer' },
    goal: { type: 'integer' },
    xpReward: { type: 'integer' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    expiresAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const listActiveQuestsSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        quests: { type: 'array', items: questItem },
        totalXpEarned: { type: 'integer' },
      },
    },
  },
};

export const listCompletedQuestsSchema = {
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
        quests: { type: 'array', items: questItem },
        total: { type: 'integer' },
        totalXpEarned: { type: 'integer' },
      },
    },
  },
};

export const incrementProgressSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
  body: {
    type: 'object',
    properties: {
      amount: { type: 'integer', minimum: 1, default: 1 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        ...questItem.properties,
        justCompleted: { type: 'boolean' },
      },
    },
  },
};
