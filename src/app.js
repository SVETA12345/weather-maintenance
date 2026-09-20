import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { apiRouter } from './routes/index.js';
import { requestId } from './middlewares/requestId.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { config } from './config/index.js';

export function createApp() {
  const app = express();

  // 1. Безопасность (helmet)
  app.use(helmet());

  // 2. CORS с явным списком источников
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS: источник не разрешён'));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
    }),
  );

  // 3. Ограничение частоты запросов на /api
  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Превышен лимит запросов',
            requestId: req.id,
          },
        });
      },
    }),
  );

  // 4. requestId + логирование
  app.use(requestId);
  app.use(requestLogger);

  // 5. Разбор JSON с ограничением размера
  app.use(express.json({ limit: '100kb' }));

  // 6. Маршруты
  app.use('/api', apiRouter);

  // 7. 404 и централизованный обработчик ошибок
  app.use(notFound);
  app.use(errorHandler);

  return app;
}