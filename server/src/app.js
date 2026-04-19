// ============================================================================
// App — Fastify Instance Bootstrap
// ============================================================================
// Creates and configures the Fastify application instance. This is the
// composition root where all plugins and modules are registered.
//
// Registration order matters:
//   1. Config (env validation) — everything else depends on this
//   2. Global plugins (sensible, helmet, cors, rate-limit)
//   3. Infrastructure plugins (database, redis, auth/JWT)
//   4. Feature modules (auth routes, location routes)
//   5. Health check & error handling
// ============================================================================

import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { envOptions } from './config/index.js';
import sensiblePlugin from './plugins/sensible.js';
import databasePlugin from './plugins/database.js';
import redisPlugin from './plugins/redis.js';
import sqsPlugin from './plugins/sqs.js';
import authPlugin from './plugins/auth.js';
import authModule from './modules/auth/index.js';
import locationModule from './modules/location/index.js';
import friendsModule from './modules/friends/index.js';
import circlesModule from './modules/circles/index.js';
import statusesModule from './modules/statuses/index.js';
import nudgesModule from './modules/nudges/index.js';
import ralliesModule from './modules/rallies/index.js';
import questsModule from './modules/quests/index.js';
import { AppError } from './utils/errors.js';

/**
 * Builds and returns a fully configured Fastify instance.
 *
 * @param {object} [opts] — Optional Fastify constructor options
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildApp(opts = {}) {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
    ...opts,
  });

  // ─── 1. Config ─────────────────────────────────────────────────────────────
  await fastify.register(fastifyEnv, envOptions);

  // ─── 2. Global Plugins ─────────────────────────────────────────────────────
  await fastify.register(sensiblePlugin);

  await fastify.register(helmet, {
    // Allow CORS headers through helmet
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await fastify.register(cors, {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://nudge.app'] // Replace with actual domain
      : true, // Allow all in dev
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Rate limit by user ID if authenticated, else by IP
    keyGenerator: (request) => {
      return request.user?.sub || request.ip;
    },
  });

  // ─── 3. Infrastructure Plugins ─────────────────────────────────────────────
  await fastify.register(databasePlugin);
  await fastify.register(redisPlugin);
  await fastify.register(sqsPlugin);
  await fastify.register(authPlugin);

  // ─── 4. Feature Modules ────────────────────────────────────────────────────
  await fastify.register(authModule);
  await fastify.register(locationModule);
  await fastify.register(friendsModule);
  await fastify.register(circlesModule);
  await fastify.register(statusesModule);
  await fastify.register(nudgesModule);
  await fastify.register(ralliesModule);
  await fastify.register(questsModule);

  // ─── 5. Health Check ───────────────────────────────────────────────────────
  fastify.get('/healthz', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
          },
        },
      },
    },
    handler: async () => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    }),
  });

  // ─── 6. Global Error Handler ───────────────────────────────────────────────
  fastify.setErrorHandler((error, request, reply) => {
    // Handle custom AppErrors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Handle Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation,
        },
      });
    }

    // Handle JWT errors (from @fastify/jwt)
    if (error.statusCode === 401) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: error.message || 'Authentication required',
        },
      });
    }

    // Unhandled errors — log full stack, return sanitized message
    fastify.log.error(error, 'Unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : error.message,
      },
    });
  });

  // ─── 7. 404 Handler ───────────────────────────────────────────────────────
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  return fastify;
}
