// Дополняет Postman-коллекцию: аутентификация, справочник специалистов,
// эксплуатационные endpoints. Запуск: node scripts/update-postman.mjs
import fs from 'node:fs';

const PATH = new URL('../docs/postman/collection.json', import.meta.url);
const collection = JSON.parse(fs.readFileSync(PATH, 'utf8'));

const bearer = { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] };

// Скрипт идемпотентен: разделы «Аутентификация», «Специалисты» и «Мониторинг и
// документация» пересоздаются, остальные остаются нетронутыми. Запуск после
// изменения src/docs/openapi.js или authRoutes имеет смысл, чтобы запросы и
// автотесты коллекции не разошлись с API.

// Токен хранится в переменной коллекции: после логина остальные запросы
// авторизуются сами.
collection.auth = bearer;

const withToken = (req) => ({ auth: bearer, ...req });

function saveResponseToken() {
  return [
    "const body = pm.response.json();",
    "pm.test('Есть accessToken', () => pm.expect(body.data).to.have.property('accessToken'));",
    'if (body.data && body.data.accessToken) pm.collectionVariables.set("accessToken", body.data.accessToken);',
  ];
}

const authFolder = {
  name: '0. Аутентификация',
  item: [
    {
      name: 'Регистрация (роль по умолчанию viewer)',
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify(
            { email: 'postman-new@example.com', password: 'postman-pass-2026' },
            null,
            2,
          ),
        },
        url: { raw: '{{baseUrl}}/api/auth/register', host: ['{{baseUrl}}'], path: ['api', 'auth', 'register'] },
      },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 201', () => pm.expect(pm.response.code).to.eql(201));",
              'const body = pm.response.json();',
              "pm.test('Роль по умолчанию viewer', () => pm.expect(body.data.role).to.eql('viewer'));",
              "pm.test('Пароль не возвращается', () => pm.expect(body.data).to.not.have.property('password'));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Вход администратором',
      request: withToken({
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ email: '{{loginEmail}}', password: '{{loginPassword}}' }, null, 2),
        },
        url: { raw: '{{baseUrl}}/api/auth/login', host: ['{{baseUrl}}'], path: ['api', 'auth', 'login'] },
      }),
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              ...saveResponseToken(),
              'pm.test(',
              "    'Роль и email в ответе',",
              '    () => {',
              '        pm.expect(body.data.user).to.have.property("role");',
              '        pm.expect(body.data.user).to.have.property("email");',
              '    },',
              ');',
              "pm.test('Refresh-cookie установлена', () => pm.expect(pm.response.headers.has('Set-Cookie')).to.be.true);",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Текущий пользователь',
      request: withToken({ method: 'GET', header: [], url: { raw: '{{baseUrl}}/api/auth/me', host: ['{{baseUrl}}'], path: ['api', 'auth', 'me'] } }),
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              'const body = pm.response.json();',
              "pm.test('Email совпадает с loginEmail', () => pm.expect(body.data.email).to.eql(pm.collectionVariables.get('loginEmail')));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Вход с неверным паролем (401)',
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ email: '{{loginEmail}}', password: 'wrong-password' }, null, 2),
        },
        url: { raw: '{{baseUrl}}/api/auth/login', host: ['{{baseUrl}}'], path: ['api', 'auth', 'login'] },
      },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 401', () => pm.expect(pm.response.code).to.eql(401));",
              "pm.test('Код INVALID_CREDENTIALS', () => pm.expect(pm.response.json().error.code).to.eql('INVALID_CREDENTIALS'));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Без токена на защищённый маршрут (401)',
      request: {
        method: 'GET',
        auth: { type: 'noauth' },
        header: [],
        url: { raw: '{{baseUrl}}/api/auth/me', host: ['{{baseUrl}}'], path: ['api', 'auth', 'me'] },
      },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 401', () => pm.expect(pm.response.code).to.eql(401));",
              "pm.test('Код UNAUTHORIZED', () => pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED'));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Выход (отзыв refresh-токена)',
      request: withToken({ method: 'POST', header: [], url: { raw: '{{baseUrl}}/api/auth/logout', host: ['{{baseUrl}}'], path: ['api', 'auth', 'logout'] } }),
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              'pm.test("Статус 204", () => pm.expect(pm.response.code).to.eql(204));',
              'pm.collectionVariables.clear("accessToken");',
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
  ],
};

const techniciansFolder = {
  name: '7. Специалисты',
  item: [
    {
      name: 'Список специалистов',
      request: withToken({
        method: 'GET',
        header: [],
        url: {
          raw: '{{baseUrl}}/api/technicians?page=1&limit=20&sortBy=fullName',
          host: ['{{baseUrl}}'],
          path: ['api', 'technicians'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '20' },
            { key: 'sortBy', value: 'fullName' },
          ],
        },
      }),
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              'const body = pm.response.json();',
              "pm.test('Список и meta.total', () => { pm.expect(body.data).to.be.an('array'); pm.expect(body.meta.total).to.be.a('number'); });",
              'if (body.data.length) pm.collectionVariables.set("technicianId", body.data[0].id);',
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Специалист по id',
      request: withToken({
        method: 'GET',
        header: [],
        url: { raw: '{{baseUrl}}/api/technicians/{{technicianId}}', host: ['{{baseUrl}}'], path: ['api', 'technicians', '{{technicianId}}'] },
      }),
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              'const body = pm.response.json();',
              "pm.test('Есть fullName и специализация', () => { pm.expect(body.data).to.have.property('fullName'); pm.expect(body.data).to.have.property('specialization'); });",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Несуществующий специалист (404)',
      request: withToken({
        method: 'GET',
        header: [],
        url: { raw: '{{baseUrl}}/api/technicians/{{fakeId}}', host: ['{{baseUrl}}'], path: ['api', 'technicians', '{{fakeId}}'] },
      }),
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 404', () => pm.expect(pm.response.code).to.eql(404));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
  ],
};

const opsFolder = {
  name: '8. Мониторинг и документация',
  item: [
    {
      name: 'Живость (live)',
      request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/api/health/live', host: ['{{baseUrl}}'], path: ['api', 'health', 'live'] } },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              "pm.test('status=up', () => pm.expect(pm.response.json().data.status).to.eql('up'));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Готовность (ready)',
      request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/api/health/ready', host: ['{{baseUrl}}'], path: ['api', 'health', 'ready'] } },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              '// 200 — БД доступна, 503 — недоступна или идёт остановка сервиса.',
              'pm.expect([200, 503]).to.include(pm.response.code);',
              "if (pm.response.code === 200) pm.test('ready=true', () => pm.expect(pm.response.json().data.ready).to.be.true);",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Прикладные агрегаты (metrics JSON)',
      request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/api/health/metrics', host: ['{{baseUrl}}'], path: ['api', 'health', 'metrics'] } },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              'const body = pm.response.json();',
              "pm.test('Есть счётчики заявок и нагрузки', () => { pm.expect(body.data).to.have.property('requestsByStatus'); pm.expect(body.data).to.have.property('requestsByPriority'); });",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Метрики Prometheus (text)',
      request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/metrics', host: ['{{baseUrl}}'], path: ['metrics'] } },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              "pm.test('Content-Type text/plain', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('text/plain'));",
              'const body = pm.response.text();',
              "pm.test('Есть счётчик запросов', () => pm.expect(body).to.include('http_requests_total'));",
              "pm.test('Есть прикладная метрика заявок', () => pm.expect(body).to.include('maintenance_requests_by_status'));",
              "pm.test('Есть gauge готовности', () => pm.expect(body).to.include('service_up'));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Спецификация OpenAPI',
      request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/api/docs/openapi.json', host: ['{{baseUrl}}'], path: ['api', 'docs', 'openapi.json'] } },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              'const spec = pm.response.json();',
              "pm.test('OpenAPI 3.0.3', () => pm.expect(spec.openapi).to.eql('3.0.3'));",
              "pm.test('Есть пути /api/requests и /api/auth/login', () => { pm.expect(Object.keys(spec.paths)).to.include('/api/requests'); pm.expect(Object.keys(spec.paths)).to.include('/api/auth/login'); });",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Swagger UI',
      request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/api/docs', host: ['{{baseUrl}}'], path: ['api', 'docs'] } },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              "pm.test('Страница Swagger UI', () => pm.expect(pm.response.text()).to.include('swagger-ui'));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
    {
      name: 'Состояние алертов Prometheus',
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: '{{prometheusUrl}}/api/v1/query?query=ALERTS',
          host: ['{{prometheusUrl}}'],
          path: ['api', 'v1', 'query'],
          query: [{ key: 'query', value: 'ALERTS' }],
        },
      },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('Статус 200', () => pm.expect(pm.response.code).to.eql(200));",
              "pm.test('Ответ Prometheus', () => pm.expect(pm.response.json().status).to.eql('success'));",
              "pm.test('Есть хотя бы одно активное оповещение', () => pm.expect(pm.response.json().data.result.length).to.be.above(0));",
            ],
            type: 'text/javascript',
          },
        },
      ],
    },
  ],
};

const varNames = collection.variable.map((v) => v.key);
const addVar = (key, value) => {
  if (varNames.includes(key)) return;
  collection.variable.push({ key, value, type: 'string' });
};
addVar('accessToken', '');
addVar('loginEmail', 'admin@example.com');
addVar('loginPassword', 'admin-demo-2026');
addVar('technicianId', '');
addVar('prometheusUrl', 'http://localhost:9090');

// Повторный запуск не должен дублировать разделы: сначала убираем прежние.
const GENERATED = [authFolder.name, techniciansFolder.name, opsFolder.name];
const kept = collection.item.filter((it) => !GENERATED.includes(it.name));
collection.item = [authFolder, ...kept, techniciansFolder, opsFolder];

fs.writeFileSync(PATH, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`коллекция обновлена: ${collection.item.length} разделов, переменных: ${collection.variable.length}`);