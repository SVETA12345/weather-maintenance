import 'dotenv/config';

export const config = {
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    port: Number.parseInt(process.env.PORT, 10) || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
    corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    rateLimit: {
        windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
        max: Number.parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
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