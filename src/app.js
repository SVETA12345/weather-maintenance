import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

/**
 * Собирает и возвращает Express-приложение.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (req, res) => {
    res.json({
      service: 'weather-maintenance-api',
      docs: '/api/health',
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'weather-maintenance-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

export default createApp;