// ============================================================================
// Statuses Module — Plugin Entry Point
// ============================================================================
import statusRoutes from './routes.js';

export default async function statusesModule(fastify) {
  fastify.register(statusRoutes, { prefix: '/api/v1/statuses' });
}
