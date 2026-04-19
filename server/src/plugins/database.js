// ============================================================================
// Plugin — PostgreSQL Database Pool
// ============================================================================
// Creates a pg.Pool from DATABASE_URL and decorates the Fastify instance
// with `fastify.db` for use in route handlers and services.
//
// The pool is gracefully drained on server shutdown via the onClose hook.
// ============================================================================

import fp from 'fastify-plugin';
import pg from 'pg';

const { Pool } = pg;

async function databasePlugin(fastify) {
  const pool = new Pool({
    connectionString: fastify.config.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Verify connectivity at startup
  try {
    const client = await pool.connect();
    const { rows } = await client.query('SELECT NOW() AS now');
    fastify.log.info(`Database connected — server time: ${rows[0].now}`);
    client.release();
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      fastify.log.warn(
        'PostgreSQL not available — server will start but DB queries will fail. ' +
        'Start PostgreSQL and restart the server.',
      );
    } else {
      fastify.log.error(err, 'Failed to connect to PostgreSQL');
      throw err;
    }
  }

  // Decorate the Fastify instance so all routes can access `fastify.db`
  fastify.decorate('db', pool);

  // Graceful shutdown: drain the pool
  fastify.addHook('onClose', async () => {
    fastify.log.info('Draining PostgreSQL connection pool…');
    await pool.end();
  });
}

export default fp(databasePlugin, {
  name: 'database',
});
