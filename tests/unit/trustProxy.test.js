// Модульные тесты доверия обратному прокси: без БД, проверяется только то,
// как express вычисляет req.ip и req.protocol при наличии X-Forwarded-*.
import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

describe('Доверие обратному прокси (TRUST_PROXY)', () => {
    // Проверяется ровно то правило, что применяется к приложению: applyTrustProxy
    // настраивает express, дальше интересуют только req.ip / req.protocol / req.hostname.
    const loadApp = async (trustProxy) => {
        const previous = process.env.TRUST_PROXY;
        if (trustProxy === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = trustProxy;
        jest.resetModules();
        const { applyTrustProxy } = await import('../../src/app.js');
        const app = express();
        applyTrustProxy(app);
        app.get('/api/probe', (req, res) => res.json({ ip: req.ip, protocol: req.protocol, host: req.hostname }));
        return {
            app,
            restore: () => {
                if (previous === undefined) delete process.env.TRUST_PROXY;
                else process.env.TRUST_PROXY = previous;
            },
        };
    };

    const ipRouter = (app) => app;

    const supertest = async (app, headers) => request(app).get('/api/probe').set(headers);

    test('по умолчанию доверие выключено: req.ip — адрес сокета', async () => {
        const { app, restore } = await loadApp(undefined);
        try {
            const res = await supertest(app, {
                'X-Forwarded-For': '203.0.113.10',
                'X-Forwarded-Proto': 'https',
            });
            expect(res.status).toBe(200);
            expect(res.body.ip).not.toBe('203.0.113.10');
            expect(res.body.protocol).toBe('http');
        } finally {
            restore();
        }
    });

    test('TRUST_PROXY=1: реальный IP клиента из X-Forwarded-For', async () => {
        const { app, restore } = await loadApp('1');
        try {
            // nginx дописывает адрес клиента в X-Forwarded-For через $proxy_add_x_forwarded_for,
            // поэтому у клиента без подмены заголовка там ровно один адрес.
            const res = await supertest(ipRouter(app), { 'X-Forwarded-For': '203.0.113.10' });
            expect(res.status).toBe(200);
            expect(res.body.ip).toBe('203.0.113.10');
        } finally {
            restore();
        }
    });

    test('TRUST_PROXY=1: подделанный клиентом X-Forwarded-For игнорируется', async () => {
        const { app, restore } = await loadApp('1');
        try {
            // Клиент прислал 10.0.0.1, nginx дописал настоящий адрес 203.0.113.10.
            // При одном доверенном хопе express берёт крайний правый адрес — то есть
            // подделать IP для обхода rate limit нельзя.
            const res = await supertest(ipRouter(app), { 'X-Forwarded-For': '10.0.0.1, 203.0.113.10' });
            expect(res.body.ip).toBe('203.0.113.10');
        } finally {
            restore();
        }
    });

    test('TRUST_PROXY=1: протокол из X-Forwarded-Proto (важно для CORS и Secure-cookie)', async () => {
        const { app, restore } = await loadApp('1');
        try {
            const res = await supertest(ipRouter(app), { 'X-Forwarded-Proto': 'https' });
            expect(res.body.protocol).toBe('https');
        } finally {
            restore();
        }
    });

    test('TRUST_PROXY=1: Host прокси передаётся как hostname', async () => {
        const { app, restore } = await loadApp('1');
        try {
            const res = await supertest(ipRouter(app), { Host: 'api.example.com' });
            expect(res.body.host).toBe('api.example.com');
        } finally {
            restore();
        }
    });

    test('TRUST_PROXY=loopback: заголовки прокси учитываются только от localhost', async () => {
        const { app, restore } = await loadApp('loopback');
        try {
            // supertest подключается с 127.0.0.1 — этот адрес loopback доверяет,
            // поэтому заголовок прокси и применяется (в отличие от режима false).
            const res = await supertest(ipRouter(app), { 'X-Forwarded-For': '203.0.113.10' });
            expect(res.body.ip).toBe('203.0.113.10');
        } finally {
            restore();
        }
    });

    test('TRUST_PROXY=false совпадает с поведением по умолчанию', async () => {
        const { app, restore } = await loadApp('false');
        try {
            const res = await supertest(ipRouter(app), { 'X-Forwarded-For': '203.0.113.10' });
            expect(res.body.ip).not.toBe('203.0.113.10');
        } finally {
            restore();
        }
    });

    test('некорректное значение TRUST_PROXY падает на старте, а не молча', async () => {
        const previous = process.env.TRUST_PROXY;
        process.env.TRUST_PROXY = 'yes-please';
        jest.resetModules();
        try {
            await expect(import('../../src/config/index.js')).rejects.toThrow(/Некорректное значение TRUST_PROXY/);
        } finally {
            if (previous === undefined) delete process.env.TRUST_PROXY;
            else process.env.TRUST_PROXY = previous;
            jest.resetModules();
        }
    });
});