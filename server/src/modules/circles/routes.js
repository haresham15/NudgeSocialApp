// ============================================================================
// Circles Module — Route Handlers
// ============================================================================

import * as schema from './schema.js';
import * as service from './service.js';

export default async function circleRoutes(fastify) {
  // POST / — Create circle
  fastify.post('/', {
    schema: schema.createCircleSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const result = await service.createCircle(fastify.db, request.user.sub, request.body);
      reply.code(201);
      return result;
    },
  });

  // GET / — List user's circles
  fastify.get('/', {
    schema: schema.listCirclesSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.listCircles(fastify.db, request.user.sub);
    },
  });

  // GET /:id — Circle detail with members
  fastify.get('/:id', {
    schema: schema.getCircleDetailSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.getCircleDetail(fastify.db, request.user.sub, request.params.id);
    },
  });

  // PUT /:id — Update circle
  fastify.put('/:id', {
    schema: schema.updateCircleSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.updateCircle(fastify.db, request.user.sub, request.params.id, request.body);
    },
  });

  // DELETE /:id — Delete circle
  fastify.delete('/:id', {
    schema: schema.deleteCircleSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.deleteCircle(fastify.db, request.user.sub, request.params.id);
    },
  });

  // POST /:id/members — Add member
  fastify.post('/:id/members', {
    schema: schema.addMemberSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const result = await service.addMember(
        fastify.db, request.user.sub, request.params.id, request.body.userId,
      );
      reply.code(201);
      return result;
    },
  });

  // DELETE /:id/members/:userId — Remove member
  fastify.delete('/:id/members/:userId', {
    schema: schema.removeMemberSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.removeMember(
        fastify.db, request.user.sub, request.params.id, request.params.userId,
      );
    },
  });
}
