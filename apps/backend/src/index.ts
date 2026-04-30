import 'dotenv/config';
import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';

async function main() {
  const server = app.listen(config.port, () => {
    logger.info(`🚀 Mogbank API server running on port ${config.port}`);
    logger.info(`   Environment: ${config.nodeEnv}`);
    logger.info(`   GraphQL: http://localhost:${config.port}/graphql`);
    logger.info(`   REST: http://localhost:${config.port}/api/v1`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});