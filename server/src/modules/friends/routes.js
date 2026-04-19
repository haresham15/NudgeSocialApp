// ============================================================================
// Friends Module — Route Handlers
// ============================================================================

import * as schema from './schema.js';
import * as service from './service.js';

export default async function friendRoutes(fastify) {
  // POST / — Send friend request
  fastify.post('/request', {
    schema: schema.sendRequestSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const result = await service.sendFriendRequest(
        fastify.db, request.user.sub, request.body.addresseeId,
      );
      reply.code(201);
      return result;
    },
  });

  // POST /:id/accept — Accept friend request
  fastify.post('/:id/accept', {
    schema: schema.acceptRequestSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.acceptFriendRequest(
        fastify.db, request.user.sub, request.params.id,
      );
    },
  });

  // POST /:id/block — Block user
  fastify.post('/:id/block', {
    schema: schema.blockUserSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.blockUser(
        fastify.db, request.user.sub, request.params.id,
      );
    },
  });

  // DELETE /:id — Remove friend
  fastify.delete('/:id', {
    schema: schema.removeFriendSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.removeFriend(
        fastify.db, request.user.sub, request.params.id,
      );
    },
  });

  // GET / — List accepted friends
  fastify.get('/', {
    schema: schema.listFriendsSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.listFriends(fastify.db, request.user.sub);
    },
  });

  // GET /pending — List pending requests
  fastify.get('/pending', {
    schema: schema.listPendingSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.listPending(fastify.db, request.user.sub);
    },
  });
}
