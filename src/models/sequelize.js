import { Sequelize } from 'sequelize';
import environments from '../config/sequelize.config.cjs';
import { config } from '../config/index.js';
import { initModels } from './index.js';

const settings = environments[config.env] ?? environments.development;

export const sequelize = new Sequelize(settings.database, settings.username, settings.password, {
    host: settings.host,
    port: Number(settings.port),
    dialect: settings.dialect,
    logging: false, // логи приложения идут через pino, запросы Sequelize не дублируем
    pool: {
        max: config.db.poolMax,
        // keepAlive снижает вероятность того, что прокси или БД закроют соединение
        // между запросами: на таком разрыве Sequelize переподключается сам, но
        // первый запрос после простоя платит за переподключение.
        idleTimeoutMillis: 30_000,
    },
});

export const models = initModels(sequelize);
