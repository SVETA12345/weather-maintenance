import { registry } from '../metrics/index.js';
import { readApplied } from '../metrics/applied.js';
import { sequelize } from '../models/sequelize.js';

export const metricsService = {
    async scrape() {
        return registry.metrics();
    },

    contentType() {
        return registry.contentType;
    },

    // Тот же набор агрегатов, что и в метриках, но в JSON: прикладной панели
    // Grafana и внешним потребителям не нужен парсер текстового формата.
    async applied() {
        const [applied] = await Promise.all([readApplied(), Promise.resolve()]);
        const pool = sequelize.pool;
        return {
            ...applied,
            pool: { inUse: pool ? pool.using : 0, max: pool ? pool.max : 0 },
        };
    },
};