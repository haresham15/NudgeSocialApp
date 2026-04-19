// ============================================================================
// Location Module — Plugin Entry Point
// ============================================================================

import locationRoutes from './routes.js';

export default async function locationModule(fastify) {
  fastify.register(locationRoutes, { prefix: '/api/v1/location' });
}
