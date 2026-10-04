import { config } from '../config/index.js';

const bearerAuth = [{ bearerAuth: [] }];
const publicAccess = [];

const errorResponse = (description) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const json = (schema) => ({ content: { 'application/json': { schema } } });

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const paginated = (item) => ({
    type: 'object',
    properties: {
        data: { type: 'array', items: ref(item) },
        meta: { $ref: '#/components/schemas/PageMeta' },
    },
});

const envelope = (item) => ({ type: 'object', properties: { data: ref(item) } });

const paginationParams = [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
    { name: 'sortBy', in: 'query', schema: { type: 'string' } },
    { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
];

const uuidParam = (name, description) => ({ name, in: 'path', required: true, description, schema: { type: 'string', format: 'uuid' } });

export function buildOpenApiDocument() {
    return {
        openapi: '3.0.3',
        info: {
            title: 'API заявок на техническое обслуживание',
            version: '1.0.0',
            description: [
                'REST API для заявок на техническое обслуживание оборудования.',
                '',
                '## Аутентификация',
                '1. `POST /api/auth/register` создаёт пользователя (пароль, роль) и отвечает данными учётной записи без токенов.',
                '2. `POST /api/auth/login` возвращает access-токен в теле ответа и ставит refresh-cookie.',
                '3. Access-токен передаётся в заголовке `Authorization: Bearer <token>`, действует 15 минут.',
                '4. После истечения `POST /api/auth/refresh` обновляет пару токенов, ротируя refresh.',
                '5. `POST /api/auth/logout` отзывает refresh-токен.',
                '',
                '## Роли',
                '| Роль | Права |',
                '| --- | --- |',
                '| `viewer` | Чтение всех справочников, заявок, истории и отчётов |',
                '| `technician` | Права viewer, создание и редактирование заявок, смена статуса заявок, на которые назначен |',
                '| `admin` | Все операции: оборудование, назначение бригад, удаление заявок, любые статусы |',
                '',
                'Ошибки имеют единый формат: `{ "error": { "code", "message", "details", "requestId" } }`.',
                'Идентификатор запроса возвращается в заголовке `X-Request-Id`.',
            ].join('\n'),
        },
        servers: [{ url: '/', description: 'Текущий сервер' }],
        tags: [
            { name: 'auth', description: 'Аутентификация и роли' },
            { name: 'equipment', description: 'Оборудование' },
            { name: 'requests', description: 'Заявки и назначения' },
            { name: 'technicians', description: 'Справочник специалистов (только чтение)' },
            { name: 'sites', description: 'Площадки' },
            { name: 'reports', description: 'Отчёты' },
            { name: 'health', description: 'Проверки состояния и метрики' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string', example: 'NOT_FOUND' },
                                message: { type: 'string' },
                                details: { type: 'array', items: { type: 'object' } },
                                requestId: { type: 'string' },
                            },
                        },
                    },
                },
                PageMeta: {
                    type: 'object',
                    properties: {
                        total: { type: 'integer' },
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        role: { type: 'string', enum: ['viewer', 'technician', 'admin'] },
                        technicianId: { type: 'string', format: 'uuid', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                TokenPair: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string' },
                        tokenType: { type: 'string', example: 'Bearer' },
                        expiresIn: { type: 'integer', example: 900 },
                        user: ref('User'),
                    },
                },
                RegisterRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email' },
                        password: { type: 'string', format: 'password', minLength: 8, maxLength: 72 },
                        role: { type: 'string', enum: ['viewer', 'technician', 'admin'], default: 'viewer' },
                        technicianId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Связь учётной записи со специалистом: нужна роли technician, чтобы менять статус назначенных заявок',
                        },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email' },
                        password: { type: 'string', format: 'password' },
                    },
                },
                Equipment: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        type: { type: 'string', enum: ['turbine', 'inverter', 'sensor', 'substation'] },
                        serialNumber: { type: 'string' },
                        status: { type: 'string', enum: ['operational', 'maintenance', 'fault', 'decommissioned'] },
                        location: { type: 'string', description: 'Название площадки' },
                        installedAt: { type: 'string', format: 'date-time', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                EquipmentCreate: {
                    type: 'object',
                    required: ['name', 'type', 'serialNumber'],
                    properties: {
                        name: { type: 'string', minLength: 2, maxLength: 120 },
                        type: { type: 'string', enum: ['turbine', 'inverter', 'sensor', 'substation'] },
                        serialNumber: { type: 'string', minLength: 2, maxLength: 64 },
                        status: { type: 'string', enum: ['operational', 'maintenance', 'fault', 'decommissioned'] },
                        location: { type: 'string', description: 'id или название площадки' },
                        installedAt: { type: 'string', format: 'date-time' },
                    },
                },
                Request: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        equipmentId: { type: 'string', format: 'uuid' },
                        title: { type: 'string' },
                        description: { type: 'string', nullable: true },
                        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        status: { type: 'string', enum: ['new', 'in_progress', 'done', 'rejected'] },
                        plannedAt: { type: 'string', format: 'date-time', nullable: true },
                        plannedLaborHours: { type: 'number', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                        assignees: { type: 'array', items: ref('Assignee') },
                    },
                },
                RequestCreate: {
                    type: 'object',
                    required: ['equipmentId', 'title', 'priority'],
                    properties: {
                        equipmentId: { type: 'string', format: 'uuid' },
                        title: { type: 'string', minLength: 5, maxLength: 120 },
                        description: { type: 'string', maxLength: 2000 },
                        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        plannedAt: { type: 'string', format: 'date-time' },
                        plannedLaborHours: { type: 'number', minimum: 0, maximum: 10000 },
                    },
                },
                StatusChange: {
                    type: 'object',
                    required: ['status'],
                    properties: { status: { type: 'string', enum: ['new', 'in_progress', 'done', 'rejected'] } },
                },
                AssigneeInput: {
                    type: 'object',
                    required: ['technicianId', 'role'],
                    properties: {
                        technicianId: { type: 'string', format: 'uuid' },
                        role: { type: 'string', enum: ['lead', 'member'] },
                    },
                },
                Assignee: {
                    type: 'object',
                    properties: {
                        technicianId: { type: 'string', format: 'uuid' },
                        fullName: { type: 'string' },
                        specialization: { type: 'string' },
                        role: { type: 'string', enum: ['lead', 'member'] },
                    },
                },
                Technician: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        fullName: { type: 'string' },
                        specialization: { type: 'string' },
                        personnelNumber: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                StatusHistoryEntry: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        requestId: { type: 'string', format: 'uuid' },
                        oldStatus: { type: 'string', nullable: true },
                        newStatus: { type: 'string' },
                        author: { type: 'string' },
                        comment: { type: 'string', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
        security: bearerAuth,
        paths: {
            '/api/health': {
                get: {
                    tags: ['health'],
                    summary: 'Сводное состояние сервиса',
                    security: publicAccess,
                    responses: {
                        200: { description: 'Сервис готов', ...json({ type: 'object' }) },
                        503: { description: 'База данных недоступна', ...json({ type: 'object' }) },
                    },
                },
            },
            '/api/health/live': {
                get: {
                    tags: ['health'],
                    summary: 'Жизнеспособность процесса',
                    security: publicAccess,
                    responses: { 200: { description: 'Процесс отвечает', ...json({ type: 'object' }) } },
                },
            },
            '/api/health/ready': {
                get: {
                    tags: ['health'],
                    summary: 'Готовность к обслуживанию, включая доступность БД',
                    security: publicAccess,
                    responses: {
                        200: { description: 'Сервис готов принимать трафик', ...json({ type: 'object' }) },
                        503: { description: 'БД недоступна или сервис завершает работу', ...json({ type: 'object' }) },
                    },
                },
            },
            '/api/health/metrics': {
                get: {
                    tags: ['health'],
                    summary: 'Прикладные агрегаты из PostgreSQL в JSON',
                    security: publicAccess,
                    responses: { 200: { description: 'Агрегаты', ...json({ type: 'object' }) } },
                },
            },
            '/metrics': {
                get: {
                    tags: ['health'],
                    summary: 'Метрики приложения в формате Prometheus',
                    description: 'Скрейп для Prometheus: http_requests_total, http_errors_total, http_request_duration_seconds, process_* и прикладные maintenance_*.',
                    security: publicAccess,
                    responses: { 200: { description: 'Текст в формате exposition', ...json({ type: 'string' }) } },
                },
            },
            '/api/docs': {
                get: {
                    tags: ['health'],
                    summary: 'Интерактивная документация (Swagger UI)',
                    security: publicAccess,
                    responses: { 200: { description: 'HTML-страница Swagger UI' } },
                },
            },
            '/api/docs/openapi.json': {
                get: {
                    tags: ['health'],
                    summary: 'Спецификация OpenAPI 3.0.3',
                    security: publicAccess,
                    responses: { 200: { description: 'Спецификация', ...json({ type: 'object' }) } },
                },
            },
            '/api/auth/register': {
                post: {
                    tags: ['auth'],
                    summary: 'Регистрация пользователя',
                    description:
                        'Роль по умолчанию — `viewer`. `technicianId` необязателен, но без него учётная запись с ролью `technician` не сможет менять статус заявок: будет 403 `NOT_ASSIGNED`.',
                    security: publicAccess,
                    requestBody: { required: true, ...json(ref('RegisterRequest')) },
                    responses: {
                        201: { description: 'Пользователь создан', ...json(envelope('User')) },
                        409: errorResponse('Email уже занят (EMAIL_TAKEN)'),
                        422: errorResponse('Некорректные данные (VALIDATION_ERROR)'),
                    },
                },
            },
            '/api/auth/login': {
                post: {
                    tags: ['auth'],
                    summary: 'Вход: access-токен и refresh-cookie',
                    security: publicAccess,
                    requestBody: { required: true, ...json(ref('LoginRequest')) },
                    responses: {
                        200: { description: 'Пара токенов', ...json(envelope('TokenPair')) },
                        401: errorResponse('Неверный email или пароль (INVALID_CREDENTIALS)'),
                        429: errorResponse('Превышен лимит неудачных попыток входа'),
                    },
                },
            },
            '/api/auth/refresh': {
                post: {
                    tags: ['auth'],
                    summary: 'Обновление пары токенов по refresh-cookie',
                    description: 'Refresh-токен ротируется: старый становится недействительным.',
                    security: publicAccess,
                    responses: {
                        200: { description: 'Новая пара токенов', ...json(envelope('TokenPair')) },
                        401: errorResponse('Refresh-cookie отсутствует или отозван'),
                    },
                },
            },
            '/api/auth/logout': {
                post: {
                    tags: ['auth'],
                    summary: 'Выход: отзыв refresh-токена',
                    security: publicAccess,
                    responses: { 204: { description: 'Refresh-токен отозван' } },
                },
            },
            '/api/auth/me': {
                get: {
                    tags: ['auth'],
                    summary: 'Текущий пользователь',
                    responses: {
                        200: { description: 'Профиль', ...json(envelope('User')) },
                        401: errorResponse('Токен отсутствует или недействителен'),
                    },
                },
            },
            '/api/equipment': {
                get: {
                    tags: ['equipment'],
                    summary: 'Список оборудования',
                    parameters: [
                        ...paginationParams,
                        { name: 'status', in: 'query', schema: { type: 'string', enum: ['operational', 'maintenance', 'fault', 'decommissioned'] } },
                        { name: 'type', in: 'query', schema: { type: 'string', enum: ['turbine', 'inverter', 'sensor', 'substation'] } },
                        { name: 'search', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: { 200: { description: 'Страница оборудования', ...json(paginated('Equipment')) } },
                },
                post: {
                    tags: ['equipment'],
                    summary: 'Создать оборудование (admin)',
                    requestBody: { required: true, ...json(ref('EquipmentCreate')) },
                    responses: {
                        201: { description: 'Создано', ...json(envelope('Equipment')) },
                        403: errorResponse('Недостаточно прав (ROLE_REQUIRED)'),
                        409: errorResponse('Серийный номер занят (SERIAL_CONFLICT)'),
                    },
                },
            },
            '/api/equipment/{id}': {
                get: {
                    tags: ['equipment'],
                    summary: 'Оборудование по id',
                    parameters: [uuidParam('id', 'id оборудования')],
                    responses: { 200: { description: 'Оборудование', ...json(envelope('Equipment')) }, 404: errorResponse('Не найдено') },
                },
                patch: {
                    tags: ['equipment'],
                    summary: 'Изменить оборудование (admin)',
                    parameters: [uuidParam('id', 'id оборудования')],
                    requestBody: { ...json(ref('EquipmentCreate')) },
                    responses: {
                        200: { description: 'Обновлено', ...json(envelope('Equipment')) },
                        403: errorResponse('Недостаточно прав (ROLE_REQUIRED)'),
                    },
                },
                delete: {
                    tags: ['equipment'],
                    summary: 'Удалить оборудование (admin)',
                    description: 'Удаление блокируется, если на оборудовании есть открытые заявки.',
                    parameters: [uuidParam('id', 'id оборудования')],
                    responses: {
                        204: { description: 'Удалено' },
                        409: errorResponse('Есть открытые заявки'),
                    },
                },
            },
            '/api/equipment/{id}/requests': {
                get: {
                    tags: ['equipment'],
                    summary: 'Заявки по оборудованию',
                    parameters: [uuidParam('id', 'id оборудования'), ...paginationParams],
                    responses: { 200: { description: 'Страница заявок', ...json(paginated('Request')) } },
                },
            },
            '/api/requests': {
                get: {
                    tags: ['requests'],
                    summary: 'Список заявок',
                    parameters: [
                        ...paginationParams,
                        { name: 'status', in: 'query', schema: { type: 'string', enum: ['new', 'in_progress', 'done', 'rejected'] } },
                        { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } },
                        { name: 'equipmentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                        { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                        { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    ],
                    responses: { 200: { description: 'Страница заявок', ...json(paginated('Request')) } },
                },
                post: {
                    tags: ['requests'],
                    summary: 'Создать заявку (technician, admin)',
                    requestBody: { required: true, ...json(ref('RequestCreate')) },
                    responses: {
                        201: { description: 'Создана', ...json(envelope('Request')) },
                        403: errorResponse('Недостаточно прав (ROLE_REQUIRED)'),
                        404: errorResponse('Оборудование не найдено'),
                    },
                },
            },
            '/api/requests/{id}': {
                get: {
                    tags: ['requests'],
                    summary: 'Заявка по id',
                    parameters: [uuidParam('id', 'id заявки')],
                    responses: { 200: { description: 'Заявка', ...json(envelope('Request')) }, 404: errorResponse('Не найдено') },
                },
                patch: {
                    tags: ['requests'],
                    summary: 'Изменить заявку (technician, admin)',
                    description: 'Статус здесь не принимается: он меняется через `PATCH /api/requests/{id}/status`.',
                    parameters: [uuidParam('id', 'id заявки')],
                    requestBody: { ...json(ref('RequestCreate')) },
                    responses: {
                        200: { description: 'Обновлено', ...json(envelope('Request')) },
                        422: errorResponse('Некорректные данные, в том числе передан status'),
                    },
                },
                delete: {
                    tags: ['requests'],
                    summary: 'Удалить заявку (admin)',
                    parameters: [uuidParam('id', 'id заявки')],
                    responses: { 204: { description: 'Удалена' }, 403: errorResponse('Недостаточно прав') },
                },
            },
            '/api/requests/{id}/status': {
                patch: {
                    tags: ['requests'],
                    summary: 'Смена статуса заявки',
                    description: 'Допустимые переходы: new → in_progress | rejected, in_progress → done | rejected. Переходы выполняет admin всегда, technician — только если назначен на заявку, иначе 403 NOT_ASSIGNED.',
                    parameters: [uuidParam('id', 'id заявки')],
                    requestBody: { required: true, ...json(ref('StatusChange')) },
                    responses: {
                        200: { description: 'Новый статус', ...json(envelope('Request')) },
                        403: errorResponse('Специалист не назначен (NOT_ASSIGNED)'),
                        409: errorResponse('Недопустимый переход или нет исполнителей (INVALID_STATUS_TRANSITION, ASSIGNEE_REQUIRED)'),
                    },
                },
            },
            '/api/requests/{id}/assignees': {
                post: {
                    tags: ['requests'],
                    summary: 'Назначить бригаду, заменив прежний состав (admin)',
                    description: 'Тело — массив, ровно одна запись с ролью `lead`.',
                    parameters: [uuidParam('id', 'id заявки')],
                    requestBody: { required: true, ...json({ type: 'array', minItems: 1, maxItems: 20, items: ref('AssigneeInput') }) },
                    responses: {
                        201: {
                            description: 'Новый состав',
                            ...json({ type: 'object', properties: { data: { type: 'object', properties: { requestId: { type: 'string' }, assignees: { type: 'array', items: ref('Assignee') } } } } }),
                        },
                        403: errorResponse('Недостаточно прав (ROLE_REQUIRED)'),
                        404: errorResponse('Заявка или специалист не найдены'),
                        422: errorResponse('Нарушено правило бригады (VALIDATION_ERROR)'),
                    },
                },
            },
            '/api/requests/{id}/assignees/{technicianId}': {
                delete: {
                    tags: ['requests'],
                    summary: 'Снять специалиста с заявки (admin)',
                    parameters: [uuidParam('id', 'id заявки'), uuidParam('technicianId', 'id специалиста')],
                    responses: {
                        204: { description: 'Снят' },
                        404: errorResponse('Назначение не найдено'),
                    },
                },
            },
            '/api/requests/{id}/history': {
                get: {
                    tags: ['requests'],
                    summary: 'История смены статусов заявки',
                    parameters: [uuidParam('id', 'id заявки'), ...paginationParams],
                    responses: { 200: { description: 'Страница истории', ...json(paginated('StatusHistoryEntry')) } },
                },
            },
            '/api/technicians': {
                get: {
                    tags: ['technicians'],
                    summary: 'Справочник специалистов',
                    parameters: [
                        ...paginationParams,
                        { name: 'specialization', in: 'query', schema: { type: 'string' } },
                        { name: 'search', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: { 200: { description: 'Страница специалистов', ...json(paginated('Technician')) } },
                },
            },
            '/api/technicians/{id}': {
                get: {
                    tags: ['technicians'],
                    summary: 'Специалист по id',
                    parameters: [uuidParam('id', 'id специалиста')],
                    responses: { 200: { description: 'Специалист', ...json(envelope('Technician')) }, 404: errorResponse('Не найдено') },
                },
            },
            '/api/sites/{id}': {
                get: {
                    tags: ['sites'],
                    summary: 'Сводка по площадке',
                    parameters: [uuidParam('id', 'id площадки')],
                    responses: { 200: { description: 'Сводка', ...json({ type: 'object' }) }, 404: errorResponse('Не найдено') },
                },
            },
            '/api/reports/equipment': {
                get: {
                    tags: ['reports'],
                    summary: 'Отчёт по оборудованию',
                    parameters: [
                        ...paginationParams,
                        { name: 'minRequests', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
                    ],
                    responses: { 200: { description: 'Отчёт', ...json({ type: 'object' }) } },
                },
            },
            '/api/reports/sites': {
                get: {
                    tags: ['reports'],
                    summary: 'Отчёт по площадкам',
                    parameters: [...paginationParams],
                    responses: { 200: { description: 'Отчёт', ...json({ type: 'object' }) } },
                },
            },
        },
    };
}

export const openApiDocument = buildOpenApiDocument();

export const docsConfig = {
    enabled: config.docs.enabled,
    requireAuth: config.docs.requireAuth,
};