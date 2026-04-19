// ============================================================================
// Config — Environment variable loading & validation
// ============================================================================
// Uses @fastify/env to schema-validate all required env vars at startup.
// Missing or invalid values will cause a hard crash before any route is
// registered, preventing misconfigured deployments.
// ============================================================================

/** @type {import('@fastify/env').FastifyEnvOptions} */
const envSchema = {
  type: 'object',
  required: [
    'JWT_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
  ],
  properties: {
    PORT: {
      type: 'integer',
      default: 3000,
    },
    NODE_ENV: {
      type: 'string',
      default: 'development',
      enum: ['development', 'production', 'test'],
    },

    // ─── Database ──────────────────────────────────────────
    DATABASE_URL: {
      type: 'string',
    },

    // ─── Redis ─────────────────────────────────────────────
    REDIS_URL: {
      type: 'string',
    },

    // ─── JWT ───────────────────────────────────────────────
    JWT_SECRET: {
      type: 'string',
      minLength: 32,
    },
    JWT_EXPIRES_IN: {
      type: 'string',
      default: '30m',
    },
    JWT_REFRESH_EXPIRES_IN: {
      type: 'string',
      default: '7d',
    },

    // ─── Apple Sign In ─────────────────────────────────────
    APPLE_CLIENT_ID: {
      type: 'string',
      default: '',
    },
    APPLE_TEAM_ID: {
      type: 'string',
      default: '',
    },

    // ─── Twilio Verify ─────────────────────────────────────
    TWILIO_ACCOUNT_SID: {
      type: 'string',
      default: '',
    },
    TWILIO_AUTH_TOKEN: {
      type: 'string',
      default: '',
    },
    TWILIO_VERIFY_SERVICE_SID: {
      type: 'string',
      default: '',
    },

    // ─── AWS ───────────────────────────────────────────────
    AWS_REGION: {
      type: 'string',
      default: 'us-east-1',
    },
    SQS_PROXIMITY_QUEUE_URL: {
      type: 'string',
      default: '',
    },
  },
};

export const envOptions = {
  confKey: 'config',
  schema: envSchema,
  dotenv: true,
  data: process.env,
};
