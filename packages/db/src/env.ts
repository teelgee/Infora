import { z } from 'zod';

const schema = z.object({
  // T-247 — the APPLICATION connection, as the unprivileged `infora_app` role.
  // Row-level security is bypassed entirely by a superuser, so connecting as
  // the owner would make the policies theatre. Migration 0034 creates the role.
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://infora_app:infora_app@localhost:5432/infora'),
  // The OWNER connection, used only to run migrations (which create and alter
  // objects the application role may not). Kept separate so the privilege
  // difference is visible in configuration rather than implied.
  MIGRATE_DATABASE_URL: z
    .string()
    .url()
    .default('postgres://infora:infora@localhost:5432/infora'),
});

export type DbEnv = z.infer<typeof schema>;

export function loadDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid database environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
