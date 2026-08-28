import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  // session-cookie signing key (T-021, hardened T-206): required, no default —
  // the API refuses to boot without one. Generate with `openssl rand -hex 32`.
  SESSION_SECRET: z.string().min(1),
  // CORS allowlist (T-216), comma-separated origins. Unset means the local
  // dev/e2e web origins only — in dev the web app rides the vite proxy
  // (same-origin), so the default stays strict.
  ALLOWED_ORIGINS: z.string().optional(),
  // request throttles (T-217); unset means the in-code defaults
  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_RUNS_PER_MINUTE: z.coerce.number().int().positive().optional(),
  // the chain's providers (T-046): Anthropic drafts, Voyage embeds queries
  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  // deployment security posture (ADR-0037 §1–§2): tier and default data
  // classification are deployment-level settings. Both default to the safe
  // out-of-the-box posture — standard tier carrying OFFICIAL.
  // T-283 — the Lens the picker preselects. Config, not code: which register a
  // firm's people start in is a deployment decision, and baking in
  // `planning-environmental` would make Infora's view of the modal user into
  // everyone's default. Unset means no Lens — the shared core alone.
  DEFAULT_LENS_ID: z.string().min(1).optional(),
  // T-265 — which declared workflow an Ask turn runs. Config, not code.
  ASK_WORKFLOW_ID: z.string().min(1).optional(),
  // T-251 — the two session clocks (finding F4). Both are deployment
  // configuration because the right numbers are a security-session decision,
  // not a build-time one. Unset falls through to the modest in-code posture,
  // which is still a bound where the skeleton had none at all.
  SESSION_ABSOLUTE_HOURS: z.coerce.number().positive().optional(),
  SESSION_IDLE_MINUTES: z.coerce.number().positive().optional(),
  // T-254 — provider rates per model id, as JSON. Deployment configuration and
  // nothing else: provider pricing changes without warning, moves per region
  // and is negotiated per customer, so a number compiled into the repository
  // would be wrong somewhere from the day it was written. Unset means every
  // step records `cost: null` — UNPRICED, which is reportable, rather than 0,
  // which reads as free (finding F7).
  MODEL_RATES: z.string().optional(),
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
