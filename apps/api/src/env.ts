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
  // T-265, resemantised by T-266 — an OVERRIDE pinning every Ask turn to one
  // declared workflow, skipping classification. Unset (the shipped default)
  // means a turn is CLASSIFIED rather than assigned.
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
  // T-453 — in-browser editing (ADR-0043). WOPI_HOST_URL is this API's base
  // URL as the EDITING ENGINE reaches it (inside docker that is not localhost);
  // unset means the API's own localhost address. WOPI_TOKEN_MINUTES bounds an
  // engine's pass — and a pass never outlives the sign-in that asked for it.
  WOPI_HOST_URL: z.string().url().optional(),
  WOPI_TOKEN_MINUTES: z.coerce.number().int().positive().max(600).optional(),
  // T-454 — the editing engine's base URL as this API reaches it (its WOPI
  // discovery lives under it), and the web app's origin the engine may post
  // messages to. Unset EDITOR_ENGINE_URL means no in-browser editing: the
  // pane says so in words and nothing else changes.
  EDITOR_ENGINE_URL: z.string().url().optional(),
  EDITOR_POST_MESSAGE_ORIGIN: z.string().url().optional(),
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
  // T-285 — the fallback chain, as JSON. Deployment configuration: a chain is
  // a list of PROCUREMENTS, and which endpoints a firm has bought is not
  // something the repository can know. Unset — the shipped default — means the
  // single route the four MODEL_* attributes above describe, and the chain is
  // one long, which is what every deployment has had until now.
  MODEL_CHAT_ROUTES: z.string().optional(),
  // The Wave 5 design reference's `defaults {fallback_attempts, timeout_ms}`.
  // Both bound a bad day rather than tune a good one.
  MODEL_FALLBACK_ATTEMPTS: z.coerce.number().int().positive().optional(),
  MODEL_ATTEMPT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
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

/**
 * T-285 — parse the declared fallback chain.
 *
 * Strict, and refusing at boot, for T-254's reason restated: a chain with a
 * typo in it is a route that silently never conforms, and the symptom is a
 * deployment that fails closed on every call with no clue why. Better to
 * refuse to start.
 *
 * **A route's four egress attributes are required per route, never inherited
 * from the MODEL_* defaults.** Inheritance is what makes a second procurement
 * quietly adopt the first one's compliance claims — which is the exact failure
 * ADR-0037 §3's unattributed default exists to prevent, arriving through a
 * convenience.
 *
 * `endpoint` is BOTH the audited egress fact and the client's base URL,
 * deliberately: two fields would let a deployment record an endpoint the call
 * never touched, and an egress record that names the wrong host is worse than
 * none.
 */
export type ChatRouteConfig = {
  modelId: string;
  endpoint: string;
  apiKey: string;
  serves?: Array<'triage' | 'mid' | 'frontier'>;
  attributes: {
    region: 'uk' | 'eu' | 'us';
    retention: 'zero' | 'transient';
    jurisdiction: 'uk-sovereign' | 'foreign-reachable';
    eligibility: 'enterprise-zdr' | 'self-hosted';
  };
};

const routeSchema = z.object({
  modelId: z.string().min(1),
  endpoint: z.string().url(),
  /** the env var holding THIS route's credential; a second provider is a second key */
  apiKeyEnv: z.string().min(1).default('ANTHROPIC_API_KEY'),
  /** the model tiers this route is configured to serve (T-284). Omitted = all. */
  serves: z.array(z.enum(['triage', 'mid', 'frontier'])).nonempty().optional(),
  region: z.enum(['uk', 'eu', 'us']),
  retention: z.enum(['zero', 'transient']),
  jurisdiction: z.enum(['uk-sovereign', 'foreign-reachable']),
  eligibility: z.enum(['enterprise-zdr', 'self-hosted']),
});

export function parseChatRoutes(
  source: string,
  env: NodeJS.ProcessEnv = process.env,
): ChatRouteConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`MODEL_CHAT_ROUTES is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
  const routes = z.array(routeSchema).nonempty().safeParse(parsed);
  if (!routes.success) {
    throw new Error(
      `MODEL_CHAT_ROUTES must be a non-empty array of declared routes: ${routes.error.message}`,
    );
  }
  return routes.data.map((route) => {
    const apiKey = env[route.apiKeyEnv];
    if (apiKey === undefined || apiKey === '') {
      throw new Error(
        `MODEL_CHAT_ROUTES: route '${route.endpoint}' names ${route.apiKeyEnv}, which is not set`,
      );
    }
    return {
      modelId: route.modelId,
      endpoint: route.endpoint,
      apiKey,
      ...(route.serves !== undefined && { serves: [...route.serves] }),
      attributes: {
        region: route.region,
        retention: route.retention,
        jurisdiction: route.jurisdiction,
        eligibility: route.eligibility,
      },
    };
  });
}
