// ============================================================================
// Plugin — JWT Authentication
// ============================================================================
// Registers @fastify/jwt and decorates the Fastify instance with an
// `authenticate` preHandler hook. Protected routes use this hook to
// extract and verify the Bearer token.
//
// Token payload shape: { sub: userId (UUID), iat, exp }
// ============================================================================

import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { Errors } from '../utils/errors.js';

async function authPlugin(fastify) {
  // Register the JWT plugin with the secret from validated config
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET,
    sign: {
      expiresIn: fastify.config.JWT_EXPIRES_IN,
    },
    verify: {
      // Clock tolerance in seconds to account for slight time drift
      clockTolerance: 5,
    },
  });

  /**
   * Decorate the instance with a reusable `authenticate` preHandler.
   * Usage: { preHandler: [fastify.authenticate] }
   */
  fastify.decorate('authenticate', async function authenticateHook(request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      fastify.log.warn({ err, url: request.url }, 'JWT verification failed');
      throw Errors.unauthorized('Invalid or expired token');
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
});
