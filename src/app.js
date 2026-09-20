import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { logger } from './utils/logger.js';
import { contextMiddleware } from './utils/context.js';
import { apiRouter } from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { config } from './config/index.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// Логирование HTTP-запросов: пара «запрос–ответ», единый request id.
const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    // Принимаем X-Request-Id от вышестоящего сервиса/прокси, иначе генерируем свой.
    const existing = req.id ?? req.headers['x-request-id'];
    const id = existing ? String(existing) : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => req.url?.endsWith('/health'),
  },
});

export function createApp() {
  const app = express();

  // 1. Безопасность (helmet)
  app.use(helmet());

  // 2. CORS с явным списком источников
  app.use((req, res, next) => {
    // Браузеры отправляют Origin даже на same-origin POST/PATCH (защита от CSRF),
    // поэтому адрес самого сервера всегда разрешён, на каком бы порту он ни был.
    const self = `${req.protocol}://${req.headers.host}`;
    cors({
      origin: (origin, cb) => {
        // null — Origin при открытии страницы как файла (file://);
        // отсутствие Origin — curl, Postman, супертest-запросы.
        if (!origin || origin === 'null' || origin === self || config.corsOrigins.includes(origin)) return cb(null, true);
        const err = new Error(`CORS: источник не разрешён (${origin})`);
        logger.warn({ event: 'cors_blocked', origin }, 'Заблокирован запрос из-за CORS');
        cb(err);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
    })(req, res, next);
  });

  // 3. Логирование запросов + request id
  app.use(httpLogger);

  // 4. Проброс контекста (reqId, req.log) вглубь слоёв
  app.use(contextMiddleware);

  // 5. Разбор JSON с ограничением размера
  app.use(express.json({ limit: '100kb' }));

  // 5.1 Статика (простая веб-страница обслуживания) — отдельный процесс/прокси не нужен
  app.use(express.static(publicDir));

  // 6. Ограничение частоты запросов на /api
  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        req.log.warn({ event: 'rate_limit_exceeded', ip: req.ip }, 'Превышен лимит запросов');
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

  // 7. Маршруты
  app.use('/api', apiRouter);

  // 8. 404 и централизованный обработчик ошибок
  app.use(notFound);
  app.use(errorHandler);

  return app;
}