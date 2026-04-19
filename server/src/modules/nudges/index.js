// ============================================================================
// Nudges Module — Plugin Entry Point
// ============================================================================
import nudgeRoutes from './routes.js';

export default async function nudgesModule(fastify) {
  fastify.register(nudgeRoutes, { prefix: '/api/v1/nudges' });
}
