// Флаг завершения работы: его читает проверка готовности, чтобы во время
// остановки сервис переставал получать новые запросы (503 на /api/health/ready).
let shuttingDown = false;

export const lifecycle = {
    isShuttingDown: () => shuttingDown,
    beginShutdown: () => {
        shuttingDown = true;
    },
    // Сброс флага нужен только автотестам: проверка готовности 503 после
    // beginShutdown() иначе влияла бы на следующие проверки в том же процессе.
    resetShutdown: () => {
        shuttingDown = false;
    },
};

export default lifecycle;