import { sql } from 'drizzle-orm';
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

/**
 * T-247 — run `fn` inside a transaction whose Postgres session declares the
 * project it is entitled to, so row-level security can enforce the boundary
 * beneath the application's own pre-filters (finding F6).
 *
 * The application still applies its SQL pre-filters; this is the backstop for
 * the query nobody reviewed. Without the setting, RLS-protected reads return
 * NOTHING — the policy fails closed rather than open, which is the whole point:
 * a future query written somewhere else against a protected table returns zero
 * rows instead of the corpus.
 *
 * `set_config(..., true)` is transaction-local, so the setting cannot leak to
 * the next borrower of a pooled connection.
 */
export async function withProjectScope<T>(
  db: Db,
  projectId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('infora.project_id', ${projectId}, true)`);
    return fn(tx as unknown as Db);
  });
}
