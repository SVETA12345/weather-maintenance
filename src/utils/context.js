import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './logger.js';

/**
 * Хранилище контекста запроса (reqId, req.log), привязанного к цепочке
 * асинхронных вызовов. Всё, что выполняется внутри run() — включая вложенные
 * await — видит один и тот же контекст.
 */
export const contextStore = new AsyncLocalStorage();

export const contextMiddleware = (req, res, next) => {
    contextStore.run({ reqId: req.id, log: req.log ?? logger }, next);
};

/**
 * Возвращает логгер текущего запроса (с reqId) или глобальный логгер вне запроса.
 */
export const getLog = () => contextStore.getStore()?.log ?? logger;