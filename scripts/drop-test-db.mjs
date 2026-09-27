import 'dotenv/config';
import pg from 'pg';
import environments from '../src/config/sequelize.config.cjs';

const target = environments.test;

if (!/test/i.test(target.database)) {
    throw new Error(`Отказываюсь удалять базу без "test" в имени: "${target.database}"`);
}

const client = new pg.Client({
    host: target.host,
    port: Number(target.port),
    user: target.username,
    password: target.password,
    database: 'postgres',
});

await client.connect();
try {
    await client.query(`DROP DATABASE IF EXISTS "${target.database}" WITH (FORCE)`);
    process.stdout.write(`[test] база ${target.database} удалена\n`);
} finally {
    await client.end();
}
