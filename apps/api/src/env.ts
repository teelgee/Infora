import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
});

export type ApiEnv = z.infer<typeof schema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid api environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
