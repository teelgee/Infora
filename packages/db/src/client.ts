import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadDbEnv } from './env.js';
import * as schema from './schema/index.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(databaseUrl = loadDbEnv().DATABASE_URL) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
