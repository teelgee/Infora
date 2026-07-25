import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  // session-cookie signing key (T-021, hardened T-206): required, no default —
  // the API refuses to boot without one. Generate with `openssl rand -hex 32`.
  SESSION_SECRET: z.string().min(1),
  // the chain's providers (T-046): Anthropic drafts, Voyage embeds queries
  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  // deployment security posture (ADR-0037 §1–§2): tier and default data
  // classification are deployment-level settings. Both default to the safe
  // out-of-the-box posture — standard tier carrying OFFICIAL.
  DEPLOYMENT_TIER: z.enum(['standard', 'sovereign']).default('standard'),
  DATA_CLASSIFICATION: z.enum(['official', 'secret']).default('official'),
  // the declared egress attributes of the model endpoints (ADR-0037 §3). All
  // four must be set for a route to be attributed; any unset means the route
  // is refused under a real tier (fail closed). The vendor/URL is procurement's
  // call (open item 3); these values are how a deployment asserts what it
  // procured, verifiable against the contract.
  MODEL_REGION: z.enum(['uk', 'eu', 'us']).optional(),
  MODEL_RETENTION: z.enum(['zero', 'transient']).optional(),
  MODEL_JURISDICTION: z.enum(['uk-sovereign', 'foreign-reachable']).optional(),
  MODEL_ELIGIBILITY: z.enum(['enterprise-zdr', 'self-hosted']).optional(),
  MODEL_CHAT_ENDPOINT: z.string().url().optional(),
  MODEL_EMBED_ENDPOINT: z.string().url().optional(),
});

export type ApiEnv = z.infer<typeof schema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid api environment: ${parsed.error.message}`);
  }
  return parsed.data;
}

// The route attributes only when the deployment declared all four (ADR-0037
// §3); otherwise undefined, which the router treats as unattributed and
// refuses. Honest by construction: a partially-declared endpoint is not
// trusted on the strength of what it did declare.
export function resolveRouteAttributes(env: ApiEnv):
  | { region: 'uk' | 'eu' | 'us'; retention: 'zero' | 'transient'; jurisdiction: 'uk-sovereign' | 'foreign-reachable'; eligibility: 'enterprise-zdr' | 'self-hosted' }
  | undefined {
  if (
    env.MODEL_REGION === undefined ||
    env.MODEL_RETENTION === undefined ||
    env.MODEL_JURISDICTION === undefined ||
    env.MODEL_ELIGIBILITY === undefined
  ) {
    return undefined;
  }
  return {
    region: env.MODEL_REGION,
    retention: env.MODEL_RETENTION,
    jurisdiction: env.MODEL_JURISDICTION,
    eligibility: env.MODEL_ELIGIBILITY,
  };
}
