// The ingest entrypoint: `pnpm --filter @infora/data run ingest` (loads the
// repo-root .env; needs VOYAGE_API_KEY and ANTHROPIC_API_KEY).
import { z } from 'zod';
import { createDb } from '@infora/db';
import {
  AnthropicChatAdapter,
  Router,
  VoyageEmbeddingAdapter,
  securityForTier,
  type RouteAttributes,
} from '@infora/model';
import { ingestVersions } from './ingest';

// ingest embeds under the deployment's security posture too (ADR-0037 §5): the
// invariant admits no exception, so the router refuses a non-conforming route
// here exactly as it does for the chat path.
const env = z
  .object({
    VOYAGE_API_KEY: z.string().min(1),
    DEPLOYMENT_TIER: z.enum(['standard', 'sovereign']).default('standard'),
    DATA_CLASSIFICATION: z.enum(['official', 'secret']).default('official'),
    MODEL_REGION: z.enum(['uk', 'eu', 'us']).optional(),
    MODEL_RETENTION: z.enum(['zero', 'transient']).optional(),
    MODEL_JURISDICTION: z.enum(['uk-sovereign', 'foreign-reachable']).optional(),
    MODEL_ELIGIBILITY: z.enum(['enterprise-zdr', 'self-hosted']).optional(),
    MODEL_EMBED_ENDPOINT: z.string().url().optional(),
  })
  .safeParse(process.env);
if (!env.success) {
  throw new Error('VOYAGE_API_KEY is required — set it in the repo-root .env');
}

const attributes: RouteAttributes | undefined =
  env.data.MODEL_REGION && env.data.MODEL_RETENTION && env.data.MODEL_JURISDICTION && env.data.MODEL_ELIGIBILITY
    ? {
        region: env.data.MODEL_REGION,
        retention: env.data.MODEL_RETENTION,
        jurisdiction: env.data.MODEL_JURISDICTION,
        eligibility: env.data.MODEL_ELIGIBILITY,
      }
    : undefined;

const router = new Router(
  AnthropicChatAdapter.fromEnv(),
  new VoyageEmbeddingAdapter({
    apiKey: env.data.VOYAGE_API_KEY,
    ...(attributes !== undefined && { attributes }),
    ...(env.data.MODEL_EMBED_ENDPOINT !== undefined && { endpoint: env.data.MODEL_EMBED_ENDPOINT }),
  }),
  securityForTier(env.data.DEPLOYMENT_TIER, env.data.DATA_CLASSIFICATION),
);

const { db, pool } = createDb();
const summary = await ingestVersions(db, router);
console.log(
  `ingested ${summary.versions} versions → ${summary.chunks} chunks, embedded by ${summary.model}`,
);
await pool.end();
