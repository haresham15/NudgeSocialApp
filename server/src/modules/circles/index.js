// ============================================================================
// Circles Module — Plugin Entry Point
// ============================================================================
import circleRoutes from './routes.js';

export default async function circlesModule(fastify) {
  fastify.register(circleRoutes, { prefix: '/api/v1/circles' });
}
