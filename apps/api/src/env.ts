import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  // skeleton-auth scaffolding (T-021); replaced at the infra/security session
  SESSION_SECRET: z.string().min(1).default('dev-only-session-secret'),
});

export type ApiEnv = z.infer<typeof schema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid api environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
