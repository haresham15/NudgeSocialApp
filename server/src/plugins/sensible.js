// ============================================================================
// Plugin — @fastify/sensible
// ============================================================================
// Adds httpErrors, to(), and assert() helpers to the Fastify instance.
// Wrapped with fastify-plugin to share across all encapsulated contexts.
// ============================================================================

import fp from 'fastify-plugin';
import sensible from '@fastify/sensible';

async function sensiblePlugin(fastify) {
  await fastify.register(sensible);
}

export default fp(sensiblePlugin, {
  name: 'sensible',
});
