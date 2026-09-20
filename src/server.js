import { createApp } from './app.js';
import config from './config/index.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'server started');
});

/**
 * Плавное завершение работы сервера.
 */
function shutdown(signal) {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
        logger.info('server stopped');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));