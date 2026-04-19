// ============================================================================
// Auth Module — Route Handlers
// ============================================================================
// POST /api/v1/auth/apple         — Sign in with Apple (upsert user, return JWT)
// POST /api/v1/auth/phone/send    — Send phone OTP (authenticated)
// POST /api/v1/auth/phone/verify  — Verify phone OTP (authenticated)
// ============================================================================

import {
  appleSignInSchema,
  phoneSendSchema,
  phoneVerifySchema,
} from './schema.js';
import {
  validateAppleToken,
  upsertUserByAppleId,
  sendPhoneVerification,
  checkPhoneVerification,
  markPhoneVerified,
} from './service.js';
import { Errors } from '../../utils/errors.js';

/**
 * Registers auth routes on the encapsulated Fastify instance.
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function authRoutes(fastify) {
  // ─── Apple Sign In ─────────────────────────────────────────────────────────
  fastify.post('/apple', {
    schema: appleSignInSchema,
    handler: async (request, reply) => {
      const { identityToken, displayName, email } = request.body;

      // 1. Cryptographically verify the Apple identity token
      const applePayload = await validateAppleToken(
        identityToken,
        fastify.config.APPLE_CLIENT_ID,
      );

      // 2. Upsert user in PostgreSQL using Apple's unique `sub` claim
      const { user, isNewUser } = await upsertUserByAppleId(fastify.db, {
        appleId: applePayload.sub,
        displayName,
        email: email || applePayload.email,
      });

      // 3. Sign JWTs
      const accessToken = fastify.jwt.sign(
        { sub: user.id },
        { expiresIn: fastify.config.JWT_EXPIRES_IN },
      );
      const refreshToken = fastify.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: fastify.config.JWT_REFRESH_EXPIRES_IN },
      );

      fastify.log.info(
        { userId: user.id, isNewUser },
        'Apple sign-in successful',
      );

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          displayName: user.display_name,
          username: user.username,
          avatarUrl: user.avatar_url,
          phoneVerified: user.phone_verified,
          isNewUser,
        },
      };
    },
  });

  // ─── Phone Verification: Send OTP ──────────────────────────────────────────
  fastify.post('/phone/send', {
    schema: phoneSendSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { phoneNumber } = request.body;
      const userId = request.user.sub;

      fastify.log.info({ userId, phoneNumber: phoneNumber.slice(-4) }, 'Sending phone OTP');

      const result = await sendPhoneVerification(fastify.config, phoneNumber);

      return {
        status: result.status,
        message: 'Verification code sent',
      };
    },
  });

  // ─── Phone Verification: Verify OTP ───────────────────────────────────────
  fastify.post('/phone/verify', {
    schema: phoneVerifySchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { phoneNumber, code } = request.body;
      const userId = request.user.sub;

      fastify.log.info({ userId }, 'Verifying phone OTP');

      const result = await checkPhoneVerification(fastify.config, phoneNumber, code);

      if (!result.valid) {
        throw Errors.badRequest('Invalid verification code');
      }

      // Mark phone as verified in the database
      await markPhoneVerified(fastify.db, userId, phoneNumber);

      fastify.log.info({ userId }, 'Phone verified successfully');

      return {
        verified: true,
        message: 'Phone number verified',
      };
    },
  });
}
