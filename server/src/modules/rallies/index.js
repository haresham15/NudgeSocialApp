// ============================================================================
// Rallies Module — Plugin Entry Point
// ============================================================================
import rallyRoutes from './routes.js';

export default async function ralliesModule(fastify) {
  fastify.register(rallyRoutes, { prefix: '/api/v1/rallies' });
}
