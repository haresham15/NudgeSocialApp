// ============================================================================
// Statuses Module — Route Handlers
// ============================================================================

import * as schema from './schema.js';
import * as service from './service.js';

export default async function statusRoutes(fastify) {
  // POST / — Post a new status (2-hour cooldown)
  fastify.post('/', {
    schema: schema.postStatusSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const result = await service.postStatus(fastify.db, request.user.sub, request.body);
      reply.code(201);
      return result;
    },
  });

  // GET /me — Get my current active status
  fastify.get('/me', {
    schema: schema.getMyStatusSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.getMyStatus(fastify.db, request.user.sub);
    },
  });

  // GET /friends — Get friends' active statuses
  fastify.get('/friends', {
    schema: schema.friendStatusesSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.getFriendStatuses(fastify.db, request.user.sub);
    },
  });

  // DELETE /me — Clear current status early
  fastify.delete('/me', {
    schema: schema.clearStatusSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.clearStatus(fastify.db, request.user.sub);
    },
  });
}
