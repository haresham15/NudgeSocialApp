// ============================================================================
// Auth Module — JSON Schema definitions
// ============================================================================
// Fastify pre-compiles these into optimized validation functions at startup.
// These schemas also drive automatic Swagger/OpenAPI documentation.
// ============================================================================

export const appleSignInSchema = {
  body: {
    type: 'object',
    required: ['identityToken', 'displayName'],
    properties: {
      identityToken: {
        type: 'string',
        description: 'The Apple identity token (JWT) from Sign in with Apple',
      },
      authorizationCode: {
        type: 'string',
        description: 'The authorization code from Apple (optional)',
      },
      displayName: {
        type: 'string',
        minLength: 1,
        maxLength: 50,
        description: 'User display name (from Apple or user-provided)',
      },
      email: {
        type: 'string',
        format: 'email',
        description: 'Email (only provided on first Apple sign-in)',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            displayName: { type: 'string' },
            username: { type: 'string' },
            avatarUrl: { type: 'string' },
            phoneVerified: { type: 'boolean' },
            isNewUser: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export const phoneSendSchema = {
  body: {
    type: 'object',
    required: ['phoneNumber'],
    properties: {
      phoneNumber: {
        type: 'string',
        pattern: '^\\+[1-9]\\d{1,14}$',
        description: 'E.164 formatted phone number (e.g. +15551234567)',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending'] },
        message: { type: 'string' },
      },
    },
  },
};

export const phoneVerifySchema = {
  body: {
    type: 'object',
    required: ['phoneNumber', 'code'],
    properties: {
      phoneNumber: {
        type: 'string',
        pattern: '^\\+[1-9]\\d{1,14}$',
      },
      code: {
        type: 'string',
        minLength: 4,
        maxLength: 8,
        description: 'OTP code from Twilio Verify',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        verified: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  },
};
