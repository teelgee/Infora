import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://infora:infora@localhost:5432/infora'), // the docker-compose dev substrate
});

export type DbEnv = z.infer<typeof schema>;

export function loadDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid database environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
