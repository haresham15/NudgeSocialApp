// ============================================================================
// Quests Module — Plugin Entry Point
// ============================================================================
import questRoutes from './routes.js';

export default async function questsModule(fastify) {
  fastify.register(questRoutes, { prefix: '/api/v1/quests' });
}
