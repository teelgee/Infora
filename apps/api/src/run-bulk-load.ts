// T-303 — the bulk load's entry point: `pnpm --filter @infora/api run bulk-load`.
//
// A CLI, deliberately, and the same reasoning as `run-ingest.ts`: the load is
// an operator action that is allowed to take hours
// ([operating-envelope.md](../../../docs/build/operating-envelope.md)), and
// nothing that takes hours belongs on a request path. There is no endpoint for
// this and there should not be one until someone can say what the surface does
// while it runs.
//
// It is also the act v1.md gates on the DPA: *"the firm's documents go into the
// pilot environment's S3 bucket only, through the bulk-load path, as an
// operator action and after the DPA with the firm is signed."* The first real
// load is therefore also the first real test, which is the reason the refusals
// are loud and the report names every document it did not load.
import { z } from 'zod';
import { createDb } from '@infora/db';
import {
  AnthropicChatAdapter,
  Router,
  VoyageEmbeddingAdapter,
  securityForTier,
  type RouteAttributes,
} from '@infora/model';
import { bulkLoad, describeOutcome, describeReport } from './bulk-load';

const usage = `usage: pnpm --filter @infora/api run bulk-load -- \\
    --project <uuid> --organisation <uuid> --directory <path>

  --project       the project whose library receives the corpus
  --organisation  whose material this is; it becomes the container's producing
                  organisation, which is what the wall reads
  --directory     a directory of documents (sub-directories are walked)

Re-running is safe and is how a partial load is resumed: what already landed is
skipped, what half-landed is finished, and what was refused is refused again by
name.`;

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

const args = z
  .object({
    project: z.uuid(),
    organisation: z.uuid(),
    directory: z.string().min(1),
  })
  .safeParse({
    project: flag('project'),
    organisation: flag('organisation'),
    directory: flag('directory'),
  });
if (!args.success) {
  console.error(usage);
  process.exit(2);
}

// the load embeds under the deployment's security posture like every other
// path (ADR-0037 §5) — the invariant admits no exception for an operator
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
const report = await bulkLoad(
  { db, router },
  {
    projectId: args.data.project,
    organisationId: args.data.organisation,
    directory: args.data.directory.replace(/\/+$/, ''),
    // printed as it happens: a load that prints nothing for two hours is
    // indistinguishable from a load that has hung
    onOutcome: (outcome) => console.log(describeOutcome(outcome)),
  },
);
console.log(`\n${describeReport(report)}`);
await pool.end();
// a non-zero exit is the difference between "the corpus is loaded" and "the
// corpus is loaded except for the forty nobody was told about"
process.exit(report.refused > 0 ? 1 : 0);
