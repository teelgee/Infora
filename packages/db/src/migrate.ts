import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb } from './client.js';
import { loadDbEnv } from './env.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// T-247 — migrations run as the OWNER, not as the application role: they create
// and alter objects `infora_app` deliberately may not.
const { db, pool } = createDb(loadDbEnv().MIGRATE_DATABASE_URL);
await migrate(db, { migrationsFolder });
console.log('migrations applied clean');
await pool.end();
