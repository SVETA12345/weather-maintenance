import { createApp } from './app.js';
import config from './config/index.js';
import { logger } from './utils/logger.js';
import { lifecycle } from './utils/lifecycle.js';
import { sequelize } from './models/sequelize.js';

const app = createApp();

const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'server started');
});

// Пока идёт остановка, /api/health/ready отвечает 503: балансировщик успеет
// увести трафик до того, как соединения с БД будут закрыты.
function shutdown(signal) {
    if (lifecycle.isShuttingDown()) return;
    lifecycle.beginShutdown();
    logger.info({ signal }, 'shutting down');

    // Страховка от зависших соединений: без неё процесс не завершится никогда.
    const forceExit = setTimeout(() => {
        logger.error({ signal }, 'graceful shutdown timeout, forced exit');
        process.exit(1);
    }, config.shutdownTimeoutMs);
    forceExit.unref();

    server.close(async (error) => {
        if (error) logger.error({ error: error.message }, 'error while closing http server');
        // keep-alime соединения не держат server.close: закрываем простаивающие сразу,
        // активные доработают свой запрос.
        server.closeIdleConnections?.();
        try {
            await sequelize.close();
            logger.info('database pool closed');
        } catch (closeError) {
            logger.error({ error: closeError.message }, 'error while closing database pool');
        }
        clearTimeout(forceExit);
        logger.info('server stopped');
        process.exit(0);
    });

    server.closeIdleConnections?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Необработанная ошибка оставляет процесс в неизвестном состоянии: логируем и
// завершаемся, чтобы оркестратор поднял новый экземпляр.
process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
});