process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';

// Тесты не обращаются к внешним сервисам, поэтому секреты и стоимость хеширования
// задаются тестовыми: подпись токенов проверяется, а bcrypt работает быстро.
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.BCRYPT_ROUNDS = '4';