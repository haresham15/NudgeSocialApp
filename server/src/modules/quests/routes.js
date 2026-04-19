// ============================================================================
// Quests Module — Route Handlers
// ============================================================================

import * as schema from './schema.js';
import * as service from './service.js';

export default async function questRoutes(fastify) {
  // GET / — List active quests
  fastify.get('/', {
    schema: schema.listActiveQuestsSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.listActiveQuests(fastify.db, request.user.sub);
    },
  });

  // GET /completed — List completed quests
  fastify.get('/completed', {
    schema: schema.listCompletedQuestsSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.listCompletedQuests(fastify.db, request.user.sub, request.query);
    },
  });

  // POST /:id/progress — Increment quest progress
  fastify.post('/:id/progress', {
    schema: schema.incrementProgressSchema,
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      return service.incrementProgress(
        fastify.db, request.user.sub, request.params.id, request.body?.amount || 1,
      );
    },
  });
}
