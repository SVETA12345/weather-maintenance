import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../docs/openapi.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middlewares/auth.js';

export const docsRoutes = Router();

// Спецификация нужна и Swagger UI, и внешним потребителям (клиенты, Postman).
docsRoutes.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
});

// Ресурсы UI (css, js, favicon) отдаются из node_modules, а страница — на самом
// /api/docs без редиректа на /api/docs/: путь эксплуатации указывает именно /api/docs.
// Поэтому setup объявлен до serve: в serve есть middleware, уводящий '/' на '/'.
const requireDocsAuth = config.docs.requireAuth ? requireAuth : (_req, _res, next) => next();

docsRoutes.get(
    '/',
    requireDocsAuth,
    swaggerUi.setup(openApiDocument, {
        customSiteTitle: 'Weather Maintenance API',
        swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
);

docsRoutes.use(swaggerUi.serve);