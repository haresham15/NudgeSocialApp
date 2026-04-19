// ============================================================================
// Auth Module — Plugin Entry Point
// ============================================================================
// Wraps auth routes with the /api/v1/auth prefix. This module is registered
// as an encapsulated Fastify plugin — its routes and hooks are scoped.
// ============================================================================

import authRoutes from './routes.js';

export default async function authModule(fastify) {
  fastify.register(authRoutes, { prefix: '/api/v1/auth' });
}
