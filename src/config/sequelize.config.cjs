require('dotenv').config();

const base = {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
};

module.exports = {
    development: {
        ...base,
        database: process.env.DB_NAME,
    },
    // Тесты работают только по отдельной базе: сброс таблиц в ней запрещён,
    // поэтому суффикс test в имени — обязательное условие, а не соглашение.
    test: {
        ...base,
        database: process.env.TEST_DB_NAME || `${process.env.DB_NAME || 'maintenance'}_test`,
    },
};
