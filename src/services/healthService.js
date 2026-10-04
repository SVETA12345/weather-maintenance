import { sequelize } from '../models/sequelize.js';
import { config } from '../config/index.js';
import { lifecycle } from '../utils/lifecycle.js';
import { getLog } from '../utils/context.js';
import { markServiceUp } from '../metrics/index.js';

// Проверка БД не должна висеть бесконечно: недоступная база обнаруживается
// по истечении HEALTH_DB_TIMEOUT_MS, иначе healthcheck сам станет причиной падения.
async function checkDatabase() {
    const startedAt = process.hrtime.bigint();
    let timer;
    try {
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`timeout ${config.health.dbTimeoutMs}ms`)), config.health.dbTimeoutMs);
        });
        await Promise.race([sequelize.query('SELECT 1'), timeout]);
        const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        return { status: 'ok', latencyMs: Math.round(latencyMs * 100) / 100 };
    } catch (error) {
        getLog().warn({ event: 'readiness_db_failed', error: error.message }, 'База данных недоступна');
        return { status: 'error', error: error.message };
    } finally {
        clearTimeout(timer);
    }
}

export const healthService = {
    // Жизнеспособность: процесс жив и event-loop отвечает. БД здесь не проверяется,
    // иначе перезапуск при временной недоступности базы был бы лишним.
    live() {
        return {
            status: lifecycle.isShuttingDown() ? 'draining' : 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        };
    },

    async ready() {
        if (lifecycle.isShuttingDown()) {
            return { ready: false, status: 'shutting_down', checks: { database: { status: 'skipped' } } };
        }

        const database = await checkDatabase();
        markServiceUp(database.status === 'ok');
        const ready = database.status === 'ok';

        return {
            ready,
            status: ready ? 'ready' : 'not_ready',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            checks: { database },
        };
    },
};