import 'dotenv/config';

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number.parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',
  weather: {
    baseUrl: process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1',
    timeoutMs: Number.parseInt(process.env.WEATHER_TIMEOUT_MS, 10) || 5000,
    maxConcurrent: Number.parseInt(process.env.WEATHER_MAX_CONCURRENT, 10) || 4,
  },
};

export default config;