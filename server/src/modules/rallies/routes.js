// ============================================================================
// Rallies Module — Route Handlers
// ============================================================================

import * as schema from './schema.js';
import * as service from './service.js';

export default async function rallyRoutes(fastify) {
  // POST / — Create rally
  fastify.post('/', {
    schema: schema.createRallySchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const result = await service.createRally(fastify.db, request.user.sub, request.body);
      reply.code(201);
      return result;
    },
  });

  // GET / — List rallies (filtered)
  fastify.get('/', {
    schema: schema.listRalliesSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.listRallies(fastify.db, request.user.sub, request.query);
    },
  });

  // GET /:id — Rally detail with RSVPs
  fastify.get('/:id', {
    schema: schema.getRallyDetailSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.getRallyDetail(fastify.db, request.user.sub, request.params.id);
    },
  });

  // PATCH /:id/status — Update rally status (confirm/cancel)
  fastify.patch('/:id/status', {
    schema: schema.updateRallyStatusSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.updateRallyStatus(
        fastify.db, request.user.sub, request.params.id, request.body.status,
      );
    },
  });

  // POST /:id/rsvp — RSVP to rally
  fastify.post('/:id/rsvp', {
    schema: schema.rsvpSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.rsvpToRally(
        fastify.db, request.user.sub, request.params.id, request.body.status,
      );
    },
  });
}
