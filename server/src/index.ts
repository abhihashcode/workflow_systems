import { app } from './app';
import { config } from './config';
import { pool } from './db';
import { logger } from './utils/logger';

async function start() {
  // Verify database connection
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection established');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to database');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
  });

  async function shutdown(signal: string) {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await pool.end();
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
