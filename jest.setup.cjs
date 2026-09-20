// Выполняется до импорта приложения: отключаем pretty-логи и внешние вызовы.
process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL = 'silent';