// ============================================================================
// Nudges Module — Route Handlers
// ============================================================================

import * as schema from './schema.js';
import * as service from './service.js';

export default async function nudgeRoutes(fastify) {
  // GET / — List nudge history (paginated)
  fastify.get('/', {
    schema: schema.listNudgesSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.listNudges(fastify.db, request.user.sub, request.query);
    },
  });

  // GET /:id — Nudge detail with AI suggestion
  fastify.get('/:id', {
    schema: schema.getNudgeDetailSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.getNudgeDetail(fastify.db, request.user.sub, request.params.id);
    },
  });

  // POST /:id/vibe — Respond to a nudge (vibe check)
  fastify.post('/:id/vibe', {
    schema: schema.vibeCheckSchema,
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const result = await service.respondToNudge(
        fastify.db, request.user.sub, request.params.id, request.body.response,
      );
      reply.code(201);
      return result;
    },
  });
}
