import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import environments from '../src/config/sequelize.config.cjs';

const target = environments.test;

if (!/^[A-Za-z0-9_]+$/.test(target.database)) {
    throw new Error(`Недопустимое имя тестовой базы: "${target.database}"`);
}
if (!/test/i.test(target.database)) {
    throw new Error(`Тесты требуют БД с "test" в имени, получено: "${target.database}"`);
}

async function createDatabaseIfMissing() {
    const client = new pg.Client({
        host: target.host,
        port: Number(target.port),
        user: target.username,
        password: target.password,
        database: 'postgres',
    });
    await client.connect();
    try {
        const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [target.database]);
        if (rowCount === 0) {
            await client.query(`CREATE DATABASE "${target.database}"`);
            process.stdout.write(`[test] создана база ${target.database}\n`);
        }
    } finally {
        await client.end();
    }
}

function migrate() {
    execFileSync(process.execPath, ['node_modules/sequelize-cli/lib/sequelize', 'db:migrate', '--env', 'test'], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' },
    });
}

export default async function globalSetup() {
    await createDatabaseIfMissing();
    migrate();
}
