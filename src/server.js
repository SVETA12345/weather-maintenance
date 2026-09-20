import { createApp } from './app.js';
import config from './config/index.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Server started on port ${config.port} (${config.env})`);
});

/**
 * Плавное завершение работы сервера.
 */
function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));