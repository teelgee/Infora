import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb } from './client.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const { db, pool } = createDb();
await migrate(db, { migrationsFolder });
console.log('migrations applied clean');
await pool.end();
