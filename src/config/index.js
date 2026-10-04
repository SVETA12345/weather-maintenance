import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

// Секреты из окружения обязательны в production. В остальных окружениях подставляется
// заведомо небезопасное значение, чтобы сервис поднимался локально и в автотестах,
// но такой запуск печатает предупреждение в stderr.
const DEV_SECRET = 'dev-insecure-jwt-secret';
const MIN_SECRET_LENGTH = 32;

function resolveSecret(name) {
    const value = process.env[name];
    if (!value) {
        if (isProduction) {
            throw new Error(`Переменная окружения ${name} обязательна при NODE_ENV=production`);
        }
        process.emitWarning(`${name} не задан: используется небезопасное значение по умолчанию`);
        return DEV_SECRET;
    }
    if (isProduction && value.length < MIN_SECRET_LENGTH) {
        throw new Error(`${name} должен быть не короче ${MIN_SECRET_LENGTH} символов`);
    }
    return value;
}

// Доверие обратному прокси. 'loopback' — доверять только localhost, число —
// количество доверенных хопов (1 для nginx во внутренней сети), 'true' — любые
// адреса (только если приложение доступно напрямую из интернета). При выключенном
// доверии req.ip равен адресу прокси, поэтому ограничение частоты считает всех
// клиентов одним и логи теряют реальный адрес.
function resolveTrustProxy(value) {
    if (value === undefined || value === '' ) return false;
    if (value === 'false' || value === '0') return false;
    if (value === 'true') return true;
    if (value === 'loopback') return 'loopback';
    const hops = Number.parseInt(value, 10);
    if (Number.isInteger(hops) && hops > 0) return hops;
    throw new Error(`Некорректное значение TRUST_PROXY: "${value}" (ожидается true, false, loopback или число хопов)`);
}

export const config = {
    env,
    isProduction,
    port: Number.parseInt(process.env.PORT, 10) || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
    trustProxy: resolveTrustProxy(process.env.TRUST_PROXY),
    health: {
        // Проверка готовности не должна висеть дольше healthcheck контейнера.
        dbTimeoutMs: Number.parseInt(process.env.HEALTH_DB_TIMEOUT_MS, 10) || 2000,
    },
    metrics: {
        // Коллектор prom-client с process_* и nodejs_* метриками.
        collectDefault: process.env.METRICS_COLLECT_DEFAULT !== 'false',
        // Сколько площадок и единиц оборудования попадает в прикладные метрики:
        // ограничение защищает Prometheus от тысяч серий на большом парке.
        appliedTopN: Number.parseInt(process.env.METRICS_APPLIED_TOP_N, 10) || 20,
        // Несколько gauge-ов читают один результат запросов, поэтому он кэшируется.
        cacheMs: Number.parseInt(process.env.METRICS_CACHE_MS, 10) || 5000,
    },
    docs: {
        // Интерактивная документация OpenAPI на /api/docs.
        enabled: process.env.DOCS_ENABLED !== 'false',
        requireAuth: process.env.DOCS_REQUIRE_AUTH === 'true',
    },
    // Предел ожидания при остановке: после него процесс завершается принудительно.
    shutdownTimeoutMs: Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10_000,
    db: {
        // Размер пула Sequelize: виден в метриках maintenance_db_pool_*.
        poolMax: Number.parseInt(process.env.DB_POOL_MAX, 10) || 10,
    },
    corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    rateLimit: {
        windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
        max: Number.parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    },
    auth: {
        issuer: process.env.JWT_ISSUER || 'weather-maintenance-api',
        audience: process.env.JWT_AUDIENCE || 'weather-maintenance-api',
        accessSecret: resolveSecret('JWT_SECRET'),
        refreshSecret: process.env.JWT_REFRESH_SECRET || resolveSecret('JWT_SECRET'),
        accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
        accessTokenTtlMs: Number.parseInt(process.env.JWT_ACCESS_TTL_MS, 10) || 15 * 60 * 1000,
        refreshTokenTtlMs: Number.parseInt(process.env.JWT_REFRESH_TTL_MS, 10) || 7 * 24 * 60 * 60 * 1000,
        bcryptRounds: Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
        refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'refresh_token',
        // SameSite=Lax достаточно для разных портов одного домена (localhost:5173 → localhost:3000):
        // cookie не уходит в межсайтовые top-level переходы, но приходит на запросы API того же сайта.
        // Если фронтенд развёрнут на другом домене (например api.example.com и app.example.org),
        // нужен SameSite=None; тогда Secure обязателен, иначе браузер отбросит cookie.
        cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
        cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
        cookiePath: process.env.REFRESH_COOKIE_PATH || '/api/auth',
        loginRateLimit: {
            windowMs: Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
            max: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
        },
    },
    weather: {
        baseUrl: process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast',
        geocodingUrl: process.env.GEOCODING_API_URL || 'https://geocoding-api.open-meteo.com/v1/search',
        forecastUrl: process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast',
        timeoutMs: Number.parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 5000,
        maxConcurrent: Number.parseInt(process.env.WEATHER_MAX_CONCURRENT, 10) || 4,
        windThresholdMs: Number.parseFloat(process.env.WIND_THRESHOLD_MS) || 8,
    },
};

export default config;