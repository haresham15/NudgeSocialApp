// ============================================================================
// Server — Entry Point
// ============================================================================
// Starts the Fastify server and registers graceful shutdown handlers.
//
// Usage:
//   Development: node --watch src/server.js
//   Production:  node src/server.js
// ============================================================================

import { buildApp } from './app.js';

const start = async () => {
  let app;

  try {
    app = await buildApp();

    const port = app.config.PORT;
    const host = '0.0.0.0'; // Bind to all interfaces for Docker/ECS

    await app.listen({ port, host });

    app.log.info(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   🔔  Nudge API Server                               ║
║                                                      ║
║   Environment:  ${app.config.NODE_ENV.padEnd(35)}║
║   Listening:    http://${host}:${String(port).padEnd(25)}║
║   Health:       http://${host}:${port}/healthz${' '.repeat(14)}║
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }

  // ─── Graceful Shutdown ───────────────────────────────────────────────────
  const shutdown = async (signal) => {
    app.log.info(`Received ${signal} — starting graceful shutdown…`);

    try {
      await app.close();
      app.log.info('Server closed. Goodbye! 👋');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled rejections
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ reason }, 'Unhandled rejection — shutting down');
    shutdown('unhandledRejection');
  });
};

start();
