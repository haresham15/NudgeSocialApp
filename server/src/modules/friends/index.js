// ============================================================================
// Friends Module — Plugin Entry Point
// ============================================================================
import friendRoutes from './routes.js';

export default async function friendsModule(fastify) {
  fastify.register(friendRoutes, { prefix: '/api/v1/friends' });
}
