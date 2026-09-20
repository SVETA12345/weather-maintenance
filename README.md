# weather-maintenance-api

REST API для планирования технического обслуживания оборудования с учётом погодных условий.
Погодные данные берутся из бесплатного сервиса [Open-Meteo](https://open-meteo.com) (без API-ключа): прогноз температуры, осадков и ветра позволяет определить дни, подходящие для работ на открытом воздухе.

## Описание сервиса

- Реестр оборудования: установки турбин, инверторов, датчиков и подстанций с геолокацией и серийными номерами.
- Заявки на обслуживание: создание, редактирование, жизненный цикл статусов.
- Погодное API: прогноз на 3 дня в точке установки оборудования с признаком пригодности для наружных работ (`suitableForOutdoorWork`).
- Отдельно выделены бизнес-логика, HTTP-слой и in-memory хранилища — хранилища легко заменить на БД с сохранением интерфейса.
- Структурные JSON-логи (pino) с единым `requestId` через `AsyncLocalStorage`.

> ⚠️ Данные хранятся в памяти и сбрасываются при перезапуске сервера.

## Требования к окружению

- Node.js >= 20.0.0
- Доступ к `api.open-meteo.com` и `geocoding-api.open-meteo.com` (для погодных эндпоинтов)

## Установка и запуск

```bash
npm install
cp .env.example .env   # при необходимости
npm run dev            # режим разработки (auto-restart, pretty-логи)
npm start              # продакшен-запуск (JSON-логи)
```

Сервер по умолчанию поднимается на `http://localhost:3000`. Проверка: `GET /api/health`.

## Переменные окружения

| Переменная              | По умолчанию                          | Описание                                          |
| ----------------------- | ------------------------------------- | ------------------------------------------------- |
| `NODE_ENV`              | `development`                         | Окружение (`production` выключает pino-pretty)    |
| `PORT`                  | `3000`                                | Порт HTTP-сервера                                 |
| `LOG_LEVEL`             | `info`                                | Уровень логирования pino                          |
| `CORS_ORIGINS`          | (пусто)                               | Разрешённые источники CORS (через запятую)        |
| `RATE_LIMIT_WINDOW_MS`  | `900000` (15 мин)                     | Окно ограничения частоты запросов                 |
| `RATE_LIMIT_MAX`        | `100`                                 | Максимум запросов за окно                         |
| `WEATHER_API_URL`       | `https://api.open-meteo.com/v1/forecast` | Базовый URL прогноза Open-Meteo                |
| `GEOCODING_API_URL`     | `https://geocoding-api.open-meteo.com/v1/search` | URL геокодинга Open-Meteo   |
| `REQUEST_TIMEOUT_MS`    | `5000`                                | Таймаут запроса к погодному API (мс)              |
| `WIND_THRESHOLD_MS`     | `8`                                   | Порог ветра (м/с) для пригодности наружных работ  |
| `WEATHER_MAX_CONCURRENT`| `4`                                   | Максимум одновременных запросов к Open-Meteo      |
| `REPORTS_DIR`           | `./reports`                           | Зарезервировано (пока не используется кодом)      |

## Эндпоинты

Все маршруты доступны после префикса `/api`.

### Health

| Метод | Путь        | Описание             | Коды ответа |
| ----- | ----------- | -------------------- | ----------- |
| GET   | `/health`   | Статус сервиса       | 200         |

### Оборудование

| Метод  | Путь                          | Описание                              | Коды ответа          |
| ------ | ----------------------------- | ------------------------------------- | -------------------- |
| GET    | `/equipment`                  | Список с пагинацией и фильтрами       | 200                  |
| POST   | `/equipment`                  | Создать оборудование                  | 201, 409, 422        |
| GET    | `/equipment/:id`              | Получить оборудование                 | 200, 404             |
| PATCH  | `/equipment/:id`              | Обновить оборудование                 | 200, 404             |
| DELETE | `/equipment/:id`              | Удалить (запрещено с открытыми заявками) | 204, 404, 409     |
| GET    | `/equipment/:id/requests`     | Заявки оборудования                   | 200, 404             |
| GET    | `/equipment/:id/weather`      | Прогноз погоды в точке оборудования   | 200, 404, 502        |

Параметры `GET /equipment`: `page` (1), `limit` (20, до 100), `sortBy`, `order` (`asc|desc`),
`status` (`operational|maintenance|fault|decommissioned`), `type` (`turbine|inverter|sensor|substation`).

### Заявки на обслуживание

| Метод  | Путь                         | Описание                    | Коды ответа              |
| ------ | ---------------------------- | --------------------------- | ------------------------ |
| GET    | `/requests`                  | Список с фильтрами          | 200                      |
| POST   | `/requests`                  | Создать заявку              | 201, 404, 422            |
| GET    | `/requests/:id`              | Получить заявку             | 200, 404                 |
| PATCH  | `/requests/:id`              | Обновить заявку             | 200, 404                 |
| PATCH  | `/requests/:id/status`       | Сменить статус              | 200, 404, 409            |
| DELETE | `/requests/:id`              | Удалить заявку              | 204, 404                 |

Параметры `GET /requests`: `page`, `limit`, `sortBy`, `order`,
`status` (`new|in_progress|done|rejected`), `priority` (`low|medium|high|critical`),
`equipmentId` (uuid), `from`, `to` (RFC 3339).

## Модель данных

### Оборудование

```jsonc
{
  "id": "4f9a...uuid",              // создаётся сервером
  "name": "Сетевой инвертор NS-12", // 3–100 символов
  "type": "inverter",               // turbine | inverter | sensor | substation
  "serialNumber": "SN-INV-001",     // уникален
  "location": { "lat": 51.5, "lon": -0.12 },
  "status": "operational",          // operational | maintenance | fault | decommissioned
  "installedAt": "2025-03-01T00:00:00.000Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Заявка

```jsonc
{
  "id": "c1a7...uuid",              // создаётся сервером
  "equipmentId": "4f9a...uuid",     // uuid существующего оборудования
  "title": "Плановое ТО инвертора", // 5–120 символов
  "description": "...",             // до 2000 символов, опционально
  "priority": "high",               // low | medium | high | critical
  "plannedAt": "2026-10-05T09:00:00.000Z",
  "status": "new",
  "createdAt": "...",
  "updatedAt": "..."
}
```

## Схема переходов статусов заявки

| Текущий     | Допустимые след. состояния   |
| ----------- | ---------------------------- |
| `new`       | `in_progress`, `rejected`    |
| `in_progress`| `done`, `rejected`          |
| `done`      | — (терминальное)             |
| `rejected`  | — (терминальное)             |

Любой другой переход возвращает `409 INVALID_STATUS_TRANSITION`.

## Формат ответа об ошибке

Все ошибки возвращаются в едином формате:

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",   // машинный код (см. таблицу)
    "message": "Некорректные данные запроса",
    "details": [                  // только для 422: список проблемных полей
      { "field": "name", "message": "...", }
    ],
    "requestId": "uuid"           // совпадает с заголовком X-Request-Id
  }
}
```

| Код                         | HTTP | Когда                                            |
| --------------------------- | ---- | ------------------------------------------------ |
| `VALIDATION_ERROR`          | 422  | Тело/query не прошли Zod-схему                   |
| `NOT_FOUND`                 | 404  | Ресурс по id не найден                           |
| `SERIAL_CONFLICT`           | 409  | Серийный номер уже занят                          |
| `HAS_OPEN_REQUESTS`         | 409  | Удаление оборудования с открытыми заявками       |
| `INVALID_STATUS_TRANSITION` | 409  | Недопустимый переход статуса заявки              |
| `RATE_LIMIT_EXCEEDED`       | 429  | Превышен лимит запросов                           |
| `WEATHER_API_UNAVAILABLE`   | 502  | Погодный API недоступен                           |
| `INTERNAL_ERROR`            | 500  | Непредвиденная ошибка                             |

## Примеры запросов и ответов

### Создание оборудования — успех (201)

```bash
curl -X POST http://localhost:3000/api/equipment \
  -H "Content-Type: application/json" \
  -d '{"name":"Сетевой инвертор NS-12","type":"inverter","serialNumber":"SN-INV-001","location":{"lat":51.5,"lon":-0.12},"installedAt":"2025-03-01T00:00:00.000Z"}'
```

```json
{
  "data": {
    "id": "4f9a...", "name": "Сетевой инвертор NS-12", "type": "inverter",
    "serialNumber": "SN-INV-001", "location": { "lat": 51.5, "lon": -0.12 },
    "status": "operational", "installedAt": "2025-03-01T00:00:00.000Z",
    "createdAt": "...", "updatedAt": "..."
  }
}
```

Ответ содержит заголовок `Location: /api/equipment/4f9a...`.

### Список оборудования — успех (200)

```bash
curl "http://localhost:3000/api/equipment?page=1&limit=20"
```

```json
{
  "data": [ { "id": "4f9a...", "name": "Сетевой инвертор NS-12", "type": "inverter", "serialNumber": "SN-INV-001" } ],
  "meta": { "total": 1, "page": 1, "limit": 20 }
}
```

### Ошибка валидации (422)

```bash
curl -X POST http://localhost:3000/api/equipment \
  -H "Content-Type: application/json" \
  -d '{"name":"x","type":"inverter"}'
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Некорректные данные запроса",
    "details": [
      { "field": "name", "message": "String must contain at least 3 character(s)" },
      { "field": "serialNumber", "message": "Required" },
      { "field": "location", "message": "Required" }
    ],
    "requestId": "ac76f6aa-..."
  }
}
```

### Дубль серийного номера (409)

```bash
curl -X POST http://localhost:3000/api/equipment \
  -H "Content-Type: application/json" \
  -d '{"name":"Дубль","type":"inverter","serialNumber":"SN-INV-001","location":{"lat":10,"lon":20}}'
```

```json
{ "error": { "code": "SERIAL_CONFLICT", "message": "Серийный номер уже занят", "requestId": "..." } }
```

### Несуществующий ресурс (404)

```bash
curl http://localhost:3000/api/equipment/00000000-0000-4000-8000-000000000000
```

```json
{ "error": { "code": "NOT_FOUND", "message": "Оборудование не найден", "requestId": "..." } }
```

### Создание заявки (201)

```bash
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"equipmentId":"4f9a...","title":"Плановое ТО инвертора","priority":"high","plannedAt":"2026-10-05T09:00:00.000Z"}'
```

### Смена статуса — недопустимый переход (409)

```bash
curl -X PATCH http://localhost:3000/api/requests/<id>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"new"}'
```

```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Недопустимый переход статуса: done → new",
    "requestId": "..."
  }
}
```

### Превышение лимита частоты (429)

```json
{
  "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Превышен лимит запросов", "requestId": "..." }
}
```

## Безопасность

- **Helmet** — базовые HTTP-заголовки безопасности.
- **CORS** — только источники из `CORS_ORIGINS`. Запросы с неперечисленным `Origin` отклоняются (500 при origin-ошибке).
- **Rate limiting** (`express-rate-limit`) — на все `/api`, настраивается `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`; ответ 429 в формате ошибки.
- **Валидация входа** — все тела и query проходят Zod-схемы (`src/validators/`), неизвестные поля отбрасываются.
- **Лимит тела** — `express.json({ limit: '100kb' })`.
- **Request id** — значение заголовка `X-Request-Id` принимается от внешних сервисов, иначе генерируется, возвращается в ответе и прокидывается во все логи (pino + `AsyncLocalStorage`).
- **Логирование** — структурные JSON-логи в stdout (в dev — `pino-pretty`), поля `authorization`, `cookie`, `password`, `token` автоматически редактируются (`redact`). В контейнере сбором/доставкой логов занимается инфраструктура.

## Логи

Сервис логирует через pino: старт/стоп, каждый HTTP-запрос (метод, url, статус, длительность, `reqId`) и бизнес-события (`equipment_created`, `request_status_changed` и т.д.) с привязкой к `reqId`. Уровни: `fatal`, `error` (5xx), `warn` (4xx), `info`, `debug` (выключен в production). Пример поиска всех записей одного запроса: `grep '"reqId":"<uuid>"' app.log`.

## Структура проекта

```
weather-maintenance-api/
├── docs/
│   └── postman/collection.json   # Postman-коллекция (эндпоинты + негативные сценарии, pm.test)
├── src/
│   ├── api/
│   │   ├── weatherClient.js      # HTTP-клиент Open-Meteo (таймаут, обработка статуса)
│   │   └── weatherService.js     # прогнозы и пригодность наружных работ
│   ├── config/index.js           # конфигурация из env
│   ├── controllers/              # обработчики запросов (equipment, requests)
│   ├── errors/                   # AppError, NotFoundError, ConflictError, ValidationError
│   ├── middlewares/              # validate, notFound, errorHandler
│   ├── repositories/             # in-memory хранилища (equipment, requests)
│   ├── routes/                   # index, health, equipment, requests
│   ├── services/                 # бизнес-логика (equipment, requests)
│   ├── utils/                    # id, pagination, logger (pino), context (AsyncLocalStorage)
│   ├── validators/               # Zod-схемы (equipmentSchemas, requestsSchemas, querySchemas)
│   ├── app.js                    # сборка Express-приложения
│   └── server.js                 # запуск сервера (graceful shutdown)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Postman

Импортируйте `docs/postman/collection.json`. Коллекция покрывает все эндпоинты, передаёт id сущностей между запросами через переменные и содержит негативные сценарии (422, 404, 409, 429) с автотестами `pm.test`.