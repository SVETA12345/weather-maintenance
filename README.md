# weather-maintenance-api

REST API для планирования технического обслуживания оборудования с учётом погодных условий.
Погодные данные берутся из бесплатного сервиса [Open-Meteo](https://open-meteo.com) (без API-ключа): прогноз температуры, осадков и ветра позволяет определить дни, подходящие для работ на открытом воздухе.

## Описание сервиса

- Реестр оборудования: установки турбин, инверторов, датчиков и подстанций с геолокацией и серийными номерами.
- Заявки на обслуживание: создание, редактирование, жизненный цикл статусов.
- Погодное API: прогноз на 3 дня в точке установки оборудования с признаком пригодности для наружных работ (`suitableForOutdoorWork`).
- Данные хранятся в PostgreSQL: репозитории скрывают SQL, бизнес-логика и HTTP-слой не зависят от БД.
- Структурные JSON-логи (pino) с единым `requestId` через `AsyncLocalStorage`.

> Данные не теряются при перезапуске сервера: они лежат в PostgreSQL, а схема и демонстрационные наполнения создаются миграциями и сидами (`sync({ force: true })` в проекте не используется).

## Требования к окружению

- Node.js >= 20.0.0
- PostgreSQL >= 14 (локальный запуск: создайте базу `maintenance` и пользователя из `.env`; в Docker базу создаёт сам сервис `db`)
- Доступ к `api.open-meteo.com` и `geocoding-api.open-meteo.com` (для погодных эндпоинтов)

## Установка и запуск

### Локально

```bash
npm install
cp .env.example .env   # при необходимости правьте DB_* под свой PostgreSQL
npx sequelize-cli db:migrate   # схема + перенос данных Кейса 2 из коллекции
npx sequelize-cli db:seed:all   # демонстрационные данные
npm run dev            # режим разработки (auto-restart, pretty-логи)
npm start              # продакшен-запуск (JSON-логи)
```

Сервер по умолчанию поднимается на `http://localhost:3000`. Проверка: `GET /api/health`.

### Развёртывание с нуля (Docker)

Порядок: поднять PostgreSQL → дождаться healthcheck → применить миграции →
наполнить сидами → запустить приложение. `docker compose up -d --build` поднимает
и БД, и API (API ждёт `service_healthy` у БД), но миграции и сиды выполняются
отдельно — в образе только production-зависимости, а `sequelize-cli` нужен из
`devDependencies`.

```bash
# 1. поднять контейнеры (БД — именованный том pgdata, API ждёт healthcheck БД)
docker compose up -d --build

# 2. убедиться, что PostgreSQL healthy
docker compose ps

# 3. применить миграции: создают схему и переносят данные Кейса 2
npx sequelize-cli db:migrate

# 4. наполнить демонстрационными данными
npx sequelize-cli db:seed:all

# 5. перезапустить API, чтобы он подхватил схему
docker compose restart api
```

Шаги 3 и 4 выполняются с хостов с тем же `.env`, что и у compose: `DB_HOST=localhost`
(для контейнера — `db`). Адреса: API на `:3000`, БД на `${DB_PORT}`, `GET /api/health`
возвращает `{"status":"ok"}`.

Откат и повторное применение: `npx sequelize-cli db:migrate:undo` откатывает
последнюю миграцию, `npx sequelize-cli db:migrate:undo:all` — все.

## Миграции и сиды

- Схему создают только миграции из `src/migrations` (`sequelize-cli`);
  `sync({ force: true })` в проекте нет.
- У каждой миграции есть рабочий `down`, полный цикл «применить все → откатить
  все → применить снова» проходит без ошибок.
- `src/migrations/20260927091048-migrate-from-json.cjs` переносит данные Кейса 2
  из `docs/postman/collection.json` (площадки, оборудование, заявки, история
  статусов) в транзакции; откат удаляет именно перенесённые записи.
- `src/migrations/20260927170000-equipment-text-search.cjs` включает `pg_trgm` и
  создаёт GIN-индексы `gin_trgm_ops` по `equipment.name` и `equipment.serial_number`
  для поиска `GET /equipment?search=`. Откат удаляет индексы и снимает расширение,
  если после отката других индексов на `gin_trgm_ops` в схеме не осталось.
- Сиды `src/seeders` дают наполнение, достаточное для демонстрации всех связей и
  обоих отчётов: 2 площадки, 6 единиц оборудования (с паспортами), 5 специалистов,
  20 заявок, распределённых по всем четырём статусам, плюс назначения бригад и
  история переходов статусов. После миграций и сидов в базе получается 3 площадки,
  7 единиц оборудования и 21 заявка — с учётом данных, перенесённых из коллекции.
- `src/seeders/20260927091048-migrate-from-json.cjs` — пустая заглушка из шаблона
  `sequelize-cli` с тем же именем, что и миграция; перенос данных выполняет
  миграция, сид ничего не добавляет.

## Веб-страница управления заявками

Простая страница `public/index.html` раздаётся тем же сервером и открывается в браузере: `http://localhost:3000/`. Она работает с API через `fetch` (тот же origin, CORS не нужен). Страницу также можно открыть как локальный файл (`file://`) — `Origin: null` разрешён CORS-конфигурацией:

- **Список заявок** — таблица с фильтрами по статусу, приоритету и оборудованию, постраничная навигация.
- **Форма создания** — выбор оборудования из `GET /api/equipment`, название, описание, приоритет, планируемая дата; создание через `POST /api/requests`.
- Смены статуса, назначения исполнителей, сводок и отчётов на странице нет — они доступны только через API.
- Ошибки API (422 с деталями, 404, 409, 429) выводятся в блоке сообщений.

## Переменные окружения

| Переменная                | По умолчанию                                     | Описание                                                    |
| ------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `NODE_ENV`                | `development`                                    | Окружение (`production` выключает pino-pretty)              |
| `PORT`                    | `3000`                                           | Порт HTTP-сервера                                           |
| `LOG_LEVEL`               | `info`                                           | Уровень логирования pino                                    |
| `CORS_ORIGINS`            | (пусто)                                          | Разрешённые источники CORS (через запятую)                  |
| `RATE_LIMIT_WINDOW_MS`    | `900000` (15 мин)                                | Окно ограничения частоты запросов                           |
| `RATE_LIMIT_MAX`          | `100`                                            | Максимум запросов за окно                                   |
| `WEATHER_API_URL`         | `https://api.open-meteo.com/v1/forecast`         | Базовый URL прогноза Open-Meteo                             |
| `GEOCODING_API_URL`       | `https://geocoding-api.open-meteo.com/v1/search` | URL геокодинга Open-Meteo                                   |
| `REQUEST_TIMEOUT_MS`      | `5000`                                           | Таймаут запроса к погодному API (мс)                        |
| `WIND_THRESHOLD_MS`       | `8`                                              | Порог ветра (м/с) для пригодности наружных работ            |
| `WEATHER_MAX_CONCURRENT`  | `4`                                              | Максимум одновременных запросов к Open-Meteo                |
| `REPORTS_DIR`             | `./reports`                                      | Зарезервировано (пока не используется кодом)                |
| `DB_HOST`                 | `localhost`                                      | Хост PostgreSQL                                             |
| `DB_PORT`                 | `5432`                                           | Порт PostgreSQL                                             |
| `DB_NAME`                 | `maintenance`                                    | Рабочая база                                                |
| `DB_USER` / `DB_PASSWORD` | —                                                | Учётные данные PostgreSQL                                   |
| `DB_POOL_MAX`             | `10`                                             | Зарезервировано (пул Sequelize пока не настраивается кодом) |
| `TEST_DB_NAME`            | `${DB_NAME}_test`                                | База автотестов (имя обязано содержать `test`)              |

Параметры подключения (`host`, `port`, `database`, `user`, `password`) читаются
из окружения в `src/config/sequelize.config.cjs` и передаются в `new Sequelize(...)`
в `src/models/sequelize.js`. Профили `development` и `test` заданы явно; при
`NODE_ENV=production` (в Docker) используется профиль `development` с теми же
переменными `DB_*` — отдельной секции `production` в конфиге нет.
`TEST_DB_NAME` читается конфигом, но в `.env.example` отсутствует (нужен только
автотестам); `DB_POOL_MAX` есть в `.env.example`, но кодом пока не читается —
это известное расхождение с требованием «параметры пула из окружения».

Compose читает `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`, `PORT` из того же
`.env` и передаёт их сервису `db`, а сервису `api` — `NODE_ENV`, `DB_*`;
контейнер приложения видит БД по хосту `db`.

## Эндпоинты

Все маршруты доступны после префикса `/api`.

### Health

| Метод | Путь      | Описание       | Коды ответа |
| ----- | --------- | -------------- | ----------- |
| GET   | `/health` | Статус сервиса | 200         |

### Оборудование

| Метод  | Путь                      | Описание                                 | Коды ответа        |
| ------ | ------------------------- | ---------------------------------------- | ------------------ |
| GET    | `/equipment`              | Список с пагинацией и фильтрами          | 200, 400, 422      |
| POST   | `/equipment`              | Создать оборудование                     | 201, 409, 422      |
| GET    | `/equipment/:id`          | Получить оборудование                    | 200, 404           |
| PATCH  | `/equipment/:id`          | Обновить оборудование                    | 200, 404           |
| DELETE | `/equipment/:id`          | Удалить (запрещено с открытыми заявками) | 204, 404, 409      |
| GET    | `/equipment/:id/requests` | Заявки оборудования с пагинацией         | 200, 400, 404, 422 |
| GET    | `/equipment/:id/weather`  | Прогноз погоды в точке оборудования      | 200, 404, 502      |

Параметры `GET /equipment`: `page` (1), `limit` (20, 1–100), `offset` (0–10000), `sortBy`,
`order` (`asc|desc`), `status` (`operational|maintenance|fault|decommissioned`),
`type` (`turbine|inverter|sensor|substation`), `search` (1–100 символов).
Параметры `GET /equipment/:id/requests`: `page`, `limit`, `offset`.
Допустимые `sortBy`: `name`, `type`, `status`, `serialNumber`, `installedAt`, `createdAt`, `updatedAt`.

`search` ищет подстроку без учёта регистра одновременно в `name` и `serialNumber`
(`ILIKE`), в том числе в середине слова. Символы `%`, `_` и `\` из пользовательского
ввода экранируются и трактуются как обычные символы, поэтому `search=%` не превращается
в шаблон «всё подряд». Пустая строка и длиннее 100 символов — `422 VALIDATION_ERROR`.
`search` суммируется с `status`, `type`, `sortBy` и пагинацией.

### Заявки на обслуживание

| Метод  | Путь                              | Описание                             | Коды ответа        |
| ------ | --------------------------------- | ------------------------------------ | ------------------ |
| GET    | `/requests`                       | Список с фильтрами                   | 200, 400, 422      |
| POST   | `/requests`                       | Создать заявку                       | 201, 404, 422      |
| GET    | `/requests/:id`                   | Получить заявку                      | 200, 404           |
| PATCH  | `/requests/:id`                   | Обновить заявку                      | 200, 404           |
| PATCH  | `/requests/:id/status`            | Сменить статус                       | 200, 404, 409      |
| DELETE | `/requests/:id`                   | Удалить заявку                       | 204, 404           |
| GET    | `/requests/:id/history`           | История смен статуса                 | 200, 400, 404, 422 |
| POST   | `/requests/:id/assignees`         | Назначить бригаду (заменяет прежнюю) | 201, 404, 422      |
| DELETE | `/requests/:id/assignees/:userId` | Снять исполнителя                    | 204, 404, 409      |

Параметры `GET /requests`: `page`, `limit` (1–100), `offset` (0–10000), `sortBy`, `order`,
`status` (`new|in_progress|done|rejected`), `priority` (`low|medium|high|critical`),
`equipmentId` (uuid), `from`, `to` (RFC 3339).
Допустимые `sortBy`: `createdAt`, `updatedAt`, `plannedAt`, `title`, `priority`, `status`.
Параметры `GET /requests/:id/history`: `page`, `limit`, `offset`.

Фильтрация, сортировка и пагинация выполняются средствами БД (`WHERE`, `ORDER BY`,
`LIMIT/OFFSET`): в память попадает только страница строк, а `meta.total` считается
отдельным `COUNT` с тем же набором условий.

### Пагинация

`page`, `limit` и `offset` принимают только целые числа в диапазонах
`page ≥ 1`, `1 ≤ limit ≤ 100`, `0 ≤ offset ≤ 10000`. Если `offset` не передан,
смещение считается как `(page − 1) × limit`; при явном `offset` он имеет приоритет
над `page`. Верхняя граница проверяется и для производного смещения, поэтому
`page=200&limit=100` тоже отклоняется.

Выход за диапазон — `400 INVALID_PAGINATION` с `details` по каждому полю
(в том числе `limit=abc` и `limit=1.5`). Остальные нарушения схемы запроса
(например, `status=nope` или `minRequests=-1`) остаются `422 VALIDATION_ERROR`.

### Площадки

| Метод | Путь                 | Описание                                | Коды ответа |
| ----- | -------------------- | --------------------------------------- | ----------- |
| GET   | `/sites/:id/summary` | Сводка по заявкам оборудования площадки | 200, 404    |

### Отчёты

| Метод | Путь                      | Описание                            | Коды ответа   |
| ----- | ------------------------- | ----------------------------------- | ------------- |
| GET   | `/reports/equipment-load` | Нагрузка на оборудование по заявкам | 200, 400, 422 |

Параметры `GET /reports/equipment-load`: `page` (1), `limit` (20, 1–100),
`offset` (0–10000), `sortBy`, `order` (`asc|desc`), `from`, `to`
(RFC 3339, период по `created_at`), `minRequests` (0) — минимальное число заявок
в группе.
Допустимые `sortBy`: `name`, `serialNumber`, `type`, `status`, `requestsTotal`,
`requestsOpen`, `requestsDone`, `requestsRejected`, `plannedLaborHours`,
`lastServiceAt`, `lastRequestAt`. Без `sortBy` — `requestsOpen DESC, name ASC`.

## Модель данных

### Оборудование

```jsonc
{
  "id": "4f9a...uuid", // создаётся сервером
  "name": "Сетевой инвертор NS-12", // 3–100 символов
  "type": "inverter", // turbine | inverter | sensor | substation
  "serialNumber": "SN-INV-001", // уникален
  "location": { "lat": 51.5, "lon": -0.12 }, // координаты площадки оборудования
  "status": "operational", // operational | maintenance | fault | decommissioned
  "installedAt": "2025-03-01T00:00:00.000Z",
  "createdAt": "...",
  "updatedAt": "...",
  "passport": {
    // null, если паспорт не заведён
    "id": "bbbb...uuid",
    "manufacturer": "Vestas",
    "model": "Model-100",
    "rated_power": "2000.00",
    "last_calibration_at": "2024-01-15T00:00:00.000Z",
    "created_at": "...", // имена полей паспорта пока в snake_case
    "updated_at": "...",
  },
}
```

### Заявка

```jsonc
{
  "id": "c1a7...uuid", // создаётся сервером
  "equipmentId": "4f9a...uuid", // uuid существующего оборудования
  "title": "Плановое ТО инвертора", // 5–120 символов
  "description": "...", // до 2000 символов, опционально
  "priority": "high", // low | medium | high | critical
  "plannedAt": "2026-10-05T09:00:00.000Z",
  "plannedLaborHours": 6.5, // плановые трудозатраты, до 10000, null если не заданы
  "status": "new",
  "assignees": [
    // назначенные исполнители
    {
      "technicianId": "cccc...uuid",
      "fullName": "Иванов Иван Иванович",
      "role": "lead", // lead | member
    },
  ],
  "createdAt": "...",
  "updatedAt": "...",
}
```

### Назначенные исполнители

Исполнители назначаются на заявку отдельно от её создания. В карточке заявки
возвращаются только `technicianId`, `fullName` и `role` — без специализации,
табельного номера и трудозатрат.

Тело `POST /requests/:id/assignees` — массив объектов, 1–20 записей:

```jsonc
[
  { "technicianId": "cccc...uuid", "role": "lead" },
  { "technicianId": "dddd...uuid", "role": "member" },
]
```

Ограничения и поведение:

- один специалист нельзя указать дважды в одном запросе (422);
- неизвестный `technicianId` — 404, назначения не меняются;
- назначение **заменяет** бригаду целиком: прежние назначения снимаются, новые
  добавляются. Прежний и новый состав могут пересекаться;
- в бригаде должен быть **ровно один** специалист с ролью `lead`; ноль или два
  `lead` — `422 VALIDATION_ERROR` с `details[0].field = "role"`, запрос
  отклоняется целиком и прежний состав сохраняется;
- `DELETE /requests/:id/assignees/:userId` — в `userId` передаётся `technicianId`
  специалиста, а не id пользователя системы.

Замена бригады выполняется одной транзакцией: снятие прежних назначений,
вставка новых и проверка правила `lead` либо применяются целиком, либо
откатываются полностью.

Правило бригады: заявку нельзя перевести в `in_progress`, пока не назначен ни один
исполнитель, и нельзя снять последнего исполнителя у заявки в статусе `in_progress`.
Обе ситуации — `409 ASSIGNEE_REQUIRED`. В `rejected` исполнители не требуются.

### Таблицы и ассоциации

![ER-диаграмма](er_diagramma.png)

Схема создаётся миграциями (`src/migrations`), ассоциации описаны явно в
`src/models/index.js`:

| Связь                                         | Тип             | Through-модель                      |
| --------------------------------------------- | --------------- | ----------------------------------- |
| `Site` → `Equipment`                          | `hasMany`       | —                                   |
| `Equipment` → `Site`                          | `belongsTo`     | —                                   |
| `Equipment` → `EquipmentPassport`             | `hasOne`        | —                                   |
| `EquipmentPassport` → `Equipment`             | `belongsTo`     | —                                   |
| `Equipment` → `MaintenanceRequest`            | `hasMany`       | —                                   |
| `MaintenanceRequest` → `Equipment`            | `belongsTo`     | —                                   |
| `MaintenanceRequest` → `RequestStatusHistory` | `hasMany`       | —                                   |
| `RequestStatusHistory` → `MaintenanceRequest` | `belongsTo`     | —                                   |
| `MaintenanceRequest` → `RequestAssignee`      | `hasMany`       | —                                   |
| `RequestAssignee` → `MaintenanceRequest`      | `belongsTo`     | —                                   |
| `Technician` → `RequestAssignee`              | `hasMany`       | —                                   |
| `RequestAssignee` → `Technician`              | `belongsTo`     | —                                   |
| `MaintenanceRequest` ↔ `Technician`           | `belongsToMany` | `RequestAssignee` (`role`, `hours`) |

Связанные данные списков и карточек загружаются через `include`, поэтому N+1 нет:
на один запрос списка приходится ровно два обращения к БД — страница строк и
отдельный `COUNT` для `meta.total`, независимо от объёма выборки. У включённых
связей набор полей ограничен через `attributes` (у исполнителей — только
`id`/`full_name`/`role`); ограничение `attributes` для корневых таблиц пока не
задано — там выбираются все колонки.

### Поиск по тексту

Поиск по оборудованию (`GET /equipment?search=`) выполняется в PostgreSQL, а не в
Node: `ILIKE` по `equipment.name` и `equipment.serial_number` с условием
`name ILIKE '%q%' OR serial_number ILIKE '%q%'`.

Поддержку обеспечивает миграция `src/migrations/20260927170000-equipment-text-search.cjs`:
она создаёт GIN-индексы с операторным классом
`gin_trgm_ops` — `equipment_name_trgm_idx` и `equipment_serial_number_trgm_idx`.

## Индексы и оптимизация запросов

В рамках бонусного задания добавлены индексы под реальные сценарии выборок. Эффект подтверждён через `EXPLAIN ANALYZE` до и после.

### Индекс `idx_maintenance_requests_status`

**Назначение:** ускорить фильтрацию заявок по статусу — самый частый запрос в списке (`GET /api/requests?status=in_progress`).

**Миграция:** `src/migrations/20260928-add-index-maintenance-requests-status.cjs`

```js
await queryInterface.addIndex("maintenance_requests", ["status"], {
  name: "idx_maintenance_requests_status",
});
```

SQL:

```sql
CREATE INDEX idx_maintenance_requests_status ON maintenance_requests (status);
```

### Условия замера

- Таблица: `maintenance_requests`, ~10 000 строк
- Распределение: ~5% заявок в статусе `in_progress`, остальные `new`
- Выполнено `ANALYZE maintenance_requests` перед замером
- PostgreSQL 16, Docker Compose

Данные для нагрузочного теста:

```sql
INSERT INTO maintenance_requests (id, equipment_id, title, priority, status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'aaaa1111-0000-0000-0000-000000000001',
  'Заявка ' || i,
  'medium'::enum_maintenance_requests_priority,
  (CASE WHEN i % 20 = 0 THEN 'in_progress' ELSE 'new' END)::enum_maintenance_requests_status,
  now() - (i || ' minutes')::interval,
  now()
FROM generate_series(1, 10000) AS s(i);

ANALYZE maintenance_requests;
```

### Замер до индекса

**Запрос:**

```sql
EXPLAIN ANALYZE
SELECT * FROM maintenance_requests WHERE status = 'in_progress';
```

**План:**

```
Seq Scan on maintenance_requests
  (cost=0.00..250.00 rows=500 width=222)
  (actual time=0.015..12.500 rows=504 loops=1)
  Filter: (status = 'in_progress'::enum_maintenance_requests_status)
  Rows Removed by Filter: 9500
Planning Time: 0.200 ms
Execution Time: 12.700 ms
```

`Seq Scan` — полное сканирование таблицы, 9500 строк отфильтровано.

### Замер после индекса

**Запрос:** тот же.

**План:**

````
Index Scan using idx_maintenance_requests_status on maintenance_requests
  (cost=0.29..136.30 rows=504 width=222)
  (actual time=0.064..0.533 rows=504 loops=1)
  Index Cond: (status = 'in_progress'::enum_maintenance_requests_status)
Planning Time: 1.406 ms
Execution Time: 0.786 ms


### Вывод

Индекс `idx_maintenance_requests_status` заменил полное сканирование таблицы (`Seq Scan`) на поиск по индексу (`Index Scan`). Время выполнения запроса сократилось примерно в **16 раз** на нагрузочной БД из 10 000 строк.




## Схема переходов статусов заявки

| Текущий     | Допустимые след. состояния   |
| ----------- | ---------------------------- |
| `new`       | `in_progress`, `rejected`    |
| `in_progress`| `done`, `rejected`          |
| `done`      | — (терминальное)             |
| `rejected`  | — (терминальное)             |

Любой другой переход возвращает `409 INVALID_STATUS_TRANSITION`. Переход в
`in_progress` дополнительно требует ненулевую бригаду, иначе `409 ASSIGNEE_REQUIRED`.

Каждая успешная смена статуса добавляет запись в `GET /requests/:id/history`
с полями `oldStatus`, `newStatus`, `author`, `comment`, `createdAt`. Повторная
установка того же статуса отклоняется как запрещённый переход, поэтому дублей
в истории не возникает. Автор — `"api"`: авторизации в сервисе нет.

## Удаление связанных записей

- `DELETE /equipment/:id` возвращает `409 HAS_OPEN_REQUESTS`, если у оборудования
  есть заявки в статусах `new` или `in_progress`. Закрытыми считаются и `done`,
  и `rejected`: с ними удаление проходит.
- При успешном удалении оборудования каскадно удаляются его паспорт и заявки,
  а вместе с ними — назначения и история статусов. Площадка и специалисты сохраняются.
- Удаление заявки каскадно удаляет её назначения и историю.

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
````

| Код                         | HTTP | Когда                                                                                        |
| --------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `INVALID_PAGINATION`        | 400  | `page`, `limit` или `offset` вне диапазона (в том числе не число и не целое)                 |
| `VALIDATION_ERROR`          | 422  | Тело/query не прошли Zod-схему или нарушено правило бригады (не ровно один `lead`)           |
| `NOT_FOUND`                 | 404  | Ресурс по id не найден                                                                       |
| `SERIAL_CONFLICT`           | 409  | Серийный номер уже занят                                                                     |
| `HAS_OPEN_REQUESTS`         | 409  | Удаление оборудования с открытыми заявками                                                   |
| `INVALID_STATUS_TRANSITION` | 409  | Недопустимый переход статуса заявки                                                          |
| `ASSIGNEE_REQUIRED`         | 409  | Переход в `in_progress` без исполнителей или снятие последнего исполнителя с заявки в работе |
| `RATE_LIMIT_EXCEEDED`       | 429  | Превышен лимит запросов                                                                      |
| `WEATHER_API_UNAVAILABLE`   | 502  | Погодный API недоступен                                                                      |
| `INTERNAL_ERROR`            | 500  | Непредвиденная ошибка                                                                        |

Конфликты сейчас перехватываются предварительными проверками в сервисах
(`SERIAL_CONFLICT` и др.), а не разбором ошибок БД. Ошибки самого PostgreSQL —
`UniqueConstraintError` и `ForeignKeyConstraintError` — в `errorHandler` не
разбираются и попадают в `500 INTERNAL_ERROR`: это известное расхождение с
требованием «ошибки БД преобразуются в 409 и 404».

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
    "id": "4f9a...",
    "name": "Сетевой инвертор NS-12",
    "type": "inverter",
    "serialNumber": "SN-INV-001",
    "location": { "lat": 51.5, "lon": -0.12 },
    "status": "operational",
    "installedAt": "2025-03-01T00:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "..."
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
  "data": [
    {
      "id": "4f9a...",
      "name": "Сетевой инвертор NS-12",
      "type": "inverter",
      "serialNumber": "SN-INV-001"
    }
  ],
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
      {
        "field": "name",
        "message": "String must contain at least 3 character(s)"
      },
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
{
  "error": {
    "code": "SERIAL_CONFLICT",
    "message": "Серийный номер уже занят",
    "requestId": "..."
  }
}
```

### Несуществующий ресурс (404)

```bash
curl http://localhost:3000/api/equipment/00000000-0000-4000-8000-000000000000
```

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Оборудование не найден",
    "requestId": "..."
  }
}
```

### limit/offset вне диапазона (400)

```bash
curl "http://localhost:3000/api/equipment?limit=101"
```

```json
{
  "error": {
    "code": "INVALID_PAGINATION",
    "message": "Параметры пагинации вне допустимого диапазона",
    "details": [
      { "field": "limit", "message": "limit не может превышать 100" }
    ],
    "requestId": "..."
  }
}
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
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Превышен лимит запросов",
    "requestId": "..."
  }
}
```

### Назначение исполнителей (201) и переход в работу (409)

```bash
curl -X POST http://localhost:3000/api/requests/<id>/assignees \
  -H "Content-Type: application/json" \
  -d '[{"technicianId":"cccc...uuid","role":"lead"}]'

curl -X PATCH http://localhost:3000/api/requests/<id>/status \
  -H "Content-Type: application/json" -d '{"status":"in_progress"}'
```

Без назначенного исполнителя второй запрос вернёт:

```json
409 {
  "error": {
    "code": "ASSIGNEE_REQUIRED",
    "message": "Нельзя перевести заявку в in_progress без назначенных исполнителей",
    "requestId": "..."
  }
}
```

### Нарушение правила бригады (422)

```bash
curl -X POST http://localhost:3000/api/requests/<id>/assignees \
  -H "Content-Type: application/json" \
  -d '[{"technicianId":"cccc...uuid","role":"member"}]'
```

```json
422 {
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Некорректные данные запроса",
    "details": [
      {
        "field": "role",
        "message": "в бригаде должен быть ровно один специалист с ролью lead, передано: 0"
      }
    ],
    "requestId": "..."
  }
}
```

Прежние назначения при этом сохраняются: снятие старого состава и вставка нового
выполняются в одной транзакции и откатываются вместе.

### История смен статусов (200)

```bash
curl http://localhost:3000/api/requests/<id>/history?page=1&limit=20
```

```jsonc
{
  "data": [
    {
      "id": "9d1e...uuid",
      "requestId": "c1a7...uuid",
      "oldStatus": "new",
      "newStatus": "in_progress",
      "author": "api",
      "comment": null,
      "createdAt": "2026-09-27T14:01:51.811Z",
    },
  ],
  "meta": { "total": 1, "page": 1, "limit": 20 },
}
```

### Сводка по площадке (200)

```bash
curl http://localhost:3000/api/sites/<siteId>/summary
```

```jsonc
{
  "data": {
    "siteId": "7b3c...uuid",
    "total": 4,
    "byStatus": { "new": 2, "in_progress": 0, "done": 1, "rejected": 1 },
    "byPriority": { "low": 1, "medium": 1, "high": 2, "critical": 0 },
    "averageClosureHours": 2.5, // среднее по закрытым заявкам, null если их нет
  },
}
```

`byStatus` и `byPriority` — количество заявок площадки в разрезе статусов и
приоритетов, `averageClosureHours` считается как среднее `updated_at - created_at`
в часах только по заявкам в статусе `done` и округляется до одного знака.
Все значения приходят одним `SELECT` с `FILTER` и `LEFT JOIN`, без загрузки
заявок в память.

### Нагрузка на оборудование (200)

```bash
curl "http://localhost:3000/api/reports/equipment-load?page=1&limit=20&minRequests=1"
```

```jsonc
{
  "data": [
    {
      "id": "4f9a...uuid",
      "name": "Сетевой инвертор NS-12",
      "serialNumber": "SN-INV-001",
      "type": "inverter",
      "status": "operational",
      "requestsTotal": 4,
      "requestsOpen": 2, // new + in_progress
      "requestsDone": 1,
      "requestsRejected": 1,
      "plannedLaborHours": 13.5, // сумма plannedLaborHours по заявкам периода
      "lastRequestAt": "2026-09-27T14:01:51.811Z", // null, если заявок не было
      "lastServiceAt": "2026-09-26T09:12:03.000Z", // max updated_at среди done
    },
  ],
  "meta": { "total": 6, "page": 1, "limit": 20 },
}
```

Отчёт строится прямым SQL: `GROUP BY` по оборудованию, `FILTER` по статусам,
`SUM(planned_labor_hours)`, `HAVING COUNT(r.id) >= :minRequests` для фильтрации
групп, `LIMIT/OFFSET` для пагинации. `meta.total` считается тем же набором
условий, что и выборка, поэтому `from`/`to` и `minRequests` влияют и на него.
Оборудование без заявок за период попадает в отчёт с нулевыми счётчиками.

## Безопасность

- **Helmet** — базовые HTTP-заголовки безопасности.
- **CORS** — только источники из `CORS_ORIGINS`, плюс всегда разрешён адрес самого сервера (браузеры шлют `Origin`, равный своему хосту, даже на same-origin `POST`/`PATCH`), запросы без `Origin` (curl, Postman) и `Origin: null` (открытие страницы как файла `file://`). Запросы с неперечисленным `Origin` отклоняются (500 при origin-ошибке, источник пишется в лог `cors_blocked`).
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
├── er_diagramma.png               # ER-диаграмма схемы БД (раздел «Модель данных»)
├── docker-compose.yml             # сервис api + PostgreSQL, том pgdata, healthcheck-и
├── Dockerfile                     # образ приложения (только production-зависимости)
├── .env                           # локальные параметры (создаётся из .env.example)
├── docs/
│   └── postman/collection.json   # Postman-коллекция (эндпоинты + негативные сценарии, pm.test)
├── public/
│   ├── index.html                # простая веб-страница: список заявок, фильтры, форма создания
│   └── app.js                    # логика страницы (fetch к API)
├── tests/
│   ├── globalSetup.js             # создаёт БД maintenance_test и накатывает миграции
│   ├── helpers/db.js              # resetTestDb, createTechnician, createPassport, счётчики строк
│   ├── health.test.js             # health, 404, X-Request-Id, CORS
│   ├── equipment.test.js          # CRUD оборудования, фильтры, 409/404/422, каскад, погода (fetch мокается)
│   ├── requests.test.js           # CRUD заявок, переходы статусов, неизменяемость equipmentId
│   ├── requestCrew.test.js        # назначения, снятие, правило бригады, история статусов
│   ├── analytics.test.js          # сводка площадки, отчёт нагрузки, пагинация и сортировка
│   └── ratelimit.test.js          # 429 при превышении лимита (RATE_LIMIT_MAX=3)
├── jest.setup.cjs                # env для тестов (NODE_ENV=test, БД maintenance_test, log silent)
├── scripts/drop-test-db.mjs      # удаление тестовой БД (npm run test:db:drop)
├── src/
│   ├── api/
│   │   ├── weatherClient.js      # HTTP-клиент Open-Meteo (таймаут, обработка статуса)
│   │   └── weatherService.js     # прогнозы и пригодность наружных работ
│   ├── config/index.js           # конфигурация из env
│   ├── config/sequelize.config.cjs # подключения к БД (development, test)
│   ├── controllers/              # обработчики запросов (equipment, requests, sites, reports)
│   ├── errors/                   # AppError, NotFoundError, ConflictError, ValidationError, BadRequestError
│   ├── middlewares/              # validate, notFound, errorHandler
│   ├── migrations/               # миграции схемы и перенос данных из Postman-коллекции
│   ├── seeders/                  # демонстрационные данные (площадки, оборудование, техники, заявки)
│   ├── models/                   # Sequelize-модели и ассоциации
│   ├── repositories/             # доступ к данным (equipment, requests, sites, reports)
│   ├── routes/                   # index, health, equipment, requests, sites, reports
│   ├── services/                 # бизнес-логика (equipment, requests, sites, reports)
│   ├── utils/                    # id, logger (pino), context (AsyncLocalStorage), paging (границы пагинации)
│   ├── validators/               # Zod-схемы (equipmentSchemas, requestsSchemas, querySchemas)
│   ├── app.js                    # сборка Express-приложения
│   └── server.js                 # запуск сервера (graceful shutdown)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Автотесты (Jest + Supertest)

Запуск: `npm test` (107 сценариев, `--runInBand`; требует Node с поддержкой
`--experimental-vm-modules` и запущенный PostgreSQL).

```bash
npm test
```

Тесты работают по отдельной базе `maintenance_test`: она создаётся и
мигрируется автоматически в `tests/globalSetup.js`, имя можно переопределить
через `TEST_DB_NAME`. Рабочая база `maintenance` тестами не затрагивается —
это дополнительно защищено проверкой «`test` в имени базы» в сбросах таблиц.
Полностью пересоздать тестовую базу: `npm run test:db:drop && npm test`.

Покрытие основных сценариев:

- **Health / маршрутизация** — `GET /api/health`, 404 неизвестного маршрута, проброс и генерация `X-Request-Id`, CORS (включая `Origin: null` и same-origin).
- **Оборудование** — CRUD (201 с defaults и `Location`), пагинация, фильтры `status`/`type` и сортировка по `sortBy` средствами БД, поиск `search` через `ILIKE` по имени и серийному номеру (регистронезависимо, с экранированием `%`/`_`/`\`), 409 `SERIAL_CONFLICT`, 409 `HAS_OPEN_REQUESTS` (открытая заявка) и его отсутствие при `rejected`, каскадное удаление паспорта, заявок, назначений и истории при удалении оборудования, сохранность площадки и специалистов, 404, 422 `VALIDATION_ERROR` с `details`, пагинация `GET /equipment/:id/requests`. Границы пагинации: 400 `INVALID_PAGINATION` на `limit=101`, `limit=abc`, `offset=10001`, приём граничных `limit=100&offset=10000` и эквивалентность `offset=1&limit=1` и `page=2&limit=1`, при этом `status=nope` остаётся 422. Прогноз `/weather` проверяется с замоканным `global.fetch` (без обращения к Open-Meteo).
- **Заявки** — CRUD, неизменяемость `equipmentId` при PATCH, приём и возврат `plannedLaborHours`, допустимые переходы статусов (`new → in_progress → done`, `new → rejected`), новый статус в ответе `PATCH /:id/status` совпадает с сохранённым, 409 `INVALID_STATUS_TRANSITION`, 404, 422; список: фильтры `status`/`priority`/`equipmentId`/`from`/`to`, сортировка по `sortBy`, пагинация с корректным `meta.total`, 400 `INVALID_PAGINATION` при выходе `limit`/`offset` за диапазон.
- **Назначения и правило бригады** — 201 с составом бригады и минимальными полями исполнителя, замена прежнего состава (проверяется и по БД), повторное включение того же специалиста, 422 `VALIDATION_ERROR` с `field: "role"` и откатом прежнего состава при нуле и при двух `lead`, 404 на неизвестного специалиста, 422 на пустой массив, объект вместо массива, неверную роль, невалидный uuid, дубль в одном запросе и больше 20 записей; снятие 204/404 и 409 `ASSIGNEE_REQUIRED` на последнем исполнителе заявки в работе; переход в `in_progress` без бригады — 409 без изменения статуса и истории.
- **История статусов** — пустая у новой заявки, хронологический порядок, `author: "api"`, отсутствие записей чужих заявок и дублей, 404, 422, каскадное удаление истории и назначений вместе с заявкой; 400 `INVALID_PAGINATION` на `limit=0`, `limit=101` и `offset=10001`.
- **Аналитика** — сводка площадки: нули и `null` без заявок, подсчёт по статусам и по приоритетам, среднее только по `done` с округлением до одного знака, изоляция площадок; отчёт нагрузки: оборудование без заявок через `LEFT JOIN`, счётчики по статусам, сумма `plannedLaborHours`, ISO-даты последней заявки и последнего обслуживания (`null` без закрытых заявок), фильтры периода `from`/`to` и `minRequests` с влиянием на `meta.total`, сортировка по `sortBy` и по умолчанию `requestsOpen DESC, name ASC`, пагинация, 422 на `minRequests=-1` и 400 `INVALID_PAGINATION` на `limit=0`, `limit=101`, `offset=10001`, `offset=-1`, а также на производном смещении `page=200&limit=100`; эквивалентность `offset=4&limit=2` и `page=3&limit=2`.
- **Rate limit** — отдельный файл переопределяет `RATE_LIMIT_MAX=3` до импорта приложения и проверяет 429 `RATE_LIMIT_EXCEEDED`. В остальных наборах лимит поднят в `jest.setup.cjs`, иначе объём запросов упирался бы в 429.

Между тестами таблицы очищаются через `resetTestDb()` (`tests/helpers/db.js`),
внешние погодные вызовы не выполняются, соединение с БД закрывается в `afterAll`.

## Postman

Импортируйте `docs/postman/collection.json`. Коллекция покрывает все эндпоинты, передаёт id сущностей между запросами через переменные и содержит негативные сценарии (422, 404, 409, 429) с автотестами `pm.test`.
