import pino from 'pino';
import config from '../config/index.js';

export const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    // Чувствительные поля никогда не должны попадать в логи.
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    ...(!config.isProduction && {
        transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } },
    }),
});